import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createApiError } from "@pink-bridge/shared";
import type { AnalysisService } from "../analysis/service.js";
import { ServiceError } from "../analysis/service.js";
import { buildAgentPrompts } from "../reports/agentPrompts.js";
import { buildReport, renderReportHtml, renderReportJson } from "../reports/report.js";

const paramsSchema = z.object({ id: z.uuid() }).strict();
const querySchema = z.object({ format: z.enum(["json", "html"]).default("json") }).strict();

const HTML_CSP = "default-src 'none'; style-src 'unsafe-inline'";

const REPORT_CACHE_SIZE = 50;

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/** Caché acotada: descarta la entrada más antigua al superar el tamaño. */
function rememberReport(cache: Map<string, string>, key: string, body: string): void {
  cache.set(key, body);
  if (cache.size > REPORT_CACHE_SIZE) {
    const oldest = cache.keys().next();
    if (oldest.value !== undefined) {
      cache.delete(oldest.value);
    }
  }
}

export function registerReportRoutes(app: FastifyInstance, service: AnalysisService): void {
  const reportCache = new Map<string, string>();
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
      const filename = `pink-bridge-${params.data.id}.${query.data.format}`;
      // Un análisis completado no cambia; solo cambian sus revisiones. La clave lo refleja.
      const key = `${params.data.id}|${query.data.format}|${digest(data.reviews)}`;
      let body = reportCache.get(key);
      if (body === undefined) {
        const model = buildReport(
          data.analysis,
          data.findings,
          data.reviews,
          new Date().toISOString(),
        );
        body = query.data.format === "html" ? renderReportHtml(model) : renderReportJson(model);
        rememberReport(reportCache, key, body);
      }

      if (query.data.format === "html") {
        return await reply
          .header("content-type", "text/html; charset=utf-8")
          .header("content-security-policy", HTML_CSP)
          .header("content-disposition", `attachment; filename="${filename}"`)
          .send(body);
      }
      return await reply
        .header("content-type", "application/json; charset=utf-8")
        .header("content-disposition", `attachment; filename="${filename}"`)
        .send(body);
    } catch (error) {
      if (error instanceof ServiceError) {
        return reply.code(error.status).send(createApiError(error.code, error.message));
      }
      throw error;
    }
  });

  app.get("/api/analyses/:id/agent-prompts", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(404).send(createApiError("not_found", "Análisis no encontrado."));
    }
    try {
      const data = await service.reportData(params.data.id);
      if (!data) {
        return await reply.code(404).send(createApiError("not_found", "Análisis no encontrado."));
      }
      const markdown = buildAgentPrompts(data.analysis, data.findings, data.reviews);
      return await reply
        .header("content-type", "text/markdown; charset=utf-8")
        .header(
          "content-disposition",
          `attachment; filename="pink-bridge-${params.data.id}-agente.md"`,
        )
        .send(markdown);
    } catch (error) {
      if (error instanceof ServiceError) {
        return reply.code(error.status).send(createApiError(error.code, error.message));
      }
      throw error;
    }
  });
}
