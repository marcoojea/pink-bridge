import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiErrorSchema, comparisonResultSchema } from "@pink-bridge/shared";
import { createPinkBridge, type PinkBridgeApp } from "../app.js";
import { InMemoryAnalysisStore } from "../analysis/store.js";

const FIXTURE = fileURLToPath(
  new URL("../../../../tests/fixtures/demo/index.html", import.meta.url),
);

let bridge: PinkBridgeApp;
let store: InMemoryAnalysisStore;
let demoId: string;
let secondDemoId: string;
let failedId: string;

async function runDemo(): Promise<string> {
  const response = await bridge.app.inject({
    method: "POST",
    url: "/api/analyses",
    headers: { "content-type": "application/json" },
    payload: { target: "demo", submissionToken: randomUUID() },
  });
  const id = response.json<{ id: string }>().id;
  await bridge.service.drain();
  return id;
}

beforeAll(async () => {
  store = new InMemoryAnalysisStore();
  bridge = createPinkBridge({ store, service: { demoFixturePath: FIXTURE } });
  await bridge.app.ready();
  demoId = await runDemo();
  secondDemoId = await runDemo();

  const failed = await bridge.app.inject({
    method: "POST",
    url: "/api/analyses",
    headers: { "content-type": "application/json" },
    payload: { url: "http://127.0.0.1/", submissionToken: randomUUID() },
  });
  failedId = failed.json<{ id: string }>().id;
  await bridge.service.drain();
}, 120_000);

afterAll(async () => {
  await bridge.app.close();
});

describe("informes", () => {
  it("genera un JSON descargable con el modelo normalizado y las limitaciones", async () => {
    const response = await bridge.app.inject({
      method: "GET",
      url: `/api/analyses/${demoId}/report?format=json`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.headers["content-disposition"]).toBe(
      `attachment; filename="pink-bridge-${demoId}.json"`,
    );
    const body = response.json<{
      schemaVersion: number;
      analysis: { axeVersion: string; ruleSet: string };
      findings: unknown[];
      limitations: string[];
    }>();
    expect(body.schemaVersion).toBe(1);
    expect(body.analysis.axeVersion).toBe("4.14.0");
    expect(body.analysis.ruleSet).toContain("4.14.0");
    expect(body.findings).toHaveLength(5);
    expect(body.limitations.join(" ")).toContain("no certifica la conformidad");
    expect(response.body).not.toContain("submissionToken");
  });

  it("genera un HTML con política de contenido restrictiva y todo el texto escapado", async () => {
    const findingsResponse = await bridge.app.inject({
      method: "GET",
      url: `/api/analyses/${demoId}/findings?ruleId=image-alt`,
    });
    const findingId = findingsResponse.json<{ items: { id: string }[] }>().items[0]?.id ?? "";
    await bridge.app.inject({
      method: "PATCH",
      url: `/api/findings/${encodeURIComponent(findingId)}/review`,
      headers: { "content-type": "application/json" },
      payload: { status: "reviewed", note: "<script>alert('x')</script>" },
    });

    const response = await bridge.app.inject({
      method: "GET",
      url: `/api/analyses/${demoId}/report?format=html`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(response.body.startsWith("<!doctype html>")).toBe(true);
    expect(response.body).toContain("Informe de accesibilidad");
    expect(response.body).toContain("Este informe no certifica la conformidad con WCAG 2.2.");
    expect(response.body).not.toContain("<script>alert");
    expect(response.body).toContain("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
  });

  it("no genera informe de un análisis fallido: nunca se presenta como ausencia de incidencias", async () => {
    const response = await bridge.app.inject({
      method: "GET",
      url: `/api/analyses/${failedId}/report`,
    });
    expect(response.statusCode).toBe(409);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe("report_unavailable");
  });

  it("valida el formato y responde 404 para análisis desconocidos", async () => {
    const invalid = await bridge.app.inject({
      method: "GET",
      url: `/api/analyses/${demoId}/report?format=pdf`,
    });
    expect(invalid.statusCode).toBe(400);

    const unknown = await bridge.app.inject({
      method: "GET",
      url: `/api/analyses/${randomUUID()}/report`,
    });
    expect(unknown.statusCode).toBe(404);
  });
});

describe("comparación", () => {
  it("compara dos ejecuciones del mismo fixture: todas las incidencias persisten con coincidencia exacta", async () => {
    const response = await bridge.app.inject({
      method: "GET",
      url: `/api/analyses/compare?from=${demoId}&to=${secondDemoId}`,
    });

    expect(response.statusCode).toBe(200);
    const result = comparisonResultSchema.parse(response.json());
    expect(result.persistentFindings).toHaveLength(5);
    expect(result.persistentFindings.every((entry) => entry.matchType === "exact")).toBe(true);
    expect(result.newFindings).toEqual([]);
    expect(result.resolvedFindings).toEqual([]);
    expect(result.summaryDelta.automaticFindings).toBe(0);
    expect(result.summaryDelta.affectedNodes).toBe(0);
    expect(result.limitations.join(" ")).toContain("No equivale a una corrección verificada");
  });

  it("rechaza comparar un análisis fallido", async () => {
    const response = await bridge.app.inject({
      method: "GET",
      url: `/api/analyses/compare?from=${demoId}&to=${failedId}`,
    });
    expect(response.statusCode).toBe(409);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe("analysis_not_completed");
  });

  it("rechaza comparar auditorías de URLs distintas", async () => {
    const otherId = randomUUID();
    await store.insertAnalysis({
      id: otherId,
      url: "https://otra.example/",
      normalizedUrl: "https://otra.example/",
      source: "url",
      submissionToken: randomUUID(),
      createdAt: "2026-11-12T10:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      status: "completed",
      stage: "completed",
      axeVersion: "4.14.0",
      summary: null,
      errorCode: null,
      errorMessage: null,
    });

    const response = await bridge.app.inject({
      method: "GET",
      url: `/api/analyses/compare?from=${demoId}&to=${otherId}`,
    });
    expect(response.statusCode).toBe(409);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe("incompatible_analyses");
  });

  it("valida los parámetros y responde 404 para análisis inexistentes", async () => {
    const missing = await bridge.app.inject({
      method: "GET",
      url: `/api/analyses/compare?from=${demoId}`,
    });
    expect(missing.statusCode).toBe(400);

    const unknown = await bridge.app.inject({
      method: "GET",
      url: `/api/analyses/compare?from=${demoId}&to=${randomUUID()}`,
    });
    expect(unknown.statusCode).toBe(404);
  });
});
