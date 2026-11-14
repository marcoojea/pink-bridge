import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createPinkBridge, type PinkBridgeApp } from "../app.js";
import { analysisSchema, findingsResponseSchema } from "@pink-bridge/shared";

const FIXTURE = fileURLToPath(
  new URL("../../../../tests/fixtures/demo/index.html", import.meta.url),
);
const TOKEN = "token-de-prueba-de-16-o-mas";

let bridge: PinkBridgeApp | undefined;

afterEach(async () => {
  await bridge?.app.close();
  bridge = undefined;
});

describe("token opcional de la API", () => {
  it("exige Authorization Bearer en /api salvo /api/health", async () => {
    bridge = createPinkBridge({ security: { apiToken: TOKEN } });
    await bridge.app.ready();

    const health = await bridge.app.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);

    const denied = await bridge.app.inject({ method: "GET", url: "/api/analyses" });
    expect(denied.statusCode).toBe(401);
    expect(denied.headers["www-authenticate"]).toContain("Bearer");
    expect(denied.json<{ error: { code: string } }>().error.code).toBe("unauthorized");

    const allowed = await bridge.app.inject({
      method: "GET",
      url: "/api/analyses",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(allowed.statusCode).toBe(200);
  });

  it("sin token configurado la API responde sin cabecera de autorización", async () => {
    bridge = createPinkBridge();
    await bridge.app.ready();
    const response = await bridge.app.inject({ method: "GET", url: "/api/analyses" });
    expect(response.statusCode).toBe(200);
  });
});

describe("límite de creación de análisis", () => {
  it("responde 429 cuando una IP supera el máximo por minuto", async () => {
    const app = createPinkBridge({ security: { createPerMinute: 2 } });
    bridge = app;
    await app.app.ready();
    const send = () =>
      app.app.inject({
        method: "POST",
        url: "/api/analyses",
        headers: { "content-type": "application/json" },
        payload: {},
      });

    expect((await send()).statusCode).toBe(400);
    expect((await send()).statusCode).toBe(400);
    const limited = await send();
    expect(limited.statusCode).toBe(429);
    expect(limited.json<{ error: { code: string } }>().error.code).toBe("rate_limited");
  });

  it("no limita las consultas de lectura", async () => {
    bridge = createPinkBridge({ security: { createPerMinute: 1 } });
    await bridge.app.ready();
    for (let index = 0; index < 3; index += 1) {
      const response = await bridge.app.inject({ method: "GET", url: "/api/analyses" });
      expect(response.statusCode).toBe(200);
    }
  });
});

describe("paginación de incidencias", () => {
  it("devuelve la página pedida con el total real", async () => {
    bridge = createPinkBridge({ service: { demoFixturePath: FIXTURE } });
    await bridge.app.ready();
    const created = await bridge.app.inject({
      method: "POST",
      url: "/api/analyses",
      headers: { "content-type": "application/json" },
      payload: { target: "demo", submissionToken: randomUUID() },
    });
    const analysis = analysisSchema.parse(created.json());
    await bridge.service.drain();

    const all = findingsResponseSchema.parse(
      (
        await bridge.app.inject({ method: "GET", url: `/api/analyses/${analysis.id}/findings` })
      ).json(),
    );
    expect(all.total).toBeGreaterThan(2);
    expect(all.limit).toBe(1000);
    expect(all.offset).toBe(0);

    const page = findingsResponseSchema.parse(
      (
        await bridge.app.inject({
          method: "GET",
          url: `/api/analyses/${analysis.id}/findings?limit=2&offset=1`,
        })
      ).json(),
    );
    expect(page.items).toHaveLength(2);
    expect(page.items[0]?.id).toBe(all.items[1]?.id);
    expect(page.total).toBe(all.total);
    expect(page.limit).toBe(2);
    expect(page.offset).toBe(1);
  });

  it("rechaza un límite fuera de rango", async () => {
    bridge = createPinkBridge();
    await bridge.app.ready();
    const response = await bridge.app.inject({
      method: "GET",
      url: `/api/analyses/${randomUUID()}/findings?limit=5000`,
    });
    expect(response.statusCode).toBe(400);
  });
});
