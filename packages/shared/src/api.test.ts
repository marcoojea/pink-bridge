import { describe, expect, it } from "vitest";
import {
  analysisSchema,
  createAnalysisRequestSchema,
  findingSchema,
  findingsQuerySchema,
  listAnalysesQuerySchema,
  updateReviewRequestSchema,
} from "./index.js";

const TOKEN = "0f8fad5b-d9cb-469f-a165-8c0a6a9b2d3e";

describe("createAnalysisRequestSchema", () => {
  it("acepta una URL con token de envío", () => {
    expect(
      createAnalysisRequestSchema.parse({ url: "https://example.com", submissionToken: TOKEN }),
    ).toEqual({ url: "https://example.com", submissionToken: TOKEN });
  });

  it("acepta el target demo", () => {
    expect(
      createAnalysisRequestSchema.safeParse({ target: "demo", submissionToken: TOKEN }).success,
    ).toBe(true);
  });

  it("exige exactamente una fuente: url o target", () => {
    expect(createAnalysisRequestSchema.safeParse({ submissionToken: TOKEN }).success).toBe(false);
    expect(
      createAnalysisRequestSchema.safeParse({
        url: "https://example.com",
        target: "demo",
        submissionToken: TOKEN,
      }).success,
    ).toBe(false);
  });

  it("rechaza tokens de envío que no son UUID y campos desconocidos", () => {
    expect(
      createAnalysisRequestSchema.safeParse({ url: "https://a.com", submissionToken: "x" }).success,
    ).toBe(false);
    expect(
      createAnalysisRequestSchema.safeParse({
        url: "https://a.com",
        submissionToken: TOKEN,
        extra: 1,
      }).success,
    ).toBe(false);
  });
});

describe("listAnalysesQuerySchema", () => {
  it("aplica valores por defecto y convierte cadenas numéricas", () => {
    expect(listAnalysesQuerySchema.parse({})).toEqual({ limit: 20, offset: 0 });
    expect(listAnalysesQuerySchema.parse({ limit: "5", offset: "10" })).toEqual({
      limit: 5,
      offset: 10,
    });
  });

  it("limita el tamaño de página", () => {
    expect(listAnalysesQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(listAnalysesQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });
});

describe("findingsQuerySchema", () => {
  it("acepta filtros combinables y rechaza valores fuera de catálogo", () => {
    expect(findingsQuerySchema.parse({ kind: "automatic", impact: "critical" })).toEqual({
      kind: "automatic",
      impact: "critical",
    });
    expect(findingsQuerySchema.safeParse({ kind: "otro" }).success).toBe(false);
    expect(findingsQuerySchema.safeParse({ impact: "enorme" }).success).toBe(false);
  });
});

describe("updateReviewRequestSchema", () => {
  it("acepta los estados de revisión y nota opcional", () => {
    expect(updateReviewRequestSchema.parse({ status: "accepted", note: "Riesgo bajo" })).toEqual({
      status: "accepted",
      note: "Riesgo bajo",
    });
  });

  it("rechaza estados fuera de catálogo y notas demasiado largas", () => {
    expect(updateReviewRequestSchema.safeParse({ status: "aprobada" }).success).toBe(false);
    expect(
      updateReviewRequestSchema.safeParse({ status: "pending", note: "x".repeat(501) }).success,
    ).toBe(false);
  });
});

describe("analysisSchema y findingSchema", () => {
  it("validan un análisis completado", () => {
    const analysis = analysisSchema.parse({
      id: TOKEN,
      url: "https://example.com/",
      normalizedUrl: "https://example.com/",
      source: "url",
      createdAt: "2026-11-12T10:00:00.000Z",
      startedAt: "2026-11-12T10:00:01.000Z",
      finishedAt: "2026-11-12T10:00:05.000Z",
      durationMs: 4000,
      status: "completed",
      stage: "completed",
      axeVersion: "4.14.0",
      summary: {
        automaticRules: 0,
        automaticFindings: 0,
        affectedNodes: 0,
        needsReview: 0,
        passedRules: 40,
        byImpact: { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 },
      },
      errorCode: null,
      errorMessage: null,
    });
    expect(analysis.status).toBe("completed");
  });

  it("rechaza fechas que no son ISO 8601", () => {
    expect(
      analysisSchema.safeParse({
        id: TOKEN,
        url: "https://example.com/",
        normalizedUrl: "https://example.com/",
        source: "url",
        createdAt: "12/11/2026",
        startedAt: null,
        finishedAt: null,
        durationMs: null,
        status: "queued",
        stage: null,
        axeVersion: null,
        summary: null,
        errorCode: null,
        errorMessage: null,
      }).success,
    ).toBe(false);
  });

  it("valida una incidencia con huellas hexadecimales de 64 caracteres", () => {
    const hash = "a".repeat(64);
    const parsed = findingSchema.parse({
      id: `${TOKEN}:automatic:image-alt`,
      analysisId: TOKEN,
      kind: "automatic",
      ruleId: "image-alt",
      description: "Una imagen no tiene texto alternativo.",
      help: "Images must have alternative text",
      helpUrl: null,
      impact: "critical",
      wcagReferences: ["1.1.1"],
      affectedNodeCount: 0,
      recommendation: "Añade alt.",
      detectedAt: "2026-11-12T10:00:00.000Z",
      fingerprint: { strong: hash, loose: hash },
      nodes: [],
    });
    expect(parsed.ruleId).toBe("image-alt");

    expect(
      findingSchema.safeParse({
        ...parsed,
        fingerprint: { strong: "no-hex", loose: hash },
      }).success,
    ).toBe(false);
  });
});
