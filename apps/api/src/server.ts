import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPinkBridge } from "./app.js";
import { openDatabase, SqliteAnalysisStore } from "./persistence/sqlite.js";

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "127.0.0.1";
const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);
if (!LOOPBACK.has(host) && process.env.PINK_BRIDGE_ALLOW_REMOTE !== "1") {
  throw new Error(
    "HOST no es loopback. Para exponer la API define PINK_BRIDGE_ALLOW_REMOTE=1 y un control de acceso delante.",
  );
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT debe ser un entero entre 1 y 65535.");
}

// Base de datos local. Se puede cambiar con PINK_BRIDGE_DB; por defecto vive en ./data del repositorio.
const databasePath =
  process.env.PINK_BRIDGE_DB ??
  resolve(fileURLToPath(new URL("../../../data", import.meta.url)), "pink-bridge.sqlite");
mkdirSync(dirname(databasePath), { recursive: true });
const store = new SqliteAnalysisStore(openDatabase(databasePath));

// La demostración solo se habilita explícitamente en desarrollo o pruebas manuales.
const demoRequested = process.env.PINK_BRIDGE_ENABLE_DEMO === "1";
const demoFixturePath = fileURLToPath(
  new URL("../../../tests/fixtures/demo/index.html", import.meta.url),
);
const demoAvailable = demoRequested && existsSync(demoFixturePath);

const demoSiteRoot = fileURLToPath(new URL("../../../tests/fixtures/site", import.meta.url));

// Token opcional para toda la API (salvo /api/health). Si se define, debe tener al menos 16 caracteres.
const apiToken = process.env.PINK_BRIDGE_TOKEN;
if (apiToken !== undefined && apiToken.length > 0 && apiToken.length < 16) {
  throw new Error("PINK_BRIDGE_TOKEN debe tener al menos 16 caracteres.");
}
const createPerMinute = Number(process.env.PINK_BRIDGE_CREATE_PER_MINUTE ?? 10);
if (!Number.isInteger(createPerMinute) || createPerMinute < 1) {
  throw new Error("PINK_BRIDGE_CREATE_PER_MINUTE debe ser un entero positivo.");
}

const { app, service } = createPinkBridge({
  logger: true,
  store,
  service: demoAvailable ? { demoFixturePath, demoSiteRoot } : {},
  security: {
    createPerMinute,
    ...(apiToken ? { apiToken } : {}),
  },
});

const failedOnRestart = await service.recoverInterrupted();
if (failedOnRestart > 0) {
  app.log.warn({ failedOnRestart }, "Análisis interrumpidos marcados como fallidos");
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, "Cerrando servidor");
  await app.close();
  store.close();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ port, host });
} catch (error: unknown) {
  app.log.error({ err: error }, "No se pudo iniciar el servidor");
  store.close();
  process.exit(1);
}
