import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Request,
  type Route,
} from "playwright";
import type { AnalysisErrorCode, AnalysisStage } from "@pink-bridge/shared";
import {
  BLOCKED_HEADER,
  startEgressProxy,
  type EgressEvents,
  type EgressProxy,
} from "./egressProxy.js";
import {
  collectLinks,
  observe,
  probeForms,
  type FormProbe,
  type MutationGuard,
  type PageObservations,
} from "./probes.js";
import type { RawAxeResults } from "./normalize.js";
import { normalizeHostname, systemResolver, type Resolver } from "./ssrf.js";
import { DEFAULT_ALLOWED_PORTS } from "./urlPolicy.js";

export const DEMO_ORIGIN = "https://demo.pinkbridge.test";

export const DEFAULT_LIMITS = {
  navigationMs: 15_000,
  totalMs: 60_000,
  maxResponseBytes: 5 * 1024 * 1024,
} as const;

export type RunLimits = { readonly [K in keyof typeof DEFAULT_LIMITS]: number };

export class AnalysisRunError extends Error {
  constructor(
    readonly code: AnalysisErrorCode,
    message: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "AnalysisRunError";
  }
}

export type RunSource =
  | { readonly kind: "url"; readonly url: URL }
  | {
      readonly kind: "demo";
      readonly fixturePath: string;
      /** Carpeta de un sitio de demostración: cada ruta se sirve desde aquí. */
      readonly siteRoot?: string;
    };

/** Opciones que definen la red y el navegador; se comparten entre las páginas de una sesión. */
export interface SessionOptions {
  readonly resolve?: Resolver;
  readonly allowedPorts?: readonly number[];
  readonly limits?: Partial<RunLimits>;
  /**
   * SOLO PRUEBAS. Hosts exentos del guardia SSRF para probar la ruta de éxito contra
   * un servidor local. No se expone desde la API ni desde la configuración.
   */
  readonly testOnlyTrustedHosts?: readonly string[];
}

/**
 * Proxy de salida y navegador compartidos por varias páginas. Cada página sigue en su propio
 * contexto aislado; lo que se comparte es el arranque de Chromium, que es lo caro.
 */
export interface BrowserSession {
  readonly proxy: EgressProxy;
  readonly browser: Browser;
  readonly limits: RunLimits;
  close(): Promise<void>;
}

export interface RunOptions extends SessionOptions {
  readonly source: RunSource;
  readonly onStage?: (stage: AnalysisStage) => void;
  /** Sesión ya abierta. Si se omite, la auditoría abre y cierra la suya. */
  readonly session?: BrowserSession;
  /** Tamaño de ventana. Por defecto, escritorio 1280×800. */
  readonly viewport?: { readonly width: number; readonly height: number };
  /** Ejecuta sondas: enlaces, formularios (con mutaciones interceptadas). */
  readonly probe?: boolean;
  /** Ruta inicial dentro del origen de demostración (por defecto "/"). */
  readonly startPath?: string;
}

export interface RunResult {
  readonly raw: RawAxeResults;
  readonly finalUrl: string;
  readonly durationMs: number;
  /** Hosts de peticiones bloqueadas por la política de red o no resueltos (informativo). */
  readonly blockedHosts: readonly string[];
  readonly observations: PageObservations;
  /** Enlaces de la página (solo con probe). */
  readonly links: readonly string[];
  /** Sondas de formularios (solo con probe). */
  readonly forms: readonly FormProbe[];
}

interface RunContext {
  readonly events: EgressEvents;
  readonly startHost: string | null;
  timedOut: boolean;
}

const DEMO_MIME: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const HTML_CONTENT_TYPE = /text\/html|application\/xhtml\+xml/i;

async function routeRequest(
  route: Route,
  request: Request,
  source: RunSource,
  guard: MutationGuard,
): Promise<void> {
  let target: URL;
  try {
    target = new URL(request.url());
  } catch {
    await route.abort("failed");
    return;
  }

  if (guard.active && request.method() !== "GET") {
    guard.intercepted += 1;
    await route.fulfill({ status: 204, body: "" });
    return;
  }

  if (source.kind === "demo" && target.origin === DEMO_ORIGIN) {
    const file = demoFile(source, target.pathname);
    if (file === null) {
      await route.fulfill({
        status: 404,
        contentType: "text/html; charset=utf-8",
        body: "<!doctype html><title>404</title>",
      });
      return;
    }
    const body = await readFile(file);
    const contentType = DEMO_MIME[extname(file).toLowerCase()] ?? "text/html; charset=utf-8";
    await route.fulfill({ status: 200, contentType, body });
    return;
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    await route.abort("blockedbyclient");
    return;
  }

  // El resto de peticiones sale por el proxy de salida, que valida cada conexión.
  await route.continue();
}

