import type { ComparisonEntry, Impact } from "@pink-bridge/shared";
import type { AuditRun } from "./audit.js";
import type { CiComparison } from "./gate.js";

const IMPACT_NAMES: Readonly<Record<Impact, string>> = {
  critical: "crítico",
  serious: "grave",
  moderate: "moderado",
  minor: "menor",
  unknown: "sin clasificar",
};

function countLine(label: string, value: number, indent = 1): string {
  return `${"  ".repeat(indent)}${label}: ${String(value)}`;
}

function entryLine(entry: ComparisonEntry, blocking: boolean): string {
  const tag = blocking ? " (bloquea el CI)" : "";
  return `  - [${IMPACT_NAMES[entry.impact]}] ${entry.ruleId} · ${String(entry.affectedNodeCount)} elem.${tag}`;
}

export interface FormatOptions {
  readonly failOnNew: boolean;
  readonly minImpact: Impact;
}

/** Resumen legible para el log de CI. Una línea por dato; sin HTML ni fragmentos de la página. */
export function formatAuditLines(
  run: AuditRun,
  comparison: CiComparison | undefined,
  options: FormatOptions,
): string[] {
  const { summary } = run;
  const lines: string[] = [
    `Pink Bridge · auditoría ${run.mode === "site" ? "de sitio" : "de página"}`,
    `Dirección: ${run.analysis.normalizedUrl}`,
  ];
  if (run.mode === "site") {
    lines.push(countLine("Páginas revisadas", summary.pagesAnalyzed ?? 0));
  }
  lines.push(
    countLine("Incidencias automáticas", summary.automaticFindings),
    countLine("Elementos afectados", summary.affectedNodes),
    countLine("Para revisar a mano", summary.needsReview),
    "Por gravedad:",
    countLine("crítico", summary.byImpact.critical),
    countLine("grave", summary.byImpact.serious),
    countLine("moderado", summary.byImpact.moderate),
    countLine("menor", summary.byImpact.minor),
  );

  if (comparison !== undefined) {
    const blockingIds = new Set(comparison.blocking.map((entry) => entry.targetFindingId));
    lines.push(
      "Comparación con la línea base:",
      countLine("Nuevas", comparison.newFindings.length),
      countLine("Resueltas (sin comprobar)", comparison.resolvedFindings.length),
      countLine("Persistentes", comparison.persistentFindings.length),
    );
    for (const entry of comparison.newFindings) {
      lines.push(entryLine(entry, blockingIds.has(entry.targetFindingId)));
    }
  }

  const threshold = IMPACT_NAMES[options.minImpact];
  const blocking = comparison?.blocking.length ?? 0;
  if (comparison === undefined) {
    lines.push("Resultado: auditoría completada (sin línea base, nada que comparar).");
  } else if (blocking > 0 && options.failOnNew) {
    lines.push(
      `Resultado: FALLO. ${String(blocking)} nueva(s) incidencia(s) con gravedad ${threshold} o superior.`,
    );
  } else if (blocking > 0) {
    lines.push(
      `Resultado: ${String(blocking)} nueva(s) incidencia(s) con gravedad ${threshold} o superior. Sin --fail-on-new, no falla.`,
    );
  } else {
    lines.push(`Resultado: sin nuevas incidencias con gravedad ${threshold} o superior.`);
  }
  return lines;
}
