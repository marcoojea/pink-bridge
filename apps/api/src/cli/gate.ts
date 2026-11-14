import type { Baseline, ComparisonEntry, Finding, Impact } from "@pink-bridge/shared";
import { matchFindings, type ComparableFinding } from "../analysis/compare.js";
import { BaselineError } from "./baseline.js";

/** Cuanto más bajo, más grave. Sirve para comparar una gravedad con el umbral de fallo. */
export const IMPACT_RANK: Readonly<Record<Impact, number>> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
  unknown: 4,
};

export interface CiOptions {
  /** Incluir las comprobaciones de revisión manual además de las automáticas. Por defecto, no. */
  readonly includeReview: boolean;
  /** Gravedad mínima que hace fallar la auditoría: "serious" falla con grave y crítico. */
  readonly minImpact: Impact;
}

export interface CiComparison {
  readonly newFindings: ComparisonEntry[];
  readonly resolvedFindings: ComparisonEntry[];
  readonly persistentFindings: ComparisonEntry[];
  /** Nuevas incidencias que alcanzan el umbral de gravedad: son las que fallan la compilación. */
  readonly blocking: ComparisonEntry[];
}

/** Una línea base solo sirve para la misma dirección y el mismo modo de auditoría. */
export function assertComparable(
  baseline: Baseline,
  target: { readonly url: string; readonly mode: "page" | "site" },
): void {
  if (baseline.url !== target.url) {
    throw new BaselineError(`La línea base es de otra dirección: ${baseline.url}.`);
  }
  if (baseline.mode !== target.mode) {
    throw new BaselineError(
      `La línea base es de modo ${baseline.mode} y esta auditoría es de modo ${target.mode}.`,
    );
  }
}

/** Empareja la auditoría actual con la línea base y marca qué nuevas incidencias fallan el CI. */
export function compareWithBaseline(
  baseline: Baseline,
  current: readonly Finding[],
  options: CiOptions,
): CiComparison {
  const keep = (kind: string): boolean => options.includeReview || kind === "automatic";

  const previous: ComparableFinding[] = baseline.findings
    .filter((item) => keep(item.kind))
    .map((item, index) => ({
      id: `baseline:${String(index)}`,
      ruleId: item.ruleId,
      impact: item.impact,
      affectedNodeCount: item.affectedNodeCount,
      fingerprint: item.fingerprint,
    }));
  const now = current.filter((finding) => keep(finding.kind));

  const result = matchFindings(previous, now);
  const threshold = IMPACT_RANK[options.minImpact];
  return {
    ...result,
    blocking: result.newFindings.filter((entry) => IMPACT_RANK[entry.impact] <= threshold),
  };
}
