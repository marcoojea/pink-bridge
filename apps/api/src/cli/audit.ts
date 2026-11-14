import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  analysisSchema,
  type Analysis,
  type AnalysisErrorCode,
  type AnalysisSummary,
  type Finding,
} from "@pink-bridge/shared";
import { siteFindings, summarizeFindings } from "../analyzer/audit.js";
import { normalizeAxeResults } from "../analyzer/normalize.js";
import {
  AnalysisRunError,
  DEMO_ORIGIN,
  runAnalysis,
  type RunOptions,
  type RunResult,
} from "../analyzer/runAnalysis.js";
import { runSite, type SiteRunOptions, type SiteRunResult } from "../analyzer/site.js";
import { normalizeTargetUrl } from "../analyzer/urlPolicy.js";
import type { AuditCliOptions } from "./args.js";

/** Sitio de demostración incluido en el repositorio. Se sirve desde el propio motor, sin red. */
export const DEMO_SITE_ROOT = fileURLToPath(
  new URL("../../../../tests/fixtures/site", import.meta.url),
);

/** Los mismos tamaños que usa el recorrido de la API: móvil, tablet y escritorio. */
const VIEWPORTS = ["desktop", "tablet", "mobile"] as const;

/** Fallo de la auditoría. Se reporta con código 3: nunca se confunde con «sin incidencias». */
export class AuditFailedError extends Error {
  constructor(
    readonly code: AnalysisErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AuditFailedError";
  }
}

/** Destino de la auditoría sin ejecutarla: permite validar la línea base antes de abrir el navegador. */
export function auditTarget(options: AuditCliOptions): { url: string; mode: "page" | "site" } {
  const url = options.demoSite ? `${DEMO_ORIGIN}/` : normalizeTargetUrl(options.url).normalized;
  const mode: "page" | "site" = options.demoSite || options.maxPages > 1 ? "site" : "page";
  return { url, mode };
}

export interface AuditDeps {
  readonly runPage?: (options: RunOptions) => Promise<RunResult>;
  readonly runSite?: (options: SiteRunOptions) => Promise<SiteRunResult>;
  readonly now?: () => Date;
}

export interface AuditRun {
  readonly analysis: Analysis;
  readonly findings: Finding[];
  readonly summary: AnalysisSummary;
  readonly mode: "page" | "site";
}

/**
 * Audita una página o un sitio y devuelve los hallazgos en memoria. No usa base de datos ni
 * la API: reutiliza el mismo motor, la misma normalización y el mismo cálculo de resumen que el servidor.
 */
export async function runAudit(options: AuditCliOptions, deps: AuditDeps = {}): Promise<AuditRun> {
  const clock = deps.now ?? (() => new Date());
  const analysisId = randomUUID();
  const startedAt = clock();

  const demo = options.demoSite;
  const target = demo ? undefined : normalizeTargetUrl(options.url);
  const { url: normalizedUrl, mode } = auditTarget(options);

  try {
    let findings: Finding[];
    let summary: AnalysisSummary;
    let axeVersion: string | null;

    if (mode === "page") {
      if (target === undefined) {
        throw new AuditFailedError("browser_error", "Falta la dirección a auditar.");
      }
      const run = await (deps.runPage ?? runAnalysis)({
        source: { kind: "url", url: target.url },
        probe: false,
      });
      const normalized = normalizeAxeResults(run.raw, {
        analysisId,
        detectedAt: clock().toISOString(),
      });
      findings = [...normalized.findings];
      summary = normalized.summary;
      axeVersion = normalized.axeVersion;
    } else {
      const site = await (deps.runSite ?? runSite)({
        ...(demo ? { demoSiteRoot: DEMO_SITE_ROOT } : { startUrl: normalizedUrl }),
        maxPages: options.maxPages,
        viewports: VIEWPORTS,
        pauseMs: options.pauseMs,
      });
      if (!site.pages.some((page) => page.ok)) {
        const failure = site.pages.find((page) => !page.ok);
        if (failure?.ok === false) {
          throw new AuditFailedError(failure.code, failure.message);
        }
        throw new AuditFailedError("navigation_failed", "No se pudo cargar ninguna página.");
      }
      const built = siteFindings(site, analysisId, clock().toISOString());
      findings = [...built.findings];
      axeVersion = built.axeVersion;
      summary = summarizeFindings(built.findings, built.passedRules, site.pagesVisited);
    }

    const finishedAt = clock();
    const analysis = analysisSchema.parse({
      id: analysisId,
      url: normalizedUrl,
      normalizedUrl,
      source: demo ? "demo" : "url",
      mode,
      maxPages: mode === "site" ? options.maxPages : null,
      createdAt: startedAt.toISOString(),
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      status: "completed",
      stage: "completed",
      axeVersion,
      summary,
      errorCode: null,
      errorMessage: null,
    });
    return { analysis, findings, summary, mode };
  } catch (error) {
    if (error instanceof AnalysisRunError) {
      throw new AuditFailedError(error.code, error.message);
    }
    throw error;
  }
}
