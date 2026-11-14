import { join } from "node:path";
import type { AnalysisErrorCode, ViewportName } from "@pink-bridge/shared";
import {
  AnalysisRunError,
  DEMO_ORIGIN,
  openSession,
  runAnalysis,
  type BrowserSession,
  type RunLimits,
  type RunResult,
  type RunSource,
} from "./runAnalysis.js";
import type { Resolver } from "./ssrf.js";

/** Tamaños de ventana del recorrido. */
export const VIEWPORTS: Readonly<
  Record<ViewportName, { readonly width: number; readonly height: number }>
> = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
};

/**
 * Páginas auditadas a la vez. Cada una abre un contexto por viewport sobre el mismo Chromium,
 * así que el tope protege la memoria sin repetir el arranque del navegador por página.
 */
export const PAGE_CONCURRENCY = 2;

const SKIP_RESOURCE = /\.(png|jpe?g|gif|webp|svg|ico|pdf|zip|css|js|woff2?|mp4|webm|mp3)$/i;

export type PageOutcome =
  | {
      readonly url: string;
      readonly viewport: ViewportName;
      readonly ok: true;
      readonly run: RunResult;
    }
  | {
      readonly url: string;
      readonly viewport: ViewportName;
      readonly ok: false;
      readonly code: AnalysisErrorCode;
      readonly httpStatus?: number;
      readonly message: string;
    };

export interface SiteRunOptions {
  /** URL inicial absoluta (modo url). */
  readonly startUrl?: string;
  /** Carpeta del sitio de demostración (modo demo-site). */
  readonly demoSiteRoot?: string;
  readonly maxPages: number;
  readonly viewports: readonly ViewportName[];
  readonly resolve?: Resolver;
  readonly allowedPorts?: readonly number[];
  readonly limits?: Partial<RunLimits>;
  readonly testOnlyTrustedHosts?: readonly string[];
  /** Pausa entre lotes de páginas, para no saturar el sitio auditado. Por defecto, ninguna. */
  readonly pauseMs?: number;
}

export interface SiteRunResult {
  readonly pages: readonly PageOutcome[];
  readonly pagesVisited: number;
  /** Por página, los enlaces que apuntan a páginas visitadas que respondieron con error HTTP. */
  readonly brokenLinks: ReadonlyMap<
    string,
    readonly { readonly href: string; readonly status: number }[]
  >;
}

type Attempt =
  | { readonly ok: true; readonly run: RunResult }
  | { readonly ok: false; readonly error: AnalysisRunError };

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Normaliza un enlace: mismo origen, http(s), sin fragmento y sin recursos estáticos. */
function normalizeLink(href: string, origin: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.origin !== origin || SKIP_RESOURCE.test(url.pathname)) {
    return null;
  }
  url.hash = "";
  // index.html y la raíz son la misma página: se cuentan una sola vez.
  url.pathname = url.pathname.replace(/\/index\.html$/, "/");
  return url.href;
}

/** Audita una página en un viewport. Los fallos esperados se devuelven; los inesperados se propagan. */
async function auditPage(
  url: string,
  viewport: ViewportName,
  session: BrowserSession,
  sourceFor: (url: URL) => RunSource,
  demo: boolean,
): Promise<Attempt> {
  try {
    const run = await runAnalysis({
      source: sourceFor(new URL(url)),
      ...(demo ? { startPath: new URL(url).pathname } : {}),
      viewport: VIEWPORTS[viewport],
      probe: viewport === "desktop",
      session,
    });
    return { ok: true, run };
  } catch (error) {
    if (!(error instanceof AnalysisRunError)) {
      throw error;
    }
    return { ok: false, error };
  }
}

/**
 * Recorre el sitio en anchura desde la URL inicial, dentro de su mismo origen, hasta maxPages páginas.
 * Cada página se audita en cada viewport; las sondas de formularios y enlaces solo corren en escritorio.
 * Un único proxy y un único Chromium sirven a todo el recorrido.
 */
