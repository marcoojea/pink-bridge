import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createApiError,
  reviewStateSchema,
  reviewsResponseSchema,
  updateReviewRequestSchema,
  type ReviewsResponse,
} from "@pink-bridge/shared";
import type { AnalysisService } from "../analysis/service.js";

const findingParamsSchema = z.object({ id: z.string().min(1).max(200) }).strict();
const analysisParamsSchema = z.object({ id: z.uuid() }).strict();

export function registerReviewRoutes(app: FastifyInstance, service: AnalysisService): void {
  app.patch("/api/findings/:id/review", async (request, reply) => {
    const body = updateReviewRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply
        .code(400)
        .send(
          createApiError(
            "validation_error",
            body.error.issues[0]?.message ?? "La revisión no es válida.",
          ),
        );
    }
    const params = findingParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(404).send(createApiError("not_found", "Incidencia no encontrada."));
    }
    const review = await service.setReview(params.data.id, body.data);
    if (!review) {
      return reply.code(404).send(createApiError("not_found", "Incidencia no encontrada."));
    }
    return reviewStateSchema.parse(review);
  });

  app.get("/api/analyses/:id/reviews", async (request, reply) => {
    const params = analysisParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(404).send(createApiError("not_found", "Análisis no encontrado."));
    }
    const reviews = await service.reviews(params.data.id);
    if (reviews === undefined) {
      return reply.code(404).send(createApiError("not_found", "Análisis no encontrado."));
    }
    const body: ReviewsResponse = { items: reviews };
    return reviewsResponseSchema.parse(body);
  });
}
