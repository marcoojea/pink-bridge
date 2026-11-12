import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { API_VERSION, createApiError } from "@pink-bridge/shared";
import { AnalysisService } from "./analysis/service.js";
import { InMemoryAnalysisStore, type AnalysisStore } from "./analysis/store.js";
import { registerAnalysisRoutes } from "./routes/analyses.js";
import { registerReviewRoutes } from "./routes/reviews.js";
import { registerReportRoutes } from "./routes/reports.js";
import { registerCompareRoutes } from "./routes/compare.js";
import type { AnalysisServiceOptions } from "./analysis/service.js";

export interface BuildAppOptions {
  logger?: boolean;
  /** Almacén del análisis. Por defecto, memoria (Fase 4). */
  store?: AnalysisStore;
  /** Opciones del servicio (fixture de demo, límites, puertos, runner de pruebas…). */
  service?: Omit<AnalysisServiceOptions, "store" | "logger">;
}

export interface PinkBridgeApp {
  readonly app: FastifyInstance;
  readonly service: AnalysisService;
}

export function createPinkBridge(options: BuildAppOptions = {}): PinkBridgeApp {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 16 * 1024,
  });

  const store = options.store ?? new InMemoryAnalysisStore();
  const service = new AnalysisService({
    ...options.service,
    store,
    logger: {
      error: (context, message) => {
        app.log.error(context, message);
      },
    },
  });

  app.addHook("onSend", (_request, reply, payload, done) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    done(null, payload);
  });

  app.addHook("onClose", async () => {
    await service.stop();
  });

  app.get("/api/health", () => ({
    status: "ok" as const,
    service: "pink-bridge-api" as const,
    version: API_VERSION,
  }));

  registerAnalysisRoutes(app, service);
  registerReviewRoutes(app, service);
  registerReportRoutes(app, service);
  registerCompareRoutes(app, service);

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send(createApiError("not_found", "Recurso no encontrado."));
  });

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 400 && statusCode < 500) {
      reply.code(statusCode).send(createApiError("bad_request", error.message));
      return;
    }
    app.log.error({ err: error }, "Error interno no controlado");
    reply.code(500).send(createApiError("internal_error", "Error interno del servidor."));
  });

  return { app, service };
}

/** Compatibilidad con las pruebas de Fase 1: devuelve solo la instancia de Fastify. */
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  return createPinkBridge(options).app;
}
