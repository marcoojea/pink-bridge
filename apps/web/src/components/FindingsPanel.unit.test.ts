import { describe, expect, it } from "vitest";
import type { Finding } from "@pink-bridge/shared";
import { filterFindings, NO_FILTERS } from "./FindingsPanel.js";

function finding(overrides: Partial<Finding>): Finding {
  return {
    id: overrides.id ?? "x",
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
    fingerprint: { strong: "a".repeat(64), loose: "b".repeat(64) },
    nodes: [],
    ...overrides,
  };
}

const ALL: Finding[] = [
  finding({ id: "1", ruleId: "image-alt", impact: "critical", kind: "automatic" }),
  finding({ id: "2", ruleId: "link-name", impact: "serious", kind: "automatic" }),
  finding({ id: "3", ruleId: "focus-order", impact: "minor", kind: "needs_review" }),
];

describe("filterFindings", () => {
  it("sin filtros devuelve todas las incidencias", () => {
    expect(filterFindings(ALL, NO_FILTERS)).toHaveLength(3);
  });

  it("combina filtros de tipo, gravedad y regla", () => {
    expect(
      filterFindings(ALL, { kind: "automatic", impact: "", ruleId: "" }).map((f) => f.id),
    ).toEqual(["1", "2"]);
    expect(
      filterFindings(ALL, { kind: "", impact: "serious", ruleId: "" }).map((f) => f.id),
    ).toEqual(["2"]);
    expect(
      filterFindings(ALL, { kind: "automatic", impact: "critical", ruleId: "image-alt" }).map(
        (f) => f.id,
      ),
    ).toEqual(["1"]);
  });

  it("devuelve vacío si ningún elemento cumple todos los filtros", () => {
    expect(filterFindings(ALL, { kind: "needs_review", impact: "critical", ruleId: "" })).toEqual(
      [],
    );
  });
});
