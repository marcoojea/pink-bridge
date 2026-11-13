import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analysisSchema, findingSchema, type Finding } from "@pink-bridge/shared";
import { createPinkBridge, type PinkBridgeApp } from "../app.js";
import { randomUUID } from "node:crypto";

const FIXTURE = fileURLToPath(
  new URL("../../../../tests/fixtures/demo/index.html", import.meta.url),
);
const SITE = fileURLToPath(new URL("../../../../tests/fixtures/site", import.meta.url));

let bridge: PinkBridgeApp;
let analysisId: string;
let findings: Finding[] = [];

beforeAll(async () => {
  bridge = createPinkBridge({ service: { demoFixturePath: FIXTURE, demoSiteRoot: SITE } });
  await bridge.app.ready();
  const created = await bridge.app.inject({
    method: "POST",
    url: "/api/analyses",
    headers: { "content-type": "application/json" },
    payload: { target: "demo-site", maxPages: 4, submissionToken: randomUUID() },
  });
  analysisId = created.json<{ id: string }>().id;
  await bridge.service.drain();
  findings = (await bridge.service.findings(analysisId, {})) ?? [];
}, 600_000);

afterAll(async () => {
  await bridge.app.close();
}, 60_000);

describe("recorrido de sitio (demo)", () => {
  it("visita las páginas y las audita en tres tamaños", async () => {
    const detail = analysisSchema.parse(
      (await bridge.app.inject({ method: "GET", url: `/api/analyses/${analysisId}` })).json(),
    );
    expect(detail.status).toBe("completed");
    expect(detail.mode).toBe("site");
    expect(detail.summary?.pagesAnalyzed).toBe(4);
    const viewports = new Set(findings.map((finding) => finding.viewport));
    expect(viewports).toEqual(new Set(["desktop", "tablet", "mobile"]));
    for (const finding of findings) {
      findingSchema.parse(finding);
    }
  }, 600_000);

  it("detecta el enlace roto desde la portada con su código HTTP", () => {
    const broken = findings.find((finding) => finding.ruleId === "qa-broken-link");
    expect(broken).toBeDefined();
    expect(broken?.description).toContain("404");
    expect(broken?.description).toContain("/no-existe.html");
    expect(broken?.viewport).toBe("desktop");
  });

  it("detecta el formulario que acepta un envío vacío sin feedback (revisión manual)", () => {
    const form = findings.find((finding) => finding.ruleId === "qa-form-no-feedback");
    expect(form?.kind).toBe("needs_review");
    expect(form?.pageUrl).toContain("contacto.html");
  });

  it("detecta el error de consola de la portada como revisión manual", () => {
    const consoleError = findings.find((finding) => finding.ruleId === "qa-console-error");
    expect(consoleError?.kind).toBe("needs_review");
    expect(consoleError?.pageUrl).toMatch(/demo\.pinkbridge\.test\/$/);
  });

  it("mantiene las incidencias de axe por página y viewport", () => {
    const alt = findings.filter((finding) => finding.ruleId === "image-alt");
    expect(alt.some((finding) => finding.pageUrl?.includes("servicios.html"))).toBe(true);
    expect(new Set(alt.map((finding) => finding.viewport)).size).toBe(3);
  });
});

describe("prompts para agentes", () => {
  it("exporta un Markdown con las incidencias pendientes y el delimitador de datos", async () => {
    const response = await bridge.app.inject({
      method: "GET",
      url: `/api/analyses/${analysisId}/agent-prompts`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/markdown");
    expect(response.body).toContain("qa-broken-link");
    expect(response.body).toMatch(/<dato-no-confiable-[0-9a-f]{16}>/);
  });
});
