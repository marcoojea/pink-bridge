import { describe, expect, it } from "vitest";
import { analysisHref, parseRoute, routeHref } from "./router.js";

const ID = "0f8fad5b-d9cb-469f-a165-8c0a6a9b2d3e";

describe("parseRoute", () => {
  it("resuelve la portada y el histórico", () => {
    expect(parseRoute("")).toEqual({ name: "home" });
    expect(parseRoute("#")).toEqual({ name: "home" });
    expect(parseRoute("#/")).toEqual({ name: "home" });
    expect(parseRoute("#/historial")).toEqual({ name: "history" });
    expect(parseRoute("#/historial/")).toEqual({ name: "history" });
  });

  it("resuelve un análisis solo si el identificador es un UUID", () => {
    expect(parseRoute(`#/analisis/${ID}`)).toEqual({ name: "analysis", id: ID });
    expect(parseRoute("#/analisis/no-es-uuid")).toEqual({ name: "notFound" });
    expect(parseRoute("#/analisis/")).toEqual({ name: "notFound" });
  });

  it("marca como no encontrada cualquier otra ruta", () => {
    expect(parseRoute("#/desconocida")).toEqual({ name: "notFound" });
  });

  it("resuelve la comparación solo con dos identificadores UUID", () => {
    const other = "11111111-1111-4111-8111-111111111111";
    expect(parseRoute(`#/comparar/${ID}/${other}`)).toEqual({
      name: "compare",
      from: ID,
      to: other,
    });
    expect(parseRoute(`#/comparar/${ID}`)).toEqual({ name: "notFound" });
    expect(parseRoute(`#/comparar/${ID}/no-uuid`)).toEqual({ name: "notFound" });
  });

  it("genera los enlaces que el parser reconoce", () => {
    expect(parseRoute(routeHref("history"))).toEqual({ name: "history" });
    expect(parseRoute(analysisHref(ID))).toEqual({ name: "analysis", id: ID });
  });
});

describe("query del hash", () => {
  it("ignora la query al resolver la ruta", () => {
    expect(parseRoute("#/historial?tipo=automatic")).toEqual({ name: "history" });
    expect(parseRoute("#/?x=1")).toEqual({ name: "home" });
  });
});
