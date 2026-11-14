import { describe, expect, it } from "vitest";
import type { Baseline, Finding, Impact } from "@pink-bridge/shared";
import { BaselineError, toBaseline } from "./baseline.js";
import { assertComparable, compareWithBaseline } from "./gate.js";

const ANALYSIS_ID = "11111111-1111-4111-8111-111111111111";
const URL_PAGE = "https://ejemplo.com/";

function finding(
  ruleId: string,
  impact: Impact,
  fingerprint: string,
  kind: "automatic" | "needs_review" = "automatic",
): Finding {
  return {
    id: `${ANALYSIS_ID}:${kind}:${ruleId}:${fingerprint.slice(0, 4)}`,
    analysisId: ANALYSIS_ID,
    kind,
    ruleId,
    description: "d",
    help: "h",
    helpUrl: null,
    impact,
    wcagReferences: [],
    affectedNodeCount: 1,
    recommendation: "r",
    detectedAt: "2026-11-14T10:00:00.000Z",
    fingerprint: {
      strong: fingerprint.repeat(64).slice(0, 64),
      loose: `${fingerprint}e`.repeat(64).slice(0, 64),
    },
    nodes: [],
  };
}

function baselineOf(findings: Finding[], url = URL_PAGE, mode: "page" | "site" = "page"): Baseline {
  return toBaseline({
    url,
    mode,
    axeVersion: "4.14.0",
    createdAt: "2026-11-14T10:00:00.000Z",
    findings,
  });
}

const OLD = finding("image-alt", "critical", "1");
const UNCHANGED = finding("link-name", "serious", "2");

describe("compareWithBaseline", () => {
  it("clasifica nuevas, resueltas y persistentes", () => {
    const baseline = baselineOf([OLD, UNCHANGED]);
    const current = [UNCHANGED, finding("label", "moderate", "3")];
    const result = compareWithBaseline(baseline, current, {
      includeReview: false,
      minImpact: "serious",
    });
    expect(result.persistentFindings.map((entry) => entry.ruleId)).toEqual(["link-name"]);
    expect(result.resolvedFindings.map((entry) => entry.ruleId)).toEqual(["image-alt"]);
    expect(result.newFindings.map((entry) => entry.ruleId)).toEqual(["label"]);
  });

  it("falla solo con nuevas incidencias iguales o más graves que el umbral", () => {
    const baseline = baselineOf([]);
    const current = [finding("a", "critical", "4"), finding("b", "moderate", "5")];
    const serious = compareWithBaseline(baseline, current, {
      includeReview: false,
      minImpact: "serious",
    });
    expect(serious.blocking.map((entry) => entry.ruleId)).toEqual(["a"]);

    const moderate = compareWithBaseline(baseline, current, {
      includeReview: false,
      minImpact: "moderate",
    });
    expect(moderate.blocking.map((entry) => entry.ruleId).sort()).toEqual(["a", "b"]);
  });

  it("no cuenta como bloqueante una incidencia ya presente en la línea base", () => {
    const result = compareWithBaseline(baselineOf([OLD]), [OLD], {
      includeReview: false,
      minImpact: "critical",
    });
    expect(result.blocking).toEqual([]);
    expect(result.persistentFindings).toHaveLength(1);
  });

  it("ignora las comprobaciones de revisión manual salvo que se pidan", () => {
    const review = finding("focus-order", "critical", "6", "needs_review");
    const without = compareWithBaseline(baselineOf([]), [review], {
      includeReview: false,
      minImpact: "serious",
    });
    expect(without.newFindings).toEqual([]);

    const withReview = compareWithBaseline(baselineOf([]), [review], {
      includeReview: true,
      minImpact: "serious",
    });
    expect(withReview.blocking.map((entry) => entry.ruleId)).toEqual(["focus-order"]);
  });
});

describe("assertComparable", () => {
  it("acepta la misma dirección y el mismo modo", () => {
    expect(() => {
      assertComparable(baselineOf([]), { url: URL_PAGE, mode: "page" });
    }).not.toThrow();
  });

  it("rechaza una dirección distinta", () => {
    expect(() => {
      assertComparable(baselineOf([]), { url: "https://otra.com/", mode: "page" });
    }).toThrow(BaselineError);
  });

  it("rechaza un modo distinto", () => {
    expect(() => {
      assertComparable(baselineOf([], URL_PAGE, "site"), { url: URL_PAGE, mode: "page" });
    }).toThrow("modo site");
  });
});
