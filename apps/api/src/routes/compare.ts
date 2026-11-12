import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { comparisonResultSchema, createApiError } from "@pink-bridge/shared";
import type { AnalysisService } from "../analysis/service.js";
import { ServiceError } from "../analysis/service.js";

const querySchema = z.object({ from: z.uuid(), to: z.uuid() }).strict();

export function registerCompareRoutes(app: FastifyInstance, service: AnalysisService): void {
  app.get("/api/analyses/compare", async (request, reply) => {
    const query = querySchema.safeParse(request.query);
    if (!query.success) {
      return reply
        .code(400)
        .send(
          createApiError(
            "validation_error",
            "Indica dos identificadores de análisis en from y to.",
          ),
        );
    }

    try {
      const result = await service.compare(query.data.from, query.data.to);
      if (!result) {
        return await reply.code(404).send(createApiError("not_found", "Análisis no encontrado."));
      }
      return comparisonResultSchema.parse(result);
    } catch (error) {
      if (error instanceof ServiceError) {
        return reply.code(error.status).send(createApiError(error.code, error.message));
      }
      throw error;
    }
  });
}
