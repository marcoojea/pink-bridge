import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apiErrorSchema, healthResponseSchema } from "@pink-bridge/shared";
import { buildApp } from "./app.js";

describe("API (integración)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildApp();
    app.post("/api/echo", (request) => request.body);
    app.get("/api/boom", () => {
      throw new Error("secreto interno en /srv/app/db.ts:42");
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /api/health responde 200 con contrato válido", async () => {
    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(healthResponseSchema.parse(response.json())).toEqual({
      status: "ok",
      service: "pink-bridge-api",
      version: "0.1.0",
    });
  });

  it("ruta inexistente responde 404 con error estructurado", async () => {
    const response = await app.inject({ method: "GET", url: "/api/no-existe" });

    expect(response.statusCode).toBe(404);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe("not_found");
  });

  it("JSON malformado responde 400 sin filtrar detalles internos", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/echo",
      headers: { "content-type": "application/json" },
      payload: "{no es json",
    });

    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe("bad_request");
    expect(response.body).not.toMatch(/\.(js|ts):\d+/);
  });

  it("cuerpos por encima del límite responden 413", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/echo",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ data: "x".repeat(20 * 1024) }),
    });

    expect(response.statusCode).toBe(413);
  });

  it("error interno responde 500 sin filtrar el mensaje ni la ruta", async () => {
    const response = await app.inject({ method: "GET", url: "/api/boom" });

    expect(response.statusCode).toBe(500);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe("internal_error");
    expect(response.body).not.toContain("secreto interno");
    expect(response.body).not.toContain("/srv/app");
  });

  it("añade cabeceras de seguridad básicas", async () => {
    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
  });
});