/** Resuelve la ruta del demo a un fichero, sin salir de la carpeta del sitio. */
function demoFile(
  source: { fixturePath: string; siteRoot?: string },
  pathname: string,
): string | null {
  if (source.siteRoot === undefined) {
    return pathname === "/" ? source.fixturePath : null;
  }
  const relative = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
  const file = resolve(source.siteRoot, `.${decodeURIComponent(relative)}`);
  return file.startsWith(`${resolve(source.siteRoot)}/`) && existsSync(file) ? file : null;
}

function mapError(
  error: unknown,
  context: RunContext,
  phase: "browser" | "navigation" | "checks",
): AnalysisRunError {
  if (error instanceof AnalysisRunError) {
    return error;
  }
  const { events, startHost } = context;

  if (context.timedOut) {
    return new AnalysisRunError(
      "analysis_timeout",
      "El análisis superó el tiempo máximo permitido.",
    );
  }
  if (events.tooLarge) {
    return new AnalysisRunError(
      "response_too_large",
      "Un recurso de la página supera el tamaño máximo.",
    );
  }
  if (startHost !== null && events.dnsFailedHosts.has(startHost)) {
    return new AnalysisRunError("dns_error", "No se pudo resolver el nombre de host.");
  }
  if (startHost !== null && events.blockedHosts.has(startHost)) {
    return new AnalysisRunError("blocked_destination", "El destino no está permitido.");
  }

  const message = error instanceof Error ? error.message : "";
  const name = error instanceof Error ? error.name : "";

  if (phase === "navigation") {
    if (name === "TimeoutError") {
      return new AnalysisRunError("navigation_timeout", "La página tardó demasiado en cargar.");
    }
    if (message.includes("ERR_CERT")) {
      return new AnalysisRunError(
        "certificate_error",
        "El certificado HTTPS de la página no es válido.",
      );
    }
    if (message.includes("ERR_NAME_NOT_RESOLVED")) {
      return new AnalysisRunError("dns_error", "No se pudo resolver el nombre de host.");
    }
    if (
      message.includes("ERR_TUNNEL_CONNECTION_FAILED") ||
      message.includes("ERR_BLOCKED_BY_CLIENT")
    ) {
      if (events.blockedHosts.size > 0) {
        return new AnalysisRunError("blocked_destination", "El destino no está permitido.");
      }
    }
    return new AnalysisRunError("navigation_failed", "No se pudo cargar la página.");
  }

  if (phase === "checks") {
    return new AnalysisRunError(
      "checks_error",
      "Las comprobaciones de accesibilidad no pudieron completarse.",
    );
  }
  return new AnalysisRunError("browser_error", "No se pudo preparar el navegador de análisis.");
}

async function closeQuietly(target: { close(): Promise<void> } | null): Promise<void> {
  if (!target) {
    return;
  }
  try {
    await target.close();
  } catch {
    // El navegador o el contexto puede estar ya cerrado por el temporizador de tiempo total.
  }
}

/**
 * Abre el proxy de salida y lanza Chromium una vez. El proxy exige credenciales aleatorias,
 * de modo que solo este navegador puede usarlo.
 */
export async function openSession(options: SessionOptions): Promise<BrowserSession> {
  const limits: RunLimits = { ...DEFAULT_LIMITS, ...options.limits };
  const proxy = await startEgressProxy({
    resolve: options.resolve ?? systemResolver,
    allowedPorts: options.allowedPorts ?? DEFAULT_ALLOWED_PORTS,
    trustedHosts: new Set((options.testOnlyTrustedHosts ?? []).map(normalizeHostname)),
    maxBytes: limits.maxResponseBytes,
  });

  let browser: Browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--force-webrtc-ip-handling-policy=disable_non_proxied_udp"],
      chromiumSandbox: true,
      proxy: {
        server: `http://127.0.0.1:${String(proxy.port)}`,
        bypass: "<-loopback>",
        username: proxy.username,
        password: proxy.password,
      },
    });
  } catch (error) {
    await proxy.close();
    throw mapError(error, { events: proxy.events, startHost: null, timedOut: false }, "browser");
  }

  return {
    proxy,
    browser,
    limits,
    close: async () => {
      await closeQuietly(browser);
      await proxy.close();
    },
  };
}

