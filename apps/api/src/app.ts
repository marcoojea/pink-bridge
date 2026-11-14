import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { API_VERSION, createApiError } from "@pink-bridge/shared";
import { AnalysisService } from "./analysis/service.js";
import { InMemoryAnalysisStore, type AnalysisStore } from "./analysis/store.js";
import { registerAnalysisRoutes } from "./routes/analyses.js";
import { registerReviewRoutes } from "./routes/reviews.js";
import { registerReportRoutes } from "./routes/reports.js";
import { registerCompareRoutes } from "./routes/compare.js";
import { createFixedWindowLimiter, hasBearerToken } from "./http/guards.js";
import type { AnalysisServiceOptions } from "./analysis/service.js";

export interface SecurityOptions {
  /** Si se define, toda la API (salvo /api/health) exige `Authorization: Bearer <token>`. */
  apiToken?: string;
  /** Peticiones de creación de análisis por IP y minuto. Sin valor, no hay límite. */
  createPerMinute?: number;
}

export interface BuildAppOptions {
  logger?: boolean;
  security?: SecurityOptions;
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
      info: (context, message) => {
        app.log.info(context, message);
      },
    },
  });

  // El límite se activa solo si se configura; el servidor lo fija siempre (PINK_BRIDGE_CREATE_PER_MINUTE).
  const createPerMinute = options.security?.createPerMinute;
  const createLimiter =
    createPerMinute !== undefined ? createFixedWindowLimiter(createPerMinute, 60_000) : null;
  const apiToken = options.security?.apiToken;

  app.addHook("onRequest", async (request, reply) => {
    const path = request.url.split("?")[0] ?? "";
    if (apiToken !== undefined && path.startsWith("/api/") && path !== "/api/health") {
      if (!hasBearerToken(request.headers.authorization, apiToken)) {
        return reply
          .code(401)
          .header("WWW-Authenticate", 'Bearer realm="pink-bridge"')
          .send(createApiError("unauthorized", "Se requiere autorización para usar la API."));
      }
    }
    if (
      createLimiter !== null &&
      request.method === "POST" &&
      path === "/api/analyses" &&
      !createLimiter.take(request.ip)
    ) {
      return reply
        .code(429)
        .send(
          createApiError(
            "rate_limited",
            "Has pedido demasiadas revisiones seguidas. Espera un minuto y vuelve a intentarlo.",
          ),
        );
    }
    return undefined;
  });

  app.addHook("onSend", (_request, reply, payload, done) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    // Identificador de la petición: el mismo aparece en los logs para seguir una incidencia.
    reply.header("X-Request-Id", _request.id);
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
