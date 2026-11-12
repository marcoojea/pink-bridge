import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, fetchApiStatus } from "./App.js";

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("muestra el título principal y el enlace de salto", () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => undefined));
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Pink Bridge" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Saltar al contenido" })).toBeTruthy();
  });

  it("muestra la API disponible cuando el contrato es válido", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ status: "ok", service: "pink-bridge-api", version: "0.1.0" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("API disponible (versión 0.1.0).");
    });
  });

  it("muestra error si la red falla", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("network down"));
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("No se pudo conectar con la API.");
    });
  });

  it("trata una respuesta con contrato inválido como error", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
    );
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("No se pudo conectar con la API.");
    });
  });
});

describe("fetchApiStatus", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("devuelve error con respuesta HTTP no válida", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 500 }));
    const result = await fetchApiStatus(new AbortController().signal);
    expect(result).toEqual({ kind: "error" });
  });
});
