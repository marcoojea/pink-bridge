import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { baselineSchema } from "@pink-bridge/shared";
import { EXIT, main } from "./main.js";

/** Ejecuta el CLI en proceso y recoge su salida. Usa el sitio de demostración: sin red. */
async function run(argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(
    argv,
    (line) => {
      out.push(line);
    },
    (line) => {
      err.push(line);
    },
  );
  return { code, out: out.join("\n"), err: err.join("\n") };
}

let folder: string;

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), "pink-bridge-cli-"));
});

afterAll(async () => {
  await rm(folder, { recursive: true, force: true });
});

const DEMO = ["audit", "--demo-site", "--max-pages", "2", "--pause-ms", "0"];

describe("CLI audit (sitio de demostración)", () => {
  it("escribe línea base e informes y sale con 0 sin --fail-on-new", async () => {
    const baselinePath = join(folder, "baseline.json");
    const reportPath = join(folder, "informe");
    const result = await run([...DEMO, "--write-baseline", baselinePath, "--report", reportPath]);

    expect(result.code).toBe(EXIT.ok);
    expect(result.out).toContain("Pink Bridge · auditoría de sitio");
    expect(result.out).toContain("  Páginas revisadas: 2");

    const saved = baselineSchema.parse(JSON.parse(await readFile(baselinePath, "utf8")));
    expect(saved.mode).toBe("site");
    expect(saved.findings.length).toBeGreaterThan(0);

    const html = await readFile(join(reportPath, "report.html"), "utf8");
    expect(html).toContain("<!doctype html>");
    const json = JSON.parse(await readFile(join(reportPath, "report.json"), "utf8")) as {
      analysis: { normalizedUrl: string };
    };
    expect(json.analysis.normalizedUrl).toBe("https://demo.pinkbridge.test/");
  }, 180_000);

  it("con la misma línea base no hay nuevas incidencias y sale con 0", async () => {
    const baselinePath = join(folder, "baseline.json");
    const result = await run([...DEMO, "--baseline", baselinePath, "--fail-on-new"]);
    expect(result.code).toBe(EXIT.ok);
    expect(result.out).toContain("Nuevas: 0");
    expect(result.out).toContain(
      "Resultado: sin nuevas incidencias con gravedad grave o superior.",
    );
  }, 180_000);

  it("con una línea base sin algunas incidencias, falla con código 1 si son graves", async () => {
    const baselinePath = join(folder, "baseline.json");
    const full = baselineSchema.parse(JSON.parse(await readFile(baselinePath, "utf8")));
    const reduced = { ...full, findings: full.findings.slice(1) };
    const reducedPath = join(folder, "reducida.json");
    await writeFile(reducedPath, JSON.stringify(reduced), "utf8");

    const result = await run([...DEMO, "--baseline", reducedPath, "--fail-on-new"]);
    expect(result.code).toBe(EXIT.newFindings);
    expect(result.out).toContain("(bloquea el CI)");
    expect(result.out).toContain("Resultado: FALLO.");

    const soft = await run([...DEMO, "--baseline", reducedPath]);
    expect(soft.code).toBe(EXIT.ok);
    expect(soft.out).toContain("Sin --fail-on-new, no falla.");
  }, 180_000);

  it("una línea base de otra dirección se rechaza con código 2", async () => {
    const baselinePath = join(folder, "baseline.json");
    const result = await run([
      "audit",
      "https://otra.example/",
      "--baseline",
      baselinePath,
      "--max-pages",
      "1",
    ]);
    expect(result.code).toBe(EXIT.usage);
    expect(result.err).toContain("La línea base es de");
  });

  it("un fichero de línea base inválido se rechaza con código 2", async () => {
    const broken = join(folder, "roto.json");
    await writeFile(broken, "{ esto no es json", "utf8");
    const result = await run([...DEMO, "--baseline", broken]);
    expect(result.code).toBe(EXIT.usage);
    expect(result.err).toContain("no es JSON válido");
  });

  it("una dirección bloqueada por la política de red sale con código 3, nunca con 0", async () => {
    const result = await run(["audit", "http://127.0.0.1/", "--max-pages", "1"]);
    expect(result.code).toBe(EXIT.failed);
    expect(result.err).toContain("La auditoría no se pudo completar");
  }, 120_000);

  it("una URL con puerto no permitido es un error de uso, no de auditoría", async () => {
    const result = await run(["audit", "https://ejemplo.com:8443/"]);
    expect(result.code).toBe(EXIT.usage);
  });

  it("--help muestra el uso y sale con 0", async () => {
    const result = await run(["--help"]);
    expect(result.code).toBe(EXIT.ok);
    expect(result.out).toContain("--fail-on-new");
  });
});
