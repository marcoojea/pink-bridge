import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analysisSchema, apiErrorSchema, findingSchema } from "@pink-bridge/shared";
import { createPinkBridge, type PinkBridgeApp } from "../app.js";
import { InMemoryAnalysisStore, type AnalysisRecord } from "../analysis/store.js";

const FIXTURE = fileURLToPath(
  new URL("../../../../tests/fixtures/demo/index.html", import.meta.url),
);
const EXPECTED_RULES = ["button-name", "color-contrast", "heading-order", "image-alt", "link-name"];

let bridge: PinkBridgeApp;

beforeAll(async () => {
  bridge = createPinkBridge({ service: { demoFixturePath: FIXTURE } });
  await bridge.app.ready();
});

afterAll(async () => {
  await bridge.app.close();
});

async function post(body: Record<string, unknown>): Promise<LightMyRequestResponse> {
  return bridge.app.inject({
    method: "POST",
    url: "/api/analyses",
    headers: { "content-type": "application/json" },
    payload: body,
  });
}

async function waitForFinal(id: string): Promise<void> {
  await bridge.service.drain();
  const response = await bridge.app.inject({ method: "GET", url: `/api/analyses/${id}` });
  expect(["completed", "failed"]).toContain(response.json<{ status: string }>().status);
}

describe("POST /api/analyses: validación de entrada", () => {
  it("rechaza un cuerpo vacío con validation_error", async () => {
    const response = await post({});
    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe("validation_error");
  });

  it("rechaza enviar url y target a la vez", async () => {
    const response = await post({
      url: "https://example.com/",
      target: "demo",
      submissionToken: randomUUID(),
    });
    expect(response.statusCode).toBe(400);
  });

  it("rechaza un protocolo no permitido con su código", async () => {
    const response = await post({ url: "javascript:alert(1)", submissionToken: randomUUID() });
    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe("unsupported_protocol");
  });

  it("rechaza localhost antes de encolar nada", async () => {
    const response = await post({ url: "http://localhost/", submissionToken: randomUUID() });
    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe("blocked_destination");
  });

  it("rechaza tokens de envío que no son UUID", async () => {
    const response = await post({ url: "https://example.com/", submissionToken: "x" });
    expect(response.statusCode).toBe(400);
  });
});

describe("POST /api/analyses: ciclo completo", () => {
  it("analiza el fixture de demostración de extremo a extremo", async () => {
    const token = randomUUID();
    const created = await post({ target: "demo", submissionToken: token });
    expect(created.statusCode).toBe(202);
    const analysis = analysisSchema.parse(created.json());
    expect(analysis.status).toBe("queued");
    expect(analysis.source).toBe("demo");

    await waitForFinal(analysis.id);

    const detail = analysisSchema.parse(
      (await bridge.app.inject({ method: "GET", url: `/api/analyses/${analysis.id}` })).json(),
    );
    expect(detail.status).toBe("completed");
    expect(detail.stage).toBe("completed");
    expect(detail.axeVersion).toBe("4.14.0");
    expect(detail.summary?.automaticFindings).toBe(EXPECTED_RULES.length);
    expect(detail.summary?.needsReview).toBeGreaterThanOrEqual(0);
    expect(detail.durationMs).toBeGreaterThan(0);

    const findingsResponse = await bridge.app.inject({
      method: "GET",
      url: `/api/analyses/${analysis.id}/findings?kind=automatic`,
    });
    const findings = findingsResponse.json<{ items: unknown[]; total: number }>();
    expect(findings.total).toBe(EXPECTED_RULES.length);
    const parsed = findings.items.map((item) => findingSchema.parse(item));
    expect(parsed.map((finding) => finding.ruleId).sort()).toEqual(EXPECTED_RULES);
    for (const finding of parsed) {
      expect(finding.nodes.length).toBeGreaterThan(0);
      expect(finding.recommendation.length).toBeGreaterThan(0);
    }
  }, 120_000);

  it("filtra incidencias por impacto y regla", async () => {
    const created = await post({ target: "demo", submissionToken: randomUUID() });
    const analysis = analysisSchema.parse(created.json());
    await waitForFinal(analysis.id);

    const critical = await bridge.app.inject({
      method: "GET",
      url: `/api/analyses/${analysis.id}/findings?impact=critical`,
    });
    const criticalRules = critical.json<{ items: { ruleId: string; impact: string }[] }>().items;
    expect(criticalRules.every((item) => item.impact === "critical")).toBe(true);
    expect(criticalRules.map((item) => item.ruleId).sort()).toEqual(["button-name", "image-alt"]);

    const byRule = await bridge.app.inject({
      method: "GET",
      url: `/api/analyses/${analysis.id}/findings?ruleId=link-name`,
    });
    expect(byRule.json<{ total: number }>().total).toBe(1);
  }, 120_000);

  it("devuelve el mismo análisis si se reenvía el mismo token (sin duplicados)", async () => {
    const token = randomUUID();
    const first = await post({ target: "demo", submissionToken: token });
    const second = await post({ target: "demo", submissionToken: token });

    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(200);
    expect(second.json<{ id: string }>().id).toBe(first.json<{ id: string }>().id);
    await bridge.service.drain();
  }, 120_000);

  it("una URL que resuelve a loopback termina en failed, nunca en completed sin incidencias", async () => {
    const created = await post({ url: "http://127.0.0.1/", submissionToken: randomUUID() });
    expect(created.statusCode).toBe(202);
    const analysis = analysisSchema.parse(created.json());

    await waitForFinal(analysis.id);

    const detail = analysisSchema.parse(
      (await bridge.app.inject({ method: "GET", url: `/api/analyses/${analysis.id}` })).json(),
    );
    expect(detail.status).toBe("failed");
    expect(detail.errorCode).toBe("blocked_destination");
    expect(detail.summary).toBeNull();
    expect(detail.errorMessage).toBe("El destino no está permitido.");
  }, 120_000);
});

