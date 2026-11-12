import {
  analysisSchema,
  apiErrorSchema,
  findingsResponseSchema,
  listAnalysesResponseSchema,
  type Analysis,
  type CreateAnalysisRequest,
  type Finding,
  type FindingsQuery,
  type ListAnalysesResponse,
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
  let response: Response;
  try {
    const headers = new Headers(init?.headers);
    headers.set("accept", "application/json");
    response = await fetch(path, { ...init, headers });
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

export async function getAnalysis(id: string): Promise<Analysis> {
  const response = await send(`/api/analyses/${encodeURIComponent(id)}`);
  const parsed = analysisSchema.safeParse(response.body);
  if (!parsed.success) {
    throw invalidResponse();
  }
  return parsed.data;
}

export async function listAnalyses(limit = 20, offset = 0): Promise<ListAnalysesResponse> {
  const response = await send(`/api/analyses?limit=${String(limit)}&offset=${String(offset)}`);
  const parsed = listAnalysesResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw invalidResponse();
  }
  return parsed.data;
}

export async function getFindings(id: string, query: FindingsQuery = {}): Promise<Finding[]> {
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
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const response = await send(`/api/analyses/${encodeURIComponent(id)}/findings${suffix}`);
  const parsed = findingsResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw invalidResponse();
  }
  return parsed.data.items;
}
