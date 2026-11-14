import { describe, expect, it } from "vitest";
import { demoRequest } from "./demo.js";

const ID = "0f8fad5b-d9cb-469f-a165-8c0a6a9b2d3e";
const OTHER = "11111111-1111-4111-8111-111111111111";

describe("demoRequest", () => {
  it("traduce las lecturas de la API a ficheros del snapshot", () => {
    const base = `${import.meta.env.BASE_URL}demo/`;
    expect(demoRequest("/api/analyses?limit=20&offset=0", "GET")).toBe(`${base}analyses.json`);
    expect(demoRequest(`/api/analyses/${ID}`, "GET")).toBe(`${base}analyses/${ID}.json`);
    expect(demoRequest(`/api/analyses/${ID}/findings?limit=500&offset=0`, "GET")).toBe(
      `${base}analyses/${ID}/findings.json`,
    );
    expect(demoRequest(`/api/analyses/${ID}/reviews`, "GET")).toBe(
      `${base}analyses/${ID}/reviews.json`,
    );
    expect(demoRequest(`/api/analyses/${ID}/agent-prompts`, "GET")).toBe(
      `${base}analyses/${ID}/agent-prompts.md`,
    );
  });

  it("elige el formato del informe según la consulta", () => {
    const base = `${import.meta.env.BASE_URL}demo/`;
    expect(demoRequest(`/api/analyses/${ID}/report?format=html`, "GET")).toBe(
      `${base}analyses/${ID}/report.html`,
    );
    expect(demoRequest(`/api/analyses/${ID}/report?format=json`, "GET")).toBe(
      `${base}analyses/${ID}/report.json`,
    );
  });

  it("traduce la comparación según el orden de los dos análisis", () => {
    expect(demoRequest(`/api/analyses/compare?from=${ID}&to=${OTHER}`, "GET")).toBe(
      `${import.meta.env.BASE_URL}demo/compare/${ID}__${OTHER}.json`,
    );
  });

  it("rechaza cualquier escritura y las rutas que no existen en la demo", () => {
    expect(demoRequest("/api/analyses", "POST")).toBeNull();
    expect(demoRequest(`/api/findings/${ID}/review`, "PATCH")).toBeNull();
    expect(demoRequest("/api/health", "GET")).toBeNull();
    expect(demoRequest("/api/analyses/no-es-un-uuid", "GET")).toBeNull();
    expect(demoRequest(`/api/analyses/${ID}/otra-cosa`, "GET")).toBeNull();
    expect(demoRequest(`/api/analyses/${ID}/a/b`, "GET")).toBeNull();
    expect(demoRequest("/otra/ruta", "GET")).toBeNull();
  });
});
