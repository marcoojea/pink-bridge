import { describe, expect, it } from "vitest";
import { analysisSchema, type ComparisonEntry } from "@pink-bridge/shared";
import type { AuditRun } from "./audit.js";
import { formatAuditLines } from "./format.js";
import type { CiComparison } from "./gate.js";

const ID = "11111111-1111-4111-8111-111111111111";

function run(mode: "page" | "site" = "page"): AuditRun {
  const analysis = analysisSchema.parse({
    id: ID,
    url: "https://ejemplo.com/",
    normalizedUrl: "https://ejemplo.com/",
    source: "url",
    mode,
    maxPages: mode === "site" ? 3 : null,
    createdAt: "2026-11-14T10:00:00.000Z",
    startedAt: "2026-11-14T10:00:00.000Z",
    finishedAt: "2026-11-14T10:00:02.000Z",
    durationMs: 2000,
    status: "completed",
    stage: "completed",
    axeVersion: "4.14.0",
    summary: {
      automaticRules: 1,
      automaticFindings: 2,
      affectedNodes: 3,
      needsReview: 1,
      passedRules: 10,
      byImpact: { critical: 1, serious: 1, moderate: 0, minor: 0, unknown: 0 },
      ...(mode === "site" ? { pagesAnalyzed: 3 } : {}),
    },
    errorCode: null,
    errorMessage: null,
  });
  return {
    analysis,
    findings: [],
    summary: analysis.summary ?? {
      automaticRules: 0,
      automaticFindings: 0,
      affectedNodes: 0,
      needsReview: 0,
      passedRules: 0,
      byImpact: { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 },
    },
    mode,
  };
}

function entry(ruleId: string, impact: ComparisonEntry["impact"]): ComparisonEntry {
  return {
    ruleId,
    impact,
    matchType: null,
    baselineFindingId: null,
    targetFindingId: `t-${ruleId}`,
    affectedNodeCount: 1,
  };
}

function comparison(newEntries: ComparisonEntry[], blocking: ComparisonEntry[]): CiComparison {
  return {
    newFindings: newEntries,
    resolvedFindings: [],
    persistentFindings: [],
    blocking,
  };
}

describe("formatAuditLines", () => {
  it("sin línea base indica que no hay nada que comparar", () => {
    const lines = formatAuditLines(run(), undefined, { failOnNew: false, minImpact: "serious" });
    expect(lines).toContain("Pink Bridge · auditoría de página");
    expect(lines).toContain("  Incidencias automáticas: 2");
    expect(lines.at(-1)).toBe(
      "Resultado: auditoría completada (sin línea base, nada que comparar).",
    );
  });

  it("en modo sitio muestra las páginas revisadas", () => {
    const lines = formatAuditLines(run("site"), undefined, {
      failOnNew: false,
      minImpact: "serious",
    });
    expect(lines).toContain("Pink Bridge · auditoría de sitio");
    expect(lines).toContain("  Páginas revisadas: 3");
  });

  it("con --fail-on-new y nuevas bloqueantes anuncia el fallo y lista la incidencia", () => {
    const blocking = [entry("image-alt", "critical")];
    const lines = formatAuditLines(run(), comparison(blocking, blocking), {
      failOnNew: true,
      minImpact: "serious",
    });
    expect(lines).toContain("  - [crítico] image-alt · 1 elem. (bloquea el CI)");
    expect(lines.at(-1)).toBe(
      "Resultado: FALLO. 1 nueva(s) incidencia(s) con gravedad grave o superior.",
    );
  });

  it("sin --fail-on-new las nuevas se avisan pero no fallan", () => {
    const blocking = [entry("image-alt", "critical")];
    const lines = formatAuditLines(run(), comparison(blocking, blocking), {
      failOnNew: false,
      minImpact: "serious",
    });
    expect(lines.at(-1)).toContain("Sin --fail-on-new, no falla.");
  });

  it("cuando no hay nuevas bloqueantes lo dice con el umbral aplicado", () => {
    const lines = formatAuditLines(run(), comparison([entry("label", "minor")], []), {
      failOnNew: true,
      minImpact: "serious",
    });
    expect(lines.at(-1)).toBe("Resultado: sin nuevas incidencias con gravedad grave o superior.");
  });
});
