import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: 0,
  ...(isCI ? { workers: 1 } : {}),
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "npm run dev -w @pink-bridge/api",
      env: {
        PINK_BRIDGE_ENABLE_DEMO: "1",
        // Base de datos aislada por ejecución: las pruebas no dependen de análisis anteriores.
        PINK_BRIDGE_DB: join(tmpdir(), `pink-bridge-e2e-${String(Date.now())}.sqlite`),
      },
      url: "http://127.0.0.1:3001/api/health",
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
    {
      command: "npm run dev -w @pink-bridge/web",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
  ],
});
