import { describe, expect, it } from "vitest";
import { AnalysisInputError, normalizeTargetUrl } from "./urlPolicy.js";

function codeOf(input: string): string | undefined {
  try {
    normalizeTargetUrl(input);
    return undefined;
  } catch (error) {
    return error instanceof AnalysisInputError ? error.code : "unexpected";
  }
}

describe("normalizeTargetUrl", () => {
  it("acepta https y devuelve la URL normalizada sin fragmento", () => {
    const result = normalizeTargetUrl("  https://Example.com/ruta?x=1#seccion  ");
    expect(result.normalized).toBe("https://example.com/ruta?x=1");
  });

  it("elimina el puerto por defecto y mantiene la ruta", () => {
    expect(normalizeTargetUrl("http://example.com:80/a").normalized).toBe("http://example.com/a");
    expect(normalizeTargetUrl("https://example.com:443/").normalized).toBe("https://example.com/");
  });

  it("rechaza protocolos distintos de http y https", () => {
    expect(codeOf("javascript:alert(1)")).toBe("unsupported_protocol");
    expect(codeOf("file:///etc/passwd")).toBe("unsupported_protocol");
    expect(codeOf("data:text/html,hola")).toBe("unsupported_protocol");
    expect(codeOf("ftp://example.com/")).toBe("unsupported_protocol");
  });

  it("rechaza credenciales embebidas", () => {
    expect(codeOf("https://usuario:clave@example.com/")).toBe("credentials_in_url");
    expect(codeOf("https://usuario@example.com/")).toBe("credentials_in_url");
  });

  it("rechaza localhost y nombres de red local", () => {
    expect(codeOf("http://localhost/")).toBe("blocked_destination");
    expect(codeOf("http://LOCALHOST./")).toBe("blocked_destination");
    expect(codeOf("http://app.localhost/")).toBe("blocked_destination");
    expect(codeOf("http://printer.local/")).toBe("blocked_destination");
    expect(codeOf("http://db.internal/")).toBe("blocked_destination");
  });

  it("rechaza puertos no permitidos por defecto", () => {
    expect(codeOf("http://example.com:8080/")).toBe("invalid_url");
    expect(codeOf("https://example.com:22/")).toBe("invalid_url");
  });

  it("acepta puertos adicionales si se pasan explícitamente", () => {
    expect(() => normalizeTargetUrl("http://example.com:8080/", [8080])).not.toThrow();
  });

  it("rechaza parámetros de consulta que parecen tokens o credenciales", () => {
    expect(codeOf("https://example.com/?token=abc")).toBe("sensitive_query_parameter");
    expect(codeOf("https://example.com/?api_key=abc")).toBe("sensitive_query_parameter");
    expect(codeOf("https://example.com/?access_token=abc")).toBe("sensitive_query_parameter");
    expect(codeOf("https://example.com/?password=abc")).toBe("sensitive_query_parameter");
  });

  it("rechaza entradas vacías, mal formadas, con espacios o demasiado largas", () => {
    expect(codeOf("")).toBe("invalid_url");
    expect(codeOf("   ")).toBe("invalid_url");
    expect(codeOf("no es una url")).toBe("invalid_url");
    expect(codeOf("https://exa mple.com/")).toBe("invalid_url");
    expect(codeOf(`https://example.com/${"a".repeat(2100)}`)).toBe("url_too_long");
  });

  it("no decide sobre IPs literales: esa comprobación pertenece al guardia SSRF en runtime", () => {
    expect(codeOf("http://127.0.0.1/")).toBeUndefined();
  });
});
