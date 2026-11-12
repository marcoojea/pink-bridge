import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Browser, type Page, type Request, type Route } from "playwright";
import type { AnalysisErrorCode, AnalysisStage } from "@pink-bridge/shared";
import { BLOCKED_HEADER, startEgressProxy, type EgressEvents } from "./egressProxy.js";
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
  ) {
    super(message);
    this.name = "AnalysisRunError";
  }
}

export type RunSource =
  | { readonly kind: "url"; readonly url: URL }
  | { readonly kind: "demo"; readonly fixturePath: string };

export interface RunOptions {
  readonly source: RunSource;
  readonly resolve?: Resolver;
  readonly allowedPorts?: readonly number[];
  readonly limits?: Partial<RunLimits>;
  readonly onStage?: (stage: AnalysisStage) => void;
  /**
   * SOLO PRUEBAS. Hosts exentos del guardia SSRF para probar la ruta de éxito contra
   * un servidor local. No se expone desde la API ni desde la configuración.
   */
  readonly testOnlyTrustedHosts?: readonly string[];
}

export interface RunResult {
  readonly raw: RawAxeResults;
  readonly finalUrl: string;
  readonly durationMs: number;
  /** Hosts de peticiones bloqueadas por la política de red o no resueltos (informativo). */
  readonly blockedHosts: readonly string[];
}

interface RunContext {
  readonly events: EgressEvents;
  readonly startHost: string | null;
  timedOut: boolean;
}

const HTML_CONTENT_TYPE = /text\/html|application\/xhtml\+xml/i;

async function routeRequest(route: Route, request: Request, source: RunSource): Promise<void> {
  let target: URL;
  try {
    target = new URL(request.url());
  } catch {
    await route.abort("failed");
    return;
  }

  if (source.kind === "demo" && target.origin === DEMO_ORIGIN) {
    if (target.pathname !== "/") {
      await route.fulfill({ status: 404, contentType: "text/plain; charset=utf-8", body: "" });
      return;
    }
    const body = await readFile(source.fixturePath);
    await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body });
    return;
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    await route.abort("blockedbyclient");
    return;
  }

  // El resto de peticiones sale por el proxy de salida, que valida cada conexión.
  await route.continue();
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

async function closeQuietly(browser: Browser | null): Promise<void> {
  if (!browser) {
    return;
  }
  try {
    await browser.close();
  } catch {
    // El navegador puede estar ya cerrado por el temporizador de tiempo total.
  }
}

/**
 * Ejecuta una auditoría axe-core sobre una única página en un navegador aislado.
 * Todo el tráfico de red de la página sale por un proxy local que valida cada conexión
 * (documento, redirecciones y subrecursos), resuelve DNS una sola vez y conecta a la IP validada.
 */
export async function runAnalysis(options: RunOptions): Promise<RunResult> {
  const limits: RunLimits = { ...DEFAULT_LIMITS, ...options.limits };
  const resolve = options.resolve ?? systemResolver;
  const allowedPorts = options.allowedPorts ?? DEFAULT_ALLOWED_PORTS;
  const trustedHosts = new Set((options.testOnlyTrustedHosts ?? []).map(normalizeHostname));
  const startedAt = Date.now();

  options.onStage?.("preparing_browser");

  const proxy = await startEgressProxy({
    resolve,
    allowedPorts,
    trustedHosts,
    maxBytes: limits.maxResponseBytes,
  });

  const context: RunContext = {
    events: proxy.events,
    startHost:
      options.source.kind === "url" ? normalizeHostname(options.source.url.hostname) : null,
    timedOut: false,
  };

  let browser: Browser | null = null;
  const totalTimer = setTimeout(() => {
    context.timedOut = true;
    void closeQuietly(browser);
  }, limits.totalMs);

  try {
    try {
      browser = await chromium.launch({
        headless: true,
        chromiumSandbox: true,
        proxy: { server: `http://127.0.0.1:${String(proxy.port)}`, bypass: "<-loopback>" },
      });
    } catch (error) {
      throw mapError(error, context, "browser");
    }

    const browserContext = await browser.newContext({
      serviceWorkers: "block",
      acceptDownloads: false,
      permissions: [],
      ignoreHTTPSErrors: false,
      viewport: { width: 1280, height: 800 },
      locale: "es-ES",
    });

    await browserContext.route("**/*", (route, request) => {
      routeRequest(route, request, options.source).catch(() => route.abort("failed"));
    });

    const page: Page = await browserContext.newPage();
    const startUrl =
      options.source.kind === "url" ? options.source.url.toString() : `${DEMO_ORIGIN}/`;

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

    return {
      raw,
      finalUrl: page.url(),
      durationMs: Date.now() - startedAt,
      blockedHosts: [
        ...new Set([...proxy.events.blockedHosts, ...proxy.events.dnsFailedHosts]),
      ].slice(0, 50),
    };
  } catch (error) {
    throw mapError(error, context, "browser");
  } finally {
    clearTimeout(totalTimer);
    await closeQuietly(browser);
    await proxy.close();
  }
}
