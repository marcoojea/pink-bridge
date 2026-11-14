import { describe, expect, it } from "vitest";
import { parseCliArgs, UsageError } from "./args.js";

function audit(argv: string[]) {
  const parsed = parseCliArgs(["audit", ...argv]);
  if (parsed.kind !== "audit") {
    throw new Error("Se esperaba un comando audit.");
  }
  return parsed.options;
}

describe("parseCliArgs", () => {
  it("usa valores seguros por defecto: una página, pausa de 500 ms y umbral grave", () => {
    const options = audit(["https://ejemplo.com/"]);
    expect(options).toEqual({
      url: "https://ejemplo.com/",
      failOnNew: false,
      minImpact: "serious",
      includeReview: false,
      maxPages: 1,
      pauseMs: 500,
      demoSite: false,
    });
  });

  it("lee todas las opciones explícitas", () => {
    const options = audit([
      "https://ejemplo.com/",
      "--baseline",
      "base.json",
      "--write-baseline",
      "nueva.json",
      "--fail-on-new",
      "--min-impact",
      "critical",
      "--include-review",
      "--report",
      "informe",
      "--max-pages",
      "4",
      "--pause-ms",
      "0",
    ]);
    expect(options).toMatchObject({
      baseline: "base.json",
      writeBaseline: "nueva.json",
      failOnNew: true,
      minImpact: "critical",
      includeReview: true,
      report: "informe",
      maxPages: 4,
      pauseMs: 0,
    });
  });

  it("el sitio de demostración no lleva dirección y revisa cinco páginas por defecto", () => {
    const options = audit(["--demo-site"]);
    expect(options).toMatchObject({ demoSite: true, url: "", maxPages: 5 });
  });

  it("pide ayuda con -h o --help", () => {
    expect(parseCliArgs(["--help"])).toEqual({ kind: "help" });
    expect(parseCliArgs(["-h"])).toEqual({ kind: "help" });
  });

  const invalid: [string, string[]][] = [
    ["sin comando", []],
    ["comando desconocido", ["explora", "https://ejemplo.com/"]],
    ["sin dirección", ["audit"]],
    ["dirección y demo a la vez", ["audit", "https://ejemplo.com/", "--demo-site"]],
    ["demasiados argumentos", ["audit", "https://a.com", "https://b.com"]],
    ["max-pages cero", ["audit", "https://a.com", "--max-pages", "0"]],
    ["max-pages por encima del tope", ["audit", "https://a.com", "--max-pages", "11"]],
    ["max-pages no numérico", ["audit", "https://a.com", "--max-pages", "x"]],
    ["pausa negativa", ["audit", "https://a.com", "--pause-ms", "-1"]],
    ["pausa excesiva", ["audit", "https://a.com", "--pause-ms", "10001"]],
    ["umbral desconocido", ["audit", "https://a.com", "--min-impact", "enorme"]],
    ["fail-on-new sin línea base", ["audit", "https://a.com", "--fail-on-new"]],
    ["opción desconocida", ["audit", "https://a.com", "--allow-local"]],
  ];

  it.each(invalid)("rechaza %s con un error de uso", (_name, argv) => {
    expect(() => parseCliArgs(argv)).toThrow(UsageError);
  });
});
