import { vi } from "vitest";
import type { Analysis, Finding } from "@pink-bridge/shared";

export const ANALYSIS_ID = "0f8fad5b-d9cb-469f-a165-8c0a6a9b2d3e";

export interface MockResponse {
  readonly status: number;
  readonly body: unknown;
}

export type Responder = (url: string, init?: RequestInit) => MockResponse;

/** Sustituye fetch por un simulador que responde según la URL y el método. */
export function stubFetch(responder: Responder) {
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const { status, body } = responder(url, init);
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

export function makeAnalysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    id: ANALYSIS_ID,
    url: "https://ejemplo.com/",
    normalizedUrl: "https://ejemplo.com/",
    source: "url",
    createdAt: "2026-11-12T10:00:00.000Z",
    startedAt: "2026-11-12T10:00:01.000Z",
    finishedAt: null,
    durationMs: null,
    status: "queued",
    stage: null,
    axeVersion: null,
    summary: null,
    errorCode: null,
    errorMessage: null,
    ...overrides,
  };
}

export function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: `${ANALYSIS_ID}:automatic:image-alt`,
    analysisId: ANALYSIS_ID,
    kind: "automatic",
    ruleId: "image-alt",
    description: "Una imagen no tiene texto alternativo.",
    help: "Images must have alternative text",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.14/image-alt",
    impact: "critical",
    wcagReferences: ["1.1.1"],
    affectedNodeCount: 1,
    recommendation: "Añade un atributo alt descriptivo.",
    detectedAt: "2026-11-12T10:00:00.000Z",
    fingerprint: { strong: "a".repeat(64), loose: "b".repeat(64) },
    nodes: [
      {
        id: `${ANALYSIS_ID}:automatic:image-alt:0`,
        findingId: `${ANALYSIS_ID}:automatic:image-alt`,
        target: ["img.logo"],
        selector: "img.logo",
        evidence: [{ type: "html_snippet", content: '<img src="logo.png">', redacted: false }],
      },
    ],
    ...overrides,
  };
}
