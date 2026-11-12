import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AnalysisRunError, runAnalysis } from "./runAnalysis.js";

const FIXTURE_PATH = fileURLToPath(
  new URL("../../../../tests/fixtures/demo/index.html", import.meta.url),
);

// Reglas que axe 4.14.0 detecta en el fixture (ver docs/fixture-catalog.md).
const EXPECTED_FIXTURE_RULES = [
  "button-name",
  "color-contrast",
  "heading-order",
  "image-alt",
  "link-name",
].sort();

describe("runAnalysis (integración con Chromium)", () => {
  it("analiza el fixture de demostración y detecta las 5 reglas esperadas", async () => {
    const result = await runAnalysis({
      source: { kind: "demo", fixturePath: FIXTURE_PATH },
      limits: { totalMs: 90_000, navigationMs: 30_000 },
    });

    expect(result.raw.testEngine.version).toBe("4.14.0");
    expect(result.raw.violations.map((rule) => rule.id).sort()).toEqual(EXPECTED_FIXTURE_RULES);
    expect(result.finalUrl).toBe("https://demo.pinkbridge.test/");
  }, 120_000);

  it("bloquea un host público aparente que resuelve a loopback (SSRF)", async () => {
    const error = await runAnalysis({
      source: { kind: "url", url: new URL("http://evil.example:80/") },
      resolve: () => Promise.resolve(["127.0.0.1"]),
      limits: { totalMs: 60_000, navigationMs: 15_000 },
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AnalysisRunError);
    expect((error as AnalysisRunError).code).toBe("blocked_destination");
  }, 90_000);

  it("informa de error DNS cuando el host no resuelve", async () => {
    const error = await runAnalysis({
      source: { kind: "url", url: new URL("http://no-existe.example:80/") },
      resolve: () => Promise.reject(new Error("ENOTFOUND")),
      limits: { totalMs: 60_000, navigationMs: 15_000 },
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AnalysisRunError);
    expect((error as AnalysisRunError).code).toBe("dns_error");
  }, 90_000);

  it("bloquea una IP privada literal como destino inicial", async () => {
    const error = await runAnalysis({
      source: { kind: "url", url: new URL("http://169.254.169.254:80/latest/meta-data/") },
      limits: { totalMs: 60_000, navigationMs: 15_000 },
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AnalysisRunError);
    expect((error as AnalysisRunError).code).toBe("blocked_destination");
  }, 90_000);

  it("bloquea subrecursos hostiles sin fallar la auditoría y los informa", async () => {
    const ssrfFixture = fileURLToPath(
      new URL("../../../../tests/fixtures/ssrf/index.html", import.meta.url),
    );
    const result = await runAnalysis({
      source: { kind: "demo", fixturePath: ssrfFixture },
      limits: { totalMs: 90_000, navigationMs: 30_000 },
    });

    expect(result.blockedHosts).toEqual(expect.arrayContaining(["169.254.169.254", "10.0.0.1"]));
    expect(result.blockedHosts).toContain("no-existe.invalid");
    expect(result.raw.testEngine.version).toBe("4.14.0");
  }, 120_000);

  it("notifica las etapas reales en orden", async () => {
    const stages: string[] = [];
    await runAnalysis({
      source: { kind: "demo", fixturePath: FIXTURE_PATH },
      limits: { totalMs: 90_000, navigationMs: 30_000 },
      onStage: (stage) => stages.push(stage),
    });

    expect(stages).toEqual(["preparing_browser", "navigating", "running_checks"]);
  }, 120_000);
});
