import type { AnalysisSummary, Finding, Impact } from "@pink-bridge/shared";
import { normalizeAxeResults } from "./normalize.js";
import { pageErrorFinding, qaFindings } from "./qa.js";
import type { PageOutcome, SiteRunResult } from "./site.js";

/**
 * Cálculo de hallazgos y resumen a partir de un recorrido de sitio. No persiste nada:
 * lo usan el servicio HTTP y el CLI de CI, así que la lógica de medición vive en un solo sitio.
 */
export interface SiteFindings {
  readonly findings: Finding[];
  readonly axeVersion: string | null;
  readonly passedRules: number;
}

export function siteFindings(
  site: SiteRunResult,
  analysisId: string,
  detectedAt: string,
): SiteFindings {
  const findings: Finding[] = [];
  let axeVersion: string | null = null;
  let passedRules = 0;

  site.pages.forEach((page: PageOutcome, index: number) => {
    const ctx = {
      analysisId,
      detectedAt,
      pageUrl: page.url,
      viewport: page.viewport,
      scope: `p${String(index)}:${page.viewport}`,
    };
    if (!page.ok) {
      findings.push(pageErrorFinding(ctx, page.code, page.message, page.httpStatus));
      return;
    }
    axeVersion ??= page.run.raw.testEngine.version;
    passedRules += page.run.raw.passes.length;
    findings.push(...normalizeAxeResults(page.run.raw, ctx).findings);
    findings.push(
      ...qaFindings(
        {
          observations: page.run.observations,
          forms: page.run.forms,
          brokenLinks: page.viewport === "desktop" ? (site.brokenLinks.get(page.url) ?? []) : [],
        },
        ctx,
      ),
    );
  });

  return { findings, axeVersion, passedRules };
}

/** Resumen de un conjunto de hallazgos: solo las automáticas cuentan para gravedad y reglas. */
export function summarizeFindings(
  findings: readonly Finding[],
  passedRules: number,
  pagesAnalyzed?: number,
): AnalysisSummary {
  const automatic = findings.filter((finding) => finding.kind === "automatic");
  const byImpact: Record<Impact, number> = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
    unknown: 0,
  };
  for (const finding of automatic) {
    byImpact[finding.impact] += 1;
  }
  return {
    automaticRules: new Set(automatic.map((finding) => finding.ruleId)).size,
    automaticFindings: automatic.length,
    affectedNodes: automatic.reduce((total, finding) => total + finding.affectedNodeCount, 0),
    needsReview: findings.length - automatic.length,
    passedRules,
    byImpact,
    ...(pagesAnalyzed !== undefined ? { pagesAnalyzed } : {}),
  };
}
