import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const API_TARGET = "http://127.0.0.1:3001";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: false },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: false },
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/main.tsx"],
      reporter: ["text", "lcov"],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 80,
        statements: 90,
      },
    },
  },
});
