import { describe, expect, it } from "vitest";
import type { Analysis, Finding } from "@pink-bridge/shared";
import { compareAnalyses, matchFindings } from "./compare.js";

function finding(id: string, overrides: Partial<Finding> = {}): Finding {
  return {
    id,
    analysisId: "0f8fad5b-d9cb-469f-a165-8c0a6a9b2d3e",
    kind: "automatic",
    ruleId: "image-alt",
    description: "",
    help: "",
    helpUrl: null,
    impact: "critical",
    wcagReferences: [],
    affectedNodeCount: 1,
    recommendation: "",
    detectedAt: "2026-11-12T10:00:00.000Z",
    fingerprint: { strong: "s".repeat(64), loose: "l".repeat(64) },
    nodes: [],
    ...overrides,
  };
}

function analysis(id: string, axeVersion: string | null = "4.14.0"): Analysis {
  return {
    id,
    url: "https://ejemplo.com/",
    normalizedUrl: "https://ejemplo.com/",
    source: "url",
    createdAt: "2026-11-12T10:00:00.000Z",
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    status: "completed",
    stage: "completed",
    axeVersion,
    summary: null,
    errorCode: null,
    errorMessage: null,
  };
}

const S = (c: string) => c.repeat(64);

describe("matchFindings", () => {
  it("empareja por huella fuerte como exacta y el resto como nueva o resuelta", () => {
    const baseline = [finding("b1", { fingerprint: { strong: S("a"), loose: S("x") } })];
    const target = [
      finding("t1", { fingerprint: { strong: S("a"), loose: S("x") } }),
      finding("t2", { ruleId: "link-name", fingerprint: { strong: S("c"), loose: S("z") } }),
    ];

    const result = matchFindings(baseline, target);
    expect(result.persistentFindings).toEqual([
      expect.objectContaining({
        matchType: "exact",
        baselineFindingId: "b1",
        targetFindingId: "t1",
      }),
    ]);
    expect(result.newFindings.map((entry) => entry.targetFindingId)).toEqual(["t2"]);
    expect(result.resolvedFindings).toEqual([]);
  });

  it("usa la huella débil como coincidencia aproximada cuando cambia la fuerte", () => {
    const baseline = [finding("b1", { fingerprint: { strong: S("a"), loose: S("x") } })];
    const target = [finding("t1", { fingerprint: { strong: S("b"), loose: S("x") } })];

    const result = matchFindings(baseline, target);
    expect(result.persistentFindings[0]?.matchType).toBe("approximate");
    expect(result.newFindings).toEqual([]);
    expect(result.resolvedFindings).toEqual([]);
  });

  it("marca como resueltas las incidencias que ya no aparecen", () => {
    const baseline = [finding("b1", { fingerprint: { strong: S("a"), loose: S("x") } })];
    const result = matchFindings(baseline, []);
    expect(result.resolvedFindings).toEqual([
      expect.objectContaining({ matchType: null, baselineFindingId: "b1", targetFindingId: null }),
    ]);
  });

  it("empareja uno a uno: dos incidencias idénticas frente a una sola dejan una resuelta", () => {
    const same = { strong: S("a"), loose: S("x") };
    const baseline = [finding("b1", { fingerprint: same }), finding("b2", { fingerprint: same })];
    const target = [finding("t1", { fingerprint: same })];

    const result = matchFindings(baseline, target);
    expect(result.persistentFindings).toHaveLength(1);
    expect(result.resolvedFindings).toHaveLength(1);
    expect(result.newFindings).toEqual([]);
  });

  it("ordena las entradas por gravedad y después por regla", () => {
    const target = [
      finding("t1", {
        ruleId: "z",
        impact: "minor",
        fingerprint: { strong: S("1"), loose: S("1") },
      }),
      finding("t2", {
        ruleId: "b",
        impact: "serious",
        fingerprint: { strong: S("2"), loose: S("2") },
      }),
      finding("t3", {
        ruleId: "a",
        impact: "serious",
        fingerprint: { strong: S("3"), loose: S("3") },
      }),
    ];
    expect(matchFindings([], target).newFindings.map((entry) => entry.ruleId)).toEqual([
      "a",
      "b",
      "z",
    ]);
  });
});

describe("compareAnalyses", () => {
  it("calcula el resumen y las diferencias por gravedad, sin contar revisiones manuales", () => {
    const baseline = [
      finding("b1", {
        impact: "critical",
        affectedNodeCount: 2,
        fingerprint: { strong: S("a"), loose: S("a") },
      }),
      finding("b2", {
        impact: "minor",
        kind: "needs_review",
        fingerprint: { strong: S("r"), loose: S("r") },
      }),
    ];
    const target = [
      finding("t1", {
        impact: "critical",
        affectedNodeCount: 1,
        fingerprint: { strong: S("a"), loose: S("a") },
      }),
      finding("t2", {
        impact: "serious",
        affectedNodeCount: 3,
        ruleId: "link-name",
        fingerprint: { strong: S("n"), loose: S("n") },
      }),
    ];

    const result = compareAnalyses(analysis("a1"), analysis("a2"), baseline, target);
    expect(result.summaryDelta).toEqual({
      automaticFindings: 1,
      affectedNodes: 2,
      byImpact: { critical: 0, serious: 1, moderate: 0, minor: 0, unknown: 0 },
    });
    expect(result.persistentFindings).toHaveLength(1);
    expect(result.newFindings).toHaveLength(1);
    expect(result.resolvedFindings).toEqual([]);
  });

  it("avisa cuando las versiones de axe-core difieren", () => {
    const result = compareAnalyses(analysis("a1", "4.14.0"), analysis("a2", "4.15.0"), [], []);
    expect(result.limitations.some((text) => text.includes("versiones de axe-core difieren"))).toBe(
      true,
    );
  });

  it("incluye siempre las limitaciones metodológicas", () => {
    const result = compareAnalyses(analysis("a1"), analysis("a2"), [], []);
    expect(
      result.limitations.some((text) => text.includes("No equivale a una corrección verificada")),
    ).toBe(true);
  });
});