describe("consultas del histórico", () => {
  it("responde 404 para análisis inexistentes o identificadores malformados", async () => {
    const unknown = await bridge.app.inject({
      method: "GET",
      url: `/api/analyses/${randomUUID()}`,
    });
    expect(unknown.statusCode).toBe(404);
    expect(apiErrorSchema.parse(unknown.json()).error.code).toBe("not_found");

    const malformed = await bridge.app.inject({ method: "GET", url: "/api/analyses/no-es-uuid" });
    expect(malformed.statusCode).toBe(404);

    const findings = await bridge.app.inject({
      method: "GET",
      url: `/api/analyses/${randomUUID()}/findings`,
    });
    expect(findings.statusCode).toBe(404);
  });

  it("pagina el listado y rechaza parámetros fuera de rango", async () => {
    const page = await bridge.app.inject({ method: "GET", url: "/api/analyses?limit=1&offset=0" });
    expect(page.statusCode).toBe(200);
    const body = page.json<{ items: unknown[]; total: number; limit: number }>();
    expect(body.items).toHaveLength(1);
    expect(body.limit).toBe(1);
    expect(body.total).toBeGreaterThanOrEqual(2);

    const invalid = await bridge.app.inject({ method: "GET", url: "/api/analyses?limit=500" });
    expect(invalid.statusCode).toBe(400);
  });

  it("rechaza filtros de incidencias fuera de catálogo", async () => {
    const created = await post({ target: "demo", submissionToken: randomUUID() });
    const analysis = analysisSchema.parse(created.json());
    await bridge.service.drain();
    const response = await bridge.app.inject({
      method: "GET",
      url: `/api/analyses/${analysis.id}/findings?impact=enorme`,
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("demostración deshabilitada y recuperación", () => {
  it("no expone el target demo si no hay fixture configurado", async () => {
    const without = createPinkBridge();
    await without.app.ready();
    try {
      const response = await without.app.inject({
        method: "POST",
        url: "/api/analyses",
        headers: { "content-type": "application/json" },
        payload: { target: "demo", submissionToken: randomUUID() },
      });
      expect(response.statusCode).toBe(404);
    } finally {
      await without.app.close();
    }
  });

  it("marca como fallidos los análisis que quedaron en cola tras un reinicio", async () => {
    const store = new InMemoryAnalysisStore();
    const stale: AnalysisRecord = {
      id: randomUUID(),
      url: "https://example.com/",
      normalizedUrl: "https://example.com/",
      source: "url",
      submissionToken: randomUUID(),
      createdAt: "2026-11-12T10:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      status: "queued",
      stage: null,
      axeVersion: null,
      summary: null,
      errorCode: null,
      errorMessage: null,
    };
    await store.insertAnalysis(stale);

    const restarted = createPinkBridge({ store });
    await restarted.app.ready();
    try {
      const recovered = await restarted.service.recoverInterrupted();
      expect(recovered).toBe(1);
      const after = await restarted.service.get(stale.id);
      expect(after?.status).toBe("failed");
      expect(after?.errorCode).toBe("interrupted");
    } finally {
      await restarted.app.close();
    }
  });
});
