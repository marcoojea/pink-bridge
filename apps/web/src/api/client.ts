import { apiHref, DEMO, demoRequest } from "../demo.js";
import { authorizationHeaders } from "./token.js";
import {
  analysisSchema,
  apiErrorSchema,
  comparisonResultSchema,
  findingsResponseSchema,
  listAnalysesResponseSchema,
  reviewStateSchema,
  reviewsResponseSchema,
  type Analysis,
  type ComparisonResult,
  type CreateAnalysisRequest,
  type Finding,
  type FindingsQuery,
  type ListAnalysesResponse,
  type ReviewState,
  type UpdateReviewRequest,
} from "@pink-bridge/shared";

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

interface RawResponse {
  readonly status: number;
  readonly body: unknown;
}

async function send(path: string, init?: RequestInit): Promise<RawResponse> {
  let target = path;
  if (DEMO) {
    // En la demostración solo se lee: cualquier escritura se rechaza antes de tocar la red.
    const mapped = demoRequest(path, init?.method ?? "GET");
    if (mapped === null) {
      throw new ApiRequestError(405, "read_only", "Esta demostración es de solo lectura.");
    }
    target = mapped;
  }
  let response: Response;
  try {
    const headers = new Headers(init?.headers);
    for (const [name, value] of Object.entries(authorizationHeaders())) {
      headers.set(name, value);
    }
    headers.set("accept", "application/json");
    response = await fetch(target, { ...init, headers });
  } catch {
    throw new ApiRequestError(0, "network_error", "No se pudo conectar con el servidor.");
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    if (parsed.success) {
      throw new ApiRequestError(response.status, parsed.data.error.code, parsed.data.error.message);
    }
    throw new ApiRequestError(
      response.status,
      "unexpected",
      "El servidor devolvió una respuesta inesperada.",
    );
  }
  return { status: response.status, body };
}

function invalidResponse(): ApiRequestError {
  return new ApiRequestError(
    200,
    "invalid_response",
    "La respuesta del servidor no tiene el formato esperado.",
  );
}

export interface CreateResult {
  readonly created: boolean;
  readonly analysis: Analysis;
}

export async function createAnalysis(request: CreateAnalysisRequest): Promise<CreateResult> {
  const response = await send("/api/analyses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const parsed = analysisSchema.safeParse(response.body);
  if (!parsed.success) {
    throw invalidResponse();
  }
  return { created: response.status === 202, analysis: parsed.data };
}

/** Texto Markdown del prompt para agentes. No es JSON, por eso no pasa por `send`. */
export async function getAgentPromptText(id: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(apiHref(`/api/analyses/${encodeURIComponent(id)}/agent-prompts`), {
      headers: { accept: "text/markdown", ...authorizationHeaders() },
    });
  } catch {
    throw new ApiRequestError(0, "network_error", "No se pudo conectar con el servidor.");
  }
  if (!response.ok) {
    throw new ApiRequestError(response.status, "unexpected", "No se pudo obtener el prompt.");
  }
  return response.text();
}

/** Cancela la petición cuando el componente que la pidió ya no existe. */
function withSignal(signal?: AbortSignal): RequestInit {
  return signal ? { signal } : {};
}

export async function getAnalysis(id: string, signal?: AbortSignal): Promise<Analysis> {
  const response = await send(`/api/analyses/${encodeURIComponent(id)}`, withSignal(signal));
  const parsed = analysisSchema.safeParse(response.body);
  if (!parsed.success) {
    throw invalidResponse();
  }
  return parsed.data;
}

export async function listAnalyses(
  limit = 20,
  offset = 0,
  signal?: AbortSignal,
): Promise<ListAnalysesResponse> {
  const response = await send(
    `/api/analyses?limit=${String(limit)}&offset=${String(offset)}`,
    withSignal(signal),
  );
  const parsed = listAnalysesResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw invalidResponse();
  }
  return parsed.data;
}

/** Tamaño de página al pedir incidencias: el servidor lo admite hasta su máximo. */
const FINDINGS_PAGE = 500;

/** Pide todas las incidencias del filtro, página a página. */
export async function getFindings(
  id: string,
  query: FindingsQuery = {},
  signal?: AbortSignal,
): Promise<Finding[]> {
  const items: Finding[] = [];
  let total = Number.POSITIVE_INFINITY;
  while (items.length < total) {
    const params = new URLSearchParams();
    if (query.kind) {
      params.set("kind", query.kind);
    }
    if (query.impact) {
      params.set("impact", query.impact);
    }
    if (query.ruleId) {
      params.set("ruleId", query.ruleId);
    }
    params.set("limit", String(FINDINGS_PAGE));
    params.set("offset", String(items.length));
    const response = await send(
      `/api/analyses/${encodeURIComponent(id)}/findings?${params.toString()}`,
      withSignal(signal),
    );
    const parsed = findingsResponseSchema.safeParse(response.body);
    if (!parsed.success) {
      throw invalidResponse();
    }
    total = parsed.data.total;
    if (parsed.data.items.length === 0) {
      break;
    }
    items.push(...parsed.data.items);
  }
  return items;
}

export async function getReviews(analysisId: string, signal?: AbortSignal): Promise<ReviewState[]> {
  const response = await send(
    `/api/analyses/${encodeURIComponent(analysisId)}/reviews`,
    withSignal(signal),
  );
  const parsed = reviewsResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw invalidResponse();
  }
  return parsed.data.items;
}

export async function saveReview(
  findingId: string,
  request: UpdateReviewRequest,
): Promise<ReviewState> {
  const response = await send(`/api/findings/${encodeURIComponent(findingId)}/review`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const parsed = reviewStateSchema.safeParse(response.body);
  if (!parsed.success) {
    throw invalidResponse();
  }
  return parsed.data;
}

export async function compareAnalyses(
  fromId: string,
  toId: string,
  signal?: AbortSignal,
): Promise<ComparisonResult> {
  const params = new URLSearchParams({ from: fromId, to: toId });
  const response = await send(`/api/analyses/compare?${params.toString()}`, withSignal(signal));
  const parsed = comparisonResultSchema.safeParse(response.body);
  if (!parsed.success) {
    throw invalidResponse();
  }
  return parsed.data;
}
