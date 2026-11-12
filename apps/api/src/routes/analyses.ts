import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createAnalysisRequestSchema,
  createApiError,
  findingsQuerySchema,
  findingsResponseSchema,
  listAnalysesQuerySchema,
  listAnalysesResponseSchema,
  type FindingsResponse,
  type ListAnalysesResponse,
} from "@pink-bridge/shared";
import { AnalysisInputError } from "../analyzer/urlPolicy.js";
import { ServiceError, type AnalysisService } from "../analysis/service.js";

const idParamsSchema = z.object({ id: z.uuid() }).strict();

function firstMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "La solicitud no es válida.";
}

export function registerAnalysisRoutes(app: FastifyInstance, service: AnalysisService): void {
  app.post("/api/analyses", async (request, reply) => {
    const parsed = createAnalysisRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(createApiError("validation_error", firstMessage(parsed.error)));
    }

    let outcome: Awaited<ReturnType<AnalysisService["create"]>>;
    try {
      outcome = await service.create(parsed.data);
    } catch (error) {
      if (error instanceof AnalysisInputError) {
        return reply.code(400).send(createApiError(error.code, error.message));
      }
      if (error instanceof ServiceError) {
        return reply.code(error.status).send(createApiError(error.code, error.message));
      }
      throw error;
    }
    return reply.code(outcome.created ? 202 : 200).send(outcome.analysis);
  });

  app.get("/api/analyses", async (request, reply) => {
    const parsed = listAnalysesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send(createApiError("validation_error", firstMessage(parsed.error)));
    }
    const page = await service.list(parsed.data.limit, parsed.data.offset);
    const body: ListAnalysesResponse = {
      items: page.items,
      total: page.total,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    };
    return listAnalysesResponseSchema.parse(body);
  });

  app.get("/api/analyses/:id", async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(404).send(createApiError("not_found", "Análisis no encontrado."));
    }
    const analysis = await service.get(params.data.id);
    if (!analysis) {
      return reply.code(404).send(createApiError("not_found", "Análisis no encontrado."));
    }
    return analysis;
  });

  app.get("/api/analyses/:id/findings", async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    const query = findingsQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send(createApiError("validation_error", firstMessage(query.error)));
    }
    if (!params.success) {
      return reply.code(404).send(createApiError("not_found", "Análisis no encontrado."));
    }
    const findings = await service.findings(params.data.id, query.data);
    if (findings === undefined) {
      return reply.code(404).send(createApiError("not_found", "Análisis no encontrado."));
    }
    const body: FindingsResponse = { items: findings, total: findings.length };
    return findingsResponseSchema.parse(body);
  });
}
