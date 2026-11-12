import { describe, expect, it } from "vitest";
import { apiErrorSchema, createApiError, healthResponseSchema } from "./index.js";

describe("healthResponseSchema", () => {
  it("acepta una respuesta de salud válida", () => {
    const parsed = healthResponseSchema.parse({
      status: "ok",
      service: "pink-bridge-api",
      version: "0.1.0",
    });
    expect(parsed.status).toBe("ok");
  });

  it("rechaza campos desconocidos", () => {
    const result = healthResponseSchema.safeParse({
      status: "ok",
      service: "pink-bridge-api",
      version: "0.1.0",
      secret: "x",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza estados distintos de ok", () => {
    const result = healthResponseSchema.safeParse({
      status: "down",
      service: "pink-bridge-api",
      version: "0.1.0",
    });
    expect(result.success).toBe(false);
  });
});

describe("apiErrorSchema", () => {
  it("valida el error creado por createApiError", () => {
    const error = createApiError("not_found", "Recurso no encontrado");
    expect(apiErrorSchema.parse(error)).toEqual(error);
  });

  it("rechaza mensajes vacíos", () => {
    expect(apiErrorSchema.safeParse(createApiError("x", "")).success).toBe(false);
  });
});
