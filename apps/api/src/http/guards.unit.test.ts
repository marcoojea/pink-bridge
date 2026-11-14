import { describe, expect, it } from "vitest";
import { createFixedWindowLimiter, hasBearerToken } from "./guards.js";

describe("createFixedWindowLimiter", () => {
  it("permite hasta el máximo por ventana y bloquea el resto", () => {
    const limiter = createFixedWindowLimiter(2, 60_000, () => 0);
    expect(limiter.take("ip")).toBe(true);
    expect(limiter.take("ip")).toBe(true);
    expect(limiter.take("ip")).toBe(false);
  });

  it("cuenta cada clave por separado", () => {
    const limiter = createFixedWindowLimiter(1, 60_000, () => 0);
    expect(limiter.take("a")).toBe(true);
    expect(limiter.take("b")).toBe(true);
  });

  it("reinicia la cuenta cuando termina la ventana", () => {
    let now = 0;
    const limiter = createFixedWindowLimiter(1, 1_000, () => now);
    expect(limiter.take("ip")).toBe(true);
    expect(limiter.take("ip")).toBe(false);
    now = 1_000;
    expect(limiter.take("ip")).toBe(true);
  });

  it("descarta las ventanas caducadas cuando hay muchas claves", () => {
    let now = 0;
    const limiter = createFixedWindowLimiter(1, 1_000, () => now);
    for (let index = 0; index <= 10_000; index += 1) {
      limiter.take(`ip-${String(index)}`);
    }
    now = 5_000;
    expect(limiter.take("ip-0")).toBe(true);
  });
});

describe("hasBearerToken", () => {
  const token = "token-de-prueba-largo";

  it("acepta el token correcto con el esquema Bearer", () => {
    expect(hasBearerToken(`Bearer ${token}`, token)).toBe(true);
  });

  it("rechaza ausencia de cabecera, otro esquema y otro token", () => {
    expect(hasBearerToken(undefined, token)).toBe(false);
    expect(hasBearerToken(`Basic ${token}`, token)).toBe(false);
    expect(hasBearerToken("Bearer otro-token-distinto", token)).toBe(false);
  });

  it("rechaza un token con distinta longitud sin compararlo carácter a carácter", () => {
    expect(hasBearerToken(`Bearer ${token}x`, token)).toBe(false);
  });
});
