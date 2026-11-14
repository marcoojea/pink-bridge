import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Finding } from "@pink-bridge/shared";
import {
  BaselineError,
  MAX_BASELINE_BYTES,
  readBaseline,
  toBaseline,
  writeBaseline,
} from "./baseline.js";

const ANALYSIS_ID = "11111111-1111-4111-8111-111111111111";
let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "pink-bridge-baseline-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: `${ANALYSIS_ID}:automatic:image-alt`,
    analysisId: ANALYSIS_ID,
    kind: "automatic",
    ruleId: "image-alt",
    description: "Una imagen no tiene texto alternativo.",
    help: "Images must have alternative text",
    helpUrl: null,
    impact: "critical",
    wcagReferences: ["1.1.1"],
    affectedNodeCount: 2,
    recommendation: "Añade alt.",
    detectedAt: "2026-11-14T10:00:00.000Z",
    fingerprint: { strong: "a".repeat(64), loose: "b".repeat(64) },
    nodes: [
      {
        id: `${ANALYSIS_ID}:automatic:image-alt:0`,
        findingId: `${ANALYSIS_ID}:automatic:image-alt`,
        target: ["img"],
        selector: "img",
        evidence: [{ type: "html_snippet", content: "<img alt='secreto-123'>", redacted: false }],
      },
    ],
    ...overrides,
  };
}

const INPUT = {
  url: "https://ejemplo.com/",
  mode: "page" as const,
  axeVersion: "4.14.0",
  createdAt: "2026-11-14T10:00:00.000Z",
};

describe("toBaseline", () => {
  it("guarda solo lo necesario para emparejar: sin HTML, nodos ni descripciones", () => {
    const baseline = toBaseline({ ...INPUT, findings: [finding()] });
    const serialized = JSON.stringify(baseline);
    expect(serialized).not.toContain("secreto-123");
    expect(serialized).not.toContain("nodes");
    expect(serialized).not.toContain("description");
    expect(baseline.findings[0]).toEqual({
      ruleId: "image-alt",
      kind: "automatic",
      impact: "critical",
      affectedNodeCount: 2,
      fingerprint: { strong: "a".repeat(64), loose: "b".repeat(64) },
    });
  });

  it("ordena las incidencias de forma estable, sea cual sea el orden de entrada", () => {
    const first = finding({
      ruleId: "link-name",
      fingerprint: { strong: "c".repeat(64), loose: "d".repeat(64) },
    });
    const second = finding({ ruleId: "image-alt" });
    const a = toBaseline({ ...INPUT, findings: [first, second] });
    const b = toBaseline({ ...INPUT, findings: [second, first] });
    expect(a).toEqual(b);
    expect(a.findings.map((item) => item.ruleId)).toEqual(["image-alt", "link-name"]);
  });

  it("conserva página y viewport cuando la auditoría es de sitio", () => {
    const baseline = toBaseline({
      ...INPUT,
      mode: "site",
      findings: [finding({ pageUrl: "https://ejemplo.com/contacto", viewport: "mobile" })],
    });
    expect(baseline.findings[0]).toMatchObject({
      pageUrl: "https://ejemplo.com/contacto",
      viewport: "mobile",
    });
  });
});

describe("writeBaseline y readBaseline", () => {
  it("escribe JSON estable y lo lee de vuelta sin cambios", async () => {
    const path = join(directory, "baseline.json");
    const baseline = toBaseline({ ...INPUT, findings: [finding()] });
    await writeBaseline(path, baseline);
    expect(await readBaseline(path)).toEqual(baseline);
  });

  it("rechaza un fichero que no es JSON", async () => {
    const path = join(directory, "roto.json");
    await writeFile(path, "{ no es json", "utf8");
    await expect(readBaseline(path)).rejects.toThrow(BaselineError);
  });

  it("rechaza un fichero con forma inválida indicando el campo, sin volcar el contenido", async () => {
    const path = join(directory, "invalido.json");
    await writeFile(path, JSON.stringify({ version: 1, url: "x", secreto: "SECRETO-XYZ" }), "utf8");
    const error = await readBaseline(path).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BaselineError);
    expect((error as Error).message).not.toContain("SECRETO-XYZ");
  });

  it("rechaza un fichero que no existe", async () => {
    await expect(readBaseline(join(directory, "falta.json"))).rejects.toThrow(
      "No se encuentra la línea base",
    );
  });

  it("rechaza un fichero que supera el tamaño máximo", async () => {
    const path = join(directory, "enorme.json");
    await writeFile(path, "x".repeat(MAX_BASELINE_BYTES + 1), "utf8");
    await expect(readBaseline(path)).rejects.toThrow("tamaño máximo");
  });
});