/**
 * Ejecuta una auditoría axe-core sobre una única página en un contexto de navegador aislado.
 * Todo el tráfico de red de la página sale por un proxy local que valida cada conexión
 * (documento, redirecciones y subrecursos), resuelve DNS una sola vez y conecta a la IP validada.
 */
export async function runAnalysis(options: RunOptions): Promise<RunResult> {
  if (options.session !== undefined) {
    return runPage(options, options.session);
  }
  options.onStage?.("preparing_browser");
  const session = await openSession(options);
  try {
    return await runPage(options, session);
  } finally {
    await session.close();
  }
}

async function runPage(options: RunOptions, session: BrowserSession): Promise<RunResult> {
  const { proxy, browser, limits } = session;
  const startedAt = Date.now();
  const context: RunContext = {
    events: proxy.events,
    startHost:
      options.source.kind === "url" ? normalizeHostname(options.source.url.hostname) : null,
    timedOut: false,
  };

  let browserContext: BrowserContext | null = null;
  const totalTimer = setTimeout(() => {
    context.timedOut = true;
    void closeQuietly(browserContext);
  }, limits.totalMs);

  try {
    browserContext = await browser.newContext({
      serviceWorkers: "block",
      acceptDownloads: false,
      permissions: [],
      ignoreHTTPSErrors: false,
      viewport: options.viewport ?? { width: 1280, height: 800 },
      locale: "es-ES",
    });

    const source = options.source;
    const guard: MutationGuard = { active: false, intercepted: 0 };
    await browserContext.route("**/*", (route, request) => {
      routeRequest(route, request, source, guard).catch(() => route.abort("failed"));
    });

    const page: Page = await browserContext.newPage();
    const startUrl =
      options.source.kind === "url"
        ? options.source.url.toString()
        : `${DEMO_ORIGIN}${options.startPath ?? "/"}`;
    const observer = observe(page, startUrl.startsWith("https:"));

    options.onStage?.("navigating");
    let response;
    try {
      response = await page.goto(startUrl, { waitUntil: "load", timeout: limits.navigationMs });
    } catch (error) {
      throw mapError(error, context, "navigation");
    }

    if (!response) {
      throw new AnalysisRunError("navigation_failed", "No se pudo cargar la página.");
    }
    if (response.headers()[BLOCKED_HEADER] !== undefined) {
      // El proxy rechazó el documento (directo o tras una redirección): se distingue DNS de bloqueo.
      const onlyDns = proxy.events.dnsFailedHosts.size > 0 && proxy.events.blockedHosts.size === 0;
      throw onlyDns
        ? new AnalysisRunError("dns_error", "No se pudo resolver el nombre de host.")
        : new AnalysisRunError("blocked_destination", "El destino no está permitido.");
    }
    if (response.status() >= 400) {
      throw new AnalysisRunError(
        "http_error",
        `La página respondió con el estado HTTP ${String(response.status())}.`,
        response.status(),
      );
    }
    const contentType = response.headers()["content-type"] ?? "";
    if (!HTML_CONTENT_TYPE.test(contentType)) {
      throw new AnalysisRunError("non_html_content", "El recurso no es una página HTML.");
    }

    options.onStage?.("running_checks");
    let raw: RawAxeResults;
    try {
      raw = await new AxeBuilder({ page }).analyze();
    } catch (error) {
      throw mapError(error, context, "checks");
    }

    const observations = observer.snapshot();
    const finalUrl = page.url();
    let links: string[] = [];
    let forms: FormProbe[] = [];
    if (options.probe) {
      links = await collectLinks(page).catch(() => []);
      forms = await probeForms(page, startUrl, guard, limits.navigationMs).catch(() => []);
    }

    return {
      raw,
      finalUrl,
      durationMs: Date.now() - startedAt,
      blockedHosts: [
        ...new Set([...proxy.events.blockedHosts, ...proxy.events.dnsFailedHosts]),
      ].slice(0, 50),
      observations,
      links,
      forms,
    };
  } catch (error) {
    throw mapError(error, context, "browser");
  } finally {
    clearTimeout(totalTimer);
    await closeQuietly(browserContext);
  }
}
