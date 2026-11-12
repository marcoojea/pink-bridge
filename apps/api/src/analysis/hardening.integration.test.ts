import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPinkBridge, type PinkBridgeApp } from "../app.js";

let bridge: PinkBridgeApp;
let full: PinkBridgeApp;

beforeAll(async () => {
  bridge = createPinkBridge();
  full = createPinkBridge({ service: { maxPending: 0 } });
  await bridge.app.ready();
  await full.app.ready();
});

afterAll(async () => {
  await bridge.app.close();
  await full.app.close();
});

describe("endurecimiento del servicio", () => {
  it("rechaza nuevos análisis con 429 cuando la cola está llena", async () => {
    const response = await full.app.inject({
      method: "POST",
      url: "/api/analyses",
      headers: { "content-type": "application/json" },
      payload: { url: "https://ejemplo.com/", submissionToken: randomUUID() },
    });
    expect(response.statusCode).toBe(429);
    expect(response.json<{ error: { code: string } }>().error.code).toBe("queue_full");
  });

  it("guarda la URL sin fragmento para que no persistan fragmentos con datos", async () => {
    const response = await bridge.app.inject({
      method: "POST",
      url: "/api/analyses",
      headers: { "content-type": "application/json" },
      payload: { url: "https://ejemplo.com/ruta#access_token=abc", submissionToken: randomUUID() },
    });
    expect(response.statusCode).toBe(202);
    const body = response.json<{ url: string; normalizedUrl: string }>();
    expect(body.url).toBe("https://ejemplo.com/ruta");
    expect(body.normalizedUrl).toBe("https://ejemplo.com/ruta");
    await bridge.service.stop();
  });
});
