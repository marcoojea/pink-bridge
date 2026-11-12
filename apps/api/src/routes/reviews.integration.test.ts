import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiErrorSchema, reviewStateSchema, type Finding } from "@pink-bridge/shared";
import { createPinkBridge, type PinkBridgeApp } from "../app.js";

const FIXTURE = fileURLToPath(
  new URL("../../../../tests/fixtures/demo/index.html", import.meta.url),
);

let bridge: PinkBridgeApp;
let analysisId: string;
let findingId: string;

beforeAll(async () => {
  bridge = createPinkBridge({ service: { demoFixturePath: FIXTURE } });
  await bridge.app.ready();
  const created = await bridge.app.inject({
    method: "POST",
    url: "/api/analyses",
    headers: { "content-type": "application/json" },
    payload: { target: "demo", submissionToken: randomUUID() },
  });
  analysisId = created.json<{ id: string }>().id;
  await bridge.service.drain();
  const findings = await bridge.service.findings(analysisId, { kind: "automatic" });
  findingId = (findings ?? [])[0]?.id ?? "";
}, 120_000);

afterAll(async () => {
  await bridge.app.close();
});

function patch(id: string, payload: unknown) {
  return bridge.app.inject({
    method: "PATCH",
    url: `/api/findings/${encodeURIComponent(id)}/review`,
    headers: { "content-type": "application/json" },
    payload: payload as Record<string, unknown>,
  });
}

describe("revisiones de incidencias", () => {
  it("guarda el estado y la nota sin tocar la auditoría", async () => {
    const before = await bridge.service.findings(analysisId, {});

    const response = await patch(findingId, {
      status: "reviewed",
      note: "Revisada con la persona de contenidos.",
    });
    expect(response.statusCode).toBe(200);
    const review = reviewStateSchema.parse(response.json());
    expect(review).toMatchObject({
      findingId,
      status: "reviewed",
      note: "Revisada con la persona de contenidos.",
    });

    const after = await bridge.service.findings(analysisId, {});
    expect(after).toEqual(before);
    expect(JSON.stringify(after)).not.toContain("reviewed");
  });

  it("reemplaza el estado anterior en lugar de acumular revisiones", async () => {
    await patch(findingId, { status: "accepted" });
    const response = await patch(findingId, {
      status: "fixed",
      note: "Alt añadido en la plantilla.",
    });
    expect(response.statusCode).toBe(200);

    const list = await bridge.app.inject({
      method: "GET",
      url: `/api/analyses/${analysisId}/reviews`,
    });
    const items = list.json<{
      items: { findingId: string; status: string; note: string | null }[];
    }>().items;
    const matching = items.filter((item) => item.findingId === findingId);
    expect(matching).toHaveLength(1);
    expect(matching[0]).toMatchObject({ status: "fixed", note: "Alt añadido en la plantilla." });
  });

  it("rechaza estados fuera de catálogo, notas largas y cuerpos mal formados", async () => {
    const invalidStatus = await patch(findingId, { status: "aprobada" });
    expect(invalidStatus.statusCode).toBe(400);
    expect(apiErrorSchema.parse(invalidStatus.json()).error.code).toBe("validation_error");

    const longNote = await patch(findingId, { status: "pending", note: "x".repeat(501) });
    expect(longNote.statusCode).toBe(400);

    const extra = await patch(findingId, { status: "pending", autor: "nadie" });
    expect(extra.statusCode).toBe(400);
  });

  it("responde 404 para incidencias inexistentes y análisis desconocidos", async () => {
    const unknownFinding = await patch("no-existe:automatic:x", { status: "reviewed" });
    expect(unknownFinding.statusCode).toBe(404);

    const unknownAnalysis = await bridge.app.inject({
      method: "GET",
      url: `/api/analyses/${randomUUID()}/reviews`,
    });
    expect(unknownAnalysis.statusCode).toBe(404);
  });

  it("no almacena revisiones de incidencias de otro análisis al listar", async () => {
    const reviews = await bridge.service.reviews(analysisId);
    const findings: Finding[] = (await bridge.service.findings(analysisId, {})) ?? [];
    const ids = new Set(findings.map((finding) => finding.id));
    expect((reviews ?? []).every((review) => ids.has(review.findingId))).toBe(true);
  });
});
