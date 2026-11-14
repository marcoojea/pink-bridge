import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

// Configuración solo para generar capturas y el GIF de docs/img/.
// Usa el sitio de demostración del repositorio: nunca toca URLs externas.
export default defineConfig({
  testDir: "tests/docs",
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    locale: "es-ES",
  },
  webServer: [
    {
      command: "npm run dev -w @pink-bridge/api",
      env: {
        PINK_BRIDGE_ENABLE_DEMO: "1",
        PINK_BRIDGE_CREATE_PER_MINUTE: "1000",
        PINK_BRIDGE_DB: join(tmpdir(), `pink-bridge-docs-${String(Date.now())}.sqlite`),
      },
      url: "http://127.0.0.1:3001/api/health",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "npm run dev -w @pink-bridge/web",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
