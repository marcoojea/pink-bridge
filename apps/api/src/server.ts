import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "127.0.0.1";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT debe ser un entero entre 1 y 65535.");
}

const app = buildApp({ logger: true });

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, "Cerrando servidor");
  await app.close();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ port, host });
} catch (error: unknown) {
  app.log.error({ err: error }, "No se pudo iniciar el servidor");
  process.exit(1);
}
