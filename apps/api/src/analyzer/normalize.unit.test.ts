import { describe, expect, it } from "vitest";
import {
  MAX_NODES_PER_FINDING,
  normalizeAxeResults,
  wcagReferencesFromTags,
  type RawAxeResults,
} from "./normalize.js";

const CONTEXT = {
  analysisId: "11111111-1111-4111-8111-111111111111",
  detectedAt: "2026-11-12T10:00:00.000Z",
} as const;

function raw(overrides: Partial<RawAxeResults> = {}): RawAxeResults {
  return {
    testEngine: { version: "4.14.0" },
    violations: [],
    incomplete: [],
    passes: [],
    ...overrides,
  };
}

describe("wcagReferencesFromTags", () => {
  it("convierte etiquetas wcag de axe a criterios con puntos", () => {
    expect(wcagReferencesFromTags(["wcag2a", "wcag111", "wcag412", "wcag1412", "wcag2aa"])).toEqual(
      ["1.1.1", "4.1.2", "1.4.12"],
    );
  });

  it("ignora etiquetas que no son criterios", () => {
    expect(wcagReferencesFromTags(["cat.text-alternatives", "best-practice"])).toEqual([]);
  });
});

describe("normalizeAxeResults", () => {
  it("convierte violaciones en incidencias automáticas con nodos y referencias WCAG", () => {
    const result = normalizeAxeResults(
      raw({
        violations: [
          {
            id: "image-alt",
            impact: "critical",
            description: "Images must have alternate text",
            help: "Images must have alternative text",
            helpUrl: "https://dequeuniversity.com/rules/axe/4.14/image-alt",
            tags: ["cat.text-alternatives", "wcag2a", "wcag111"],
            nodes: [
              {
                target: ["img.logo"],
                html: '<img src="logo.png" alt="">',
                failureSummary: "Fix any of the following: Element does not have an alt attribute",
              },
              { target: ["#hero img"], html: '<img src="hero.jpg">' },
            ],
          },
        ],
        passes: [
          { id: "html-has-lang", impact: null, description: "", help: "", tags: [], nodes: [] },
        ],
      }),
      CONTEXT,
    );

    expect(result.axeVersion).toBe("4.14.0");
    expect(result.summary).toEqual({
      automaticRules: 1,
      automaticFindings: 1,
      affectedNodes: 2,
      needsReview: 0,
      passedRules: 1,
      byImpact: { critical: 1, serious: 0, moderate: 0, minor: 0, unknown: 0 },
    });

    const [finding] = result.findings;
    expect(finding).toMatchObject({
      kind: "automatic",
      ruleId: "image-alt",
      impact: "critical",
      wcagReferences: ["1.1.1"],
      affectedNodeCount: 2,
      analysisId: CONTEXT.analysisId,
      detectedAt: CONTEXT.detectedAt,
    });
    expect(finding?.nodes[0]).toMatchObject({ selector: "img.logo", target: ["img.logo"] });
    expect(finding?.nodes[0]?.evidence.map((e) => e.type)).toEqual([
      "html_snippet",
      "failure_summary",
    ]);
    expect(finding?.description).toContain("texto alternativo");
  });

  it("trata un impacto desconocido o nulo como unknown explícito", () => {
    const result = normalizeAxeResults(
      raw({
        violations: [
          {
            id: "regla-a",
            impact: null,
            description: "",
            help: "Ayuda A",
            tags: [],
            nodes: [{ target: ["a"], html: "<a>" }],
          },
          {
            id: "regla-b",
            impact: "desconocido",
            description: "",
            help: "Ayuda B",
            tags: [],
            nodes: [{ target: ["b"], html: "<b>" }],
          },
        ],
      }),
      CONTEXT,
    );
    expect(result.findings.map((f) => f.impact)).toEqual(["unknown", "unknown"]);
    expect(result.summary.byImpact.unknown).toBe(2);
  });

  it("ordena por gravedad y después por regla", () => {
    const node = { target: ["x"], html: "<x>" };
    const result = normalizeAxeResults(
      raw({
        violations: [
          { id: "z-minor", impact: "minor", description: "", help: "", tags: [], nodes: [node] },
          {
            id: "b-serious",
            impact: "serious",
            description: "",
            help: "",
            tags: [],
            nodes: [node],
          },
          {
            id: "a-serious",
            impact: "serious",
            description: "",
            help: "",
            tags: [],
            nodes: [node],
          },
          {
            id: "c-critical",
            impact: "critical",
            description: "",
            help: "",
            tags: [],
            nodes: [node],
          },
        ],
      }),
      CONTEXT,
    );
    expect(result.findings.map((f) => f.ruleId)).toEqual([
      "c-critical",
      "a-serious",
      "b-serious",
      "z-minor",
    ]);
  });

  it("separa las comprobaciones incompletas como revisión manual", () => {
    const result = normalizeAxeResults(
      raw({
        incomplete: [
          {
            id: "focus-order-semantics",
            impact: "minor",
            description: "",
            help: "Elements in focus order need suitable role",
            tags: ["experimental"],
            nodes: [{ target: ["div.menu"], html: '<div class="menu">' }],
          },
        ],
      }),
      CONTEXT,
    );
    expect(result.summary.automaticFindings).toBe(0);
    expect(result.summary.needsReview).toBe(1);
    expect(result.findings[0]).toMatchObject({
      kind: "needs_review",
      ruleId: "focus-order-semantics",
    });
  });

  it("descarta reglas sin nodos y no cuenta pases como incidencias", () => {
    const result = normalizeAxeResults(
      raw({
        violations: [
          { id: "vacia", impact: "serious", description: "", help: "", tags: [], nodes: [] },
        ],
        passes: [
          {
            id: "ok",
            impact: null,
            description: "",
            help: "",
            tags: [],
            nodes: [{ target: ["p"], html: "<p>" }],
          },
        ],
      }),
      CONTEXT,
    );
    expect(result.findings).toEqual([]);
    expect(result.summary.passedRules).toBe(1);
  });

  it("produce huellas deterministas y distintas según el elemento afectado", () => {
    const build = (selector: string) =>
      normalizeAxeResults(
        raw({
          violations: [
            {
              id: "button-name",
              impact: "critical",
              description: "",
              help: "",
              tags: [],
              nodes: [{ target: [selector], html: "<button></button>" }],
            },
          ],
        }),
        CONTEXT,
      ).findings[0]?.fingerprint;

    expect(build("#enviar")).toEqual(build("#enviar"));
    expect(build("#enviar")?.strong).not.toBe(build("#cancelar")?.strong);
  });

  it("mantiene la huella aproximada cuando cambia solo el selector", () => {
    const build = (selector: string) =>
      normalizeAxeResults(
        raw({
          violations: [
            {
              id: "button-name",
              impact: "critical",
              description: "",
              help: "",
              tags: [],
              nodes: [{ target: [selector], html: "<button></button>" }],
            },
          ],
        }),
        CONTEXT,
      ).findings[0]?.fingerprint;

    expect(build("#enviar")?.loose).toBe(build("main > button:nth-child(3)")?.loose);
  });

  it("no guarda el HTML completo: el fragmento está saneado", () => {
    const result = normalizeAxeResults(
      raw({
        violations: [
          {
            id: "label",
            impact: "critical",
            description: "",
            help: "",
            tags: [],
            nodes: [{ target: ["input"], html: '<input type="text" value="secreto-123">' }],
          },
        ],
      }),
      CONTEXT,
    );
    const evidence = result.findings[0]?.nodes[0]?.evidence[0];
    expect(evidence?.content).not.toContain("secreto-123");
    expect(evidence?.redacted).toBe(true);
  });

  it("guarda como mucho MAX_NODES_PER_FINDING elementos pero cuenta todos", () => {
    const nodes = Array.from({ length: MAX_NODES_PER_FINDING + 10 }, (_, index) => ({
      target: [`img.n${String(index)}`],
      html: `<img class="n${String(index)}">`,
    }));
    const result = normalizeAxeResults(
      raw({
        violations: [
          {
            id: "image-alt",
            impact: "critical",
            description: "d",
            help: "h",
            tags: [],
            nodes,
          },
        ],
      }),
      CONTEXT,
    );
    const finding = result.findings[0];
    expect(finding?.nodes).toHaveLength(MAX_NODES_PER_FINDING);
    expect(finding?.affectedNodeCount).toBe(MAX_NODES_PER_FINDING + 10);
    expect(result.summary.affectedNodes).toBe(MAX_NODES_PER_FINDING + 10);
  });
});