export async function runSite(options: SiteRunOptions): Promise<SiteRunResult> {
  const demo = options.demoSiteRoot !== undefined;
  const startUrl = demo ? `${DEMO_ORIGIN}/` : (options.startUrl ?? "");
  let origin = new URL(startUrl).origin;
  let originFromRedirect = false;

  const sourceFor = (url: URL): RunSource =>
    demo
      ? {
          kind: "demo",
          fixturePath: join(options.demoSiteRoot ?? "", "index.html"),
          siteRoot: options.demoSiteRoot,
        }
      : { kind: "url", url };

  const session = await openSession({
    ...(options.resolve !== undefined ? { resolve: options.resolve } : {}),
    ...(options.allowedPorts !== undefined ? { allowedPorts: options.allowedPorts } : {}),
    ...(options.limits !== undefined ? { limits: options.limits } : {}),
    ...(options.testOnlyTrustedHosts !== undefined
      ? { testOnlyTrustedHosts: options.testOnlyTrustedHosts }
      : {}),
  });

  const queue: string[] = [startUrl];
  const visited = new Set<string>();
  const failures = new Map<string, { code: AnalysisErrorCode; httpStatus?: number }>();
  const linksByPage = new Map<string, readonly string[]>();
  const pages: PageOutcome[] = [];

  try {
    while (queue.length > 0 && visited.size < options.maxPages) {
      const batch: string[] = [];
      while (
        queue.length > 0 &&
        batch.length < PAGE_CONCURRENCY &&
        visited.size < options.maxPages
      ) {
        const url = queue.shift();
        if (url !== undefined && !visited.has(url)) {
          visited.add(url);
          batch.push(url);
        }
      }

      if (pages.length > 0 && (options.pauseMs ?? 0) > 0) {
        await sleep(options.pauseMs ?? 0);
      }
      const results = await Promise.all(
        batch.map((url) =>
          Promise.all(
            options.viewports.map((viewport) => auditPage(url, viewport, session, sourceFor, demo)),
          ),
        ),
      );

      batch.forEach((url, pageIndex) => {
        options.viewports.forEach((viewport, viewportIndex) => {
          const attempt = results[pageIndex]?.[viewportIndex];
          if (attempt === undefined) {
            return;
          }
          const desktop = viewport === "desktop";
          if (attempt.ok) {
            pages.push({ url, viewport, ok: true, run: attempt.run });
            if (!originFromRedirect) {
              // Si la URL inicial redirige a otro host (p. ej. www.), los enlaces se resuelven contra el destino final.
              origin = new URL(attempt.run.finalUrl).origin;
              originFromRedirect = true;
            }
            if (desktop) {
              linksByPage.set(url, attempt.run.links);
            }
            return;
          }
          const error = attempt.error;
          pages.push({
            url,
            viewport,
            ok: false,
            code: error.code,
            ...(error.httpStatus !== undefined ? { httpStatus: error.httpStatus } : {}),
            message: error.message,
          });
          if (desktop) {
            failures.set(url, {
              code: error.code,
              ...(error.httpStatus !== undefined ? { httpStatus: error.httpStatus } : {}),
            });
          }
        });

        for (const href of linksByPage.get(url) ?? []) {
          const next = normalizeLink(href, origin);
          if (
            next !== null &&
            !visited.has(next) &&
            !queue.includes(next) &&
            visited.size + queue.length < options.maxPages
          ) {
            queue.push(next);
          }
        }
      });
    }
  } finally {
    await session.close();
  }

  const brokenLinks = new Map<string, { href: string; status: number }[]>();
  for (const [page, links] of linksByPage) {
    for (const href of links) {
      const target = normalizeLink(href, origin);
      const failure = target === null ? undefined : failures.get(target);
      if (target !== null && failure?.httpStatus !== undefined && failure.httpStatus >= 400) {
        brokenLinks.set(page, [
          ...(brokenLinks.get(page) ?? []),
          { href: target, status: failure.httpStatus },
        ]);
      }
    }
  }

  return { pages, pagesVisited: visited.size, brokenLinks };
}
