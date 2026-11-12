import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createApiError } from "@pink-bridge/shared";
import type { AnalysisService } from "../analysis/service.js";
import { ServiceError } from "../analysis/service.js";
import { buildReport, renderReportHtml, renderReportJson } from "../reports/report.js";

const paramsSchema = z.object({ id: z.uuid() }).strict();
const querySchema = z.object({ format: z.enum(["json", "html"]).default("json") }).strict();

const HTML_CSP = "default-src 'none'; style-src 'unsafe-inline'";

export function registerReportRoutes(app: FastifyInstance, service: AnalysisService): void {
  app.get("/api/analyses/:id/report", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const query = querySchema.safeParse(request.query);
    if (!query.success) {
      return reply
        .code(400)
        .send(createApiError("validation_error", "El formato debe ser json o html."));
    }
    if (!params.success) {
      return reply.code(404).send(createApiError("not_found", "Análisis no encontrado."));
    }

    try {
      const data = await service.reportData(params.data.id);
      if (!data) {
        return await reply.code(404).send(createApiError("not_found", "Análisis no encontrado."));
      }
      const model = buildReport(
        data.analysis,
        data.findings,
        data.reviews,
        new Date().toISOString(),
      );
      const filename = `pink-bridge-${params.data.id}.${query.data.format}`;

      if (query.data.format === "html") {
        return await reply
          .header("content-type", "text/html; charset=utf-8")
          .header("content-security-policy", HTML_CSP)
          .header("content-disposition", `attachment; filename="${filename}"`)
          .send(renderReportHtml(model));
      }
      return await reply
        .header("content-type", "application/json; charset=utf-8")
        .header("content-disposition", `attachment; filename="${filename}"`)
        .send(renderReportJson(model));
    } catch (error) {
      if (error instanceof ServiceError) {
        return reply.code(error.status).send(createApiError(error.code, error.message));
      }
      throw error;
    }
  });
}
