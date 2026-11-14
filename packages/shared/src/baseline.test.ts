import { describe, expect, it } from "vitest";
import { baselineSchema, BASELINE_VERSION } from "./baseline.js";

const FINGERPRINT = { strong: "a".repeat(64), loose: "b".repeat(64) };

function valid(overrides: Record<string, unknown> = {}) {
  return {
    version: BASELINE_VERSION,
    url: "https://ejemplo.com/",
    mode: "page",
    createdAt: "2026-11-14T10:00:00.000Z",
    axeVersion: "4.14.0",
    findings: [
      {
        ruleId: "image-alt",
        kind: "automatic",
        impact: "critical",
        affectedNodeCount: 2,
        fingerprint: FINGERPRINT,
      },
    ],
    ...overrides,
  };
}

describe("baselineSchema", () => {
  it("acepta una línea base válida, con y sin página y viewport", () => {
    expect(baselineSchema.safeParse(valid()).success).toBe(true);
    const withPage = valid({
      mode: "site",
      findings: [
        {
          ruleId: "link-name",
          kind: "automatic",
          impact: "serious",
          pageUrl: "https://ejemplo.com/contacto",
          viewport: "mobile",
          affectedNodeCount: 1,
          fingerprint: FINGERPRINT,
        },
      ],
    });
    expect(baselineSchema.safeParse(withPage).success).toBe(true);
  });

  it("rechaza una versión distinta del formato", () => {
    expect(baselineSchema.safeParse(valid({ version: 2 })).success).toBe(false);
  });

  it("rechaza campos desconocidos, incluido el HTML de una incidencia", () => {
    const withHtml = valid({
      findings: [
        {
          ruleId: "image-alt",
          kind: "automatic",
          impact: "critical",
          affectedNodeCount: 1,
          fingerprint: FINGERPRINT,
          html: "<img src='x'>",
        },
      ],
    });
    expect(baselineSchema.safeParse(withHtml).success).toBe(false);
  });

  it("rechaza huellas que no son SHA-256 en hexadecimal", () => {
    const bad = valid({
      findings: [
        {
          ruleId: "image-alt",
          kind: "automatic",
          impact: "critical",
          affectedNodeCount: 1,
          fingerprint: { strong: "xyz", loose: "b".repeat(64) },
        },
      ],
    });
    expect(baselineSchema.safeParse(bad).success).toBe(false);
  });

  it("rechaza una fecha de creación que no es ISO", () => {
    expect(baselineSchema.safeParse(valid({ createdAt: "ayer" })).success).toBe(false);
  });
});
