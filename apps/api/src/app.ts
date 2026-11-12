import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { API_VERSION, createApiError } from "@pink-bridge/shared";

export interface BuildAppOptions {
  logger?: boolean;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 16 * 1024,
  });

  app.addHook("onSend", (_request, reply, payload, done) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    done(null, payload);
  });

  app.get("/api/health", () => ({
    status: "ok" as const,
    service: "pink-bridge-api" as const,
    version: API_VERSION,
  }));

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

  return app;
}
