import {
  IMPACTS,
  type Analysis,
  type ComparisonEntry,
  type ComparisonResult,
  type Finding,
  type Impact,
  type ImpactCounts,
} from "@pink-bridge/shared";

/** Lo mínimo para emparejar: lo comparten los análisis guardados y las líneas base del CLI. */
export type ComparableFinding = Pick<
  Finding,
  "id" | "ruleId" | "impact" | "affectedNodeCount" | "fingerprint"
>;

const IMPACT_ORDER: Readonly<Record<Impact, number>> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
  unknown: 4,
};

export const COMPARISON_LIMITATIONS: readonly string[] = [
  "Solo se comparan las incidencias automáticas; las comprobaciones de revisión manual no entran en la comparación.",
  "Una incidencia 'resuelta' ha desaparecido en el segundo análisis. No equivale a una corrección verificada: puede deberse a cambios en el DOM, en el contenido o en la versión de axe-core.",
  "Las coincidencias exactas requieren el mismo selector y el mismo fragmento HTML saneado. Las aproximadas solo coinciden en la regla y el fragmento, y pueden no corresponder al mismo elemento.",
  "Cada análisis evalúa la página en el momento de la carga; no recoge estados tras interacción del usuario.",
];

function keyStrong(finding: ComparableFinding): string {
  return finding.fingerprint.strong;
}

function keyLoose(finding: ComparableFinding): string {
  return finding.fingerprint.loose;
}

/** Empareja una a una las incidencias por una clave. Devuelve los pares y lo que queda sin pareja. */
function pairByKey(
  baseline: readonly ComparableFinding[],
  target: readonly ComparableFinding[],
  keyOf: (finding: ComparableFinding) => string,
): {
  pairs: [ComparableFinding, ComparableFinding][];
  restBaseline: ComparableFinding[];
  restTarget: ComparableFinding[];
} {
  const index = new Map<string, ComparableFinding[]>();
  for (const finding of target) {
    const bucket = index.get(keyOf(finding)) ?? [];
    bucket.push(finding);
    index.set(keyOf(finding), bucket);
  }

  const pairs: [ComparableFinding, ComparableFinding][] = [];
  const restBaseline: ComparableFinding[] = [];
  const used = new Set<string>();
  for (const finding of baseline) {
    const candidate = (index.get(keyOf(finding)) ?? []).find((item) => !used.has(item.id));
    if (candidate) {
      used.add(candidate.id);
      pairs.push([finding, candidate]);
    } else {
      restBaseline.push(finding);
    }
  }
  return {
    pairs,
    restBaseline,
    restTarget: target.filter((item) => !used.has(item.id)),
  };
}

function sortByGravity(entries: ComparisonEntry[]): ComparisonEntry[] {
  return entries.sort(
    (a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact] || a.ruleId.localeCompare(b.ruleId),
  );
}

/**
 * Clasifica las incidencias de dos auditorías en nuevas, resueltas y persistentes.
 * Primero empareja por huella fuerte (exacta) y después por huella débil (aproximada).
 */
export function matchFindings(
  baseline: readonly ComparableFinding[],
  target: readonly ComparableFinding[],
): Pick<ComparisonResult, "newFindings" | "resolvedFindings" | "persistentFindings"> {
  const strong = pairByKey(baseline, target, keyStrong);
  const loose = pairByKey(strong.restBaseline, strong.restTarget, keyLoose);

  const persistent: ComparisonEntry[] = [
    ...strong.pairs.map(([b, t]) => entry(t, "exact", b.id, t.id, t.affectedNodeCount)),
    ...loose.pairs.map(([b, t]) => entry(t, "approximate", b.id, t.id, t.affectedNodeCount)),
  ];
  const resolved = loose.restBaseline.map((b) => entry(b, null, b.id, null, b.affectedNodeCount));
  const added = loose.restTarget.map((t) => entry(t, null, null, t.id, t.affectedNodeCount));

  return {
    newFindings: sortByGravity(added),
    resolvedFindings: sortByGravity(resolved),
    persistentFindings: sortByGravity(persistent),
  };
}

function entry(
  finding: ComparableFinding,
  matchType: ComparisonEntry["matchType"],
  baselineFindingId: string | null,
  targetFindingId: string | null,
  affectedNodeCount: number,
): ComparisonEntry {
  return {
    ruleId: finding.ruleId,
    impact: finding.impact,
    matchType,
    baselineFindingId,
    targetFindingId,
    affectedNodeCount,
  };
}

function countByImpact(findings: readonly Finding[]): ImpactCounts {
  const counts: ImpactCounts = { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 };
  for (const finding of findings) {
    counts[finding.impact] += 1;
  }
  return counts;
}

function nodesOf(findings: readonly Finding[]): number {
  return findings.reduce((total, finding) => total + finding.affectedNodeCount, 0);
}

/** Construye el resultado completo de la comparación. Las auditorías deben ser compatibles. */
export function compareAnalyses(
  baselineAnalysis: Analysis,
  targetAnalysis: Analysis,
  baselineFindings: readonly Finding[],
  targetFindings: readonly Finding[],
): ComparisonResult {
  const automaticBaseline = baselineFindings.filter((finding) => finding.kind === "automatic");
  const automaticTarget = targetFindings.filter((finding) => finding.kind === "automatic");
  const matched = matchFindings(automaticBaseline, automaticTarget);

  const countsBaseline = countByImpact(automaticBaseline);
  const countsTarget = countByImpact(automaticTarget);
  const byImpact = Object.fromEntries(
    IMPACTS.map((impact) => [impact, countsTarget[impact] - countsBaseline[impact]]),
  ) as ImpactCounts;

  const limitations = [...COMPARISON_LIMITATIONS];
  if (baselineAnalysis.axeVersion !== targetAnalysis.axeVersion) {
    limitations.push(
      `Las versiones de axe-core difieren (${baselineAnalysis.axeVersion ?? "desconocida"} frente a ${targetAnalysis.axeVersion ?? "desconocida"}); las diferencias pueden deberse a las reglas.`,
    );
  }

  return {
    baselineAnalysisId: baselineAnalysis.id,
    targetAnalysisId: targetAnalysis.id,
    normalizedUrl: targetAnalysis.normalizedUrl,
    ...matched,
    summaryDelta: {
      automaticFindings: automaticTarget.length - automaticBaseline.length,
      affectedNodes: nodesOf(automaticTarget) - nodesOf(automaticBaseline),
      byImpact,
    },
    limitations,
  };
}
