import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App.js";
import { localUrlError } from "./HomeView.js";
import { ANALYSIS_ID, makeAnalysis, makeFinding, stubFetch } from "../test/fixtures.js";

function requestBody(call: unknown[] | undefined): string {
  const init = call?.[1] as { body?: unknown } | undefined;
  return typeof init?.body === "string" ? init.body : "{}";
}

const SUMMARY = {
  automaticRules: 1,
  automaticFindings: 1,
  affectedNodes: 1,
  needsReview: 1,
  passedRules: 12,
  byImpact: { critical: 1, serious: 0, moderate: 0, minor: 0, unknown: 0 },
};

beforeEach(() => {
  window.location.hash = "#/";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("localUrlError", () => {
  it("acepta http y https y rechaza lo demás antes de llamar a la API", () => {
    expect(localUrlError("https://ejemplo.com")).toBeNull();
    expect(localUrlError("http://ejemplo.com/ruta")).toBeNull();
    expect(localUrlError("   ")).toBe("Introduce una dirección web.");
    expect(localUrlError("ejemplo")).toBe("La dirección no tiene un formato válido.");
    expect(localUrlError("ftp://ejemplo.com")).toBe("Solo se admiten direcciones http o https.");
  });
});

describe("Inicio", () => {
  it("muestra el título, el formulario y el histórico", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Analiza la accesibilidad de una página" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Dirección web")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver el histórico de análisis" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Saltar al contenido" })).toBeTruthy();
  });

  it("marca el campo y no llama a la API si la dirección no es válida", () => {
    const mock = stubFetch(() => ({ status: 500, body: {} }));
    render(<App />);

    fireEvent.change(screen.getByLabelText("Dirección web"), { target: { value: "no-valida" } });
    fireEvent.click(screen.getByRole("button", { name: "Analizar" }));

    const input = screen.getByLabelText("Dirección web");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("La dirección no tiene un formato válido.")).toBeTruthy();
    expect(mock).not.toHaveBeenCalled();
  });

  it("envía la URL con un token de envío y navega al análisis creado", async () => {
    const mock = stubFetch((url, init) => {
      if (url === "/api/analyses" && init?.method === "POST") {
        return { status: 202, body: makeAnalysis({ id: ANALYSIS_ID }) };
      }
      return { status: 404, body: { error: { code: "not_found", message: "x" } } };
    });
    render(<App />);

    fireEvent.change(screen.getByLabelText("Dirección web"), {
      target: { value: "https://ejemplo.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Analizar" }));

    await waitFor(() => {
      expect(window.location.hash).toBe(`#/analisis/${ANALYSIS_ID}`);
    });
    const body = JSON.parse(requestBody(mock.mock.calls[0])) as {
      url: string;
      submissionToken: string;
    };
    expect(body.url).toBe("https://ejemplo.com");
    expect(body.submissionToken).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("muestra el error de la API en una alerta accesible", async () => {
    stubFetch(() => ({
      status: 400,
      body: { error: { code: "blocked_destination", message: "El destino no está permitido." } },
    }));
    render(<App />);

    fireEvent.change(screen.getByLabelText("Dirección web"), {
      target: { value: "https://ejemplo.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Analizar" }));

    expect((await screen.findByRole("alert")).textContent).toBe("El destino no está permitido.");
  });

  it("lanza la demostración con target demo", async () => {
    const mock = stubFetch(() => ({ status: 202, body: makeAnalysis({ source: "demo" }) }));
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Probar con la página de demostración" }));

    await waitFor(() => {
      expect(mock).toHaveBeenCalledTimes(1);
    });
    const body = JSON.parse(requestBody(mock.mock.calls[0])) as { target: string };
    expect(body.target).toBe("demo");
  });
});

describe("Análisis", () => {
  it("muestra el progreso con la etapa actual y hace sondeo hasta completar", async () => {
    let calls = 0;
    stubFetch(() => {
      calls += 1;
      if (calls === 1) {
        return { status: 200, body: makeAnalysis({ status: "running", stage: "navigating" }) };
      }
      return {
        status: 200,
        body: makeAnalysis({
          status: "completed",
          stage: "completed",
          finishedAt: "2026-11-12T10:00:05.000Z",
          durationMs: 4000,
          axeVersion: "4.14.0",
          summary: SUMMARY,
        }),
      };
    });

    window.location.hash = `#/analisis/${ANALYSIS_ID}`;
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("Cargando la página");
    });
    expect(screen.getByRole("heading", { level: 1, name: "Analizando la página" })).toBeTruthy();
    const currentStep = document.querySelector('li[aria-current="step"]');
    expect(currentStep?.textContent).toContain("Cargando la página");

    expect(
      await screen.findByRole(
        "heading",
        { level: 1, name: "Resultados del análisis" },
        { timeout: 4000 },
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("Comprobaciones superadas por axe").nextElementSibling?.textContent,
    ).toBe("12");
  }, 10000);

  it("muestra el fallo con su código y sin presentarlo como ausencia de incidencias", async () => {
    stubFetch(() => ({
      status: 200,
      body: makeAnalysis({
        status: "failed",
        errorCode: "navigation_timeout",
        errorMessage: "La página tardó demasiado en cargar.",
      }),
    }));

    window.location.hash = `#/analisis/${ANALYSIS_ID}`;
    render(<App />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "No se pudo completar el análisis" }),
    ).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("La página tardó demasiado en cargar.");
    expect(screen.getByText("navigation_timeout")).toBeTruthy();
    expect(screen.getByText(/no se ha comprobado/)).toBeTruthy();
  });

  it("informa de un identificador inexistente con un error legible", async () => {
    stubFetch(() => ({
      status: 404,
      body: { error: { code: "not_found", message: "Análisis no encontrado." } },
    }));

    window.location.hash = `#/analisis/${ANALYSIS_ID}`;
    render(<App />);

    expect((await screen.findByRole("alert")).textContent).toBe("Análisis no encontrado.");
  });

  it("muestra las incidencias, filtra por gravedad y abre el detalle", async () => {
    const reviewFinding = makeFinding({
      id: `${ANALYSIS_ID}:needs_review:focus-order-semantics`,
      kind: "needs_review",
      ruleId: "focus-order-semantics",
      impact: "minor",
      description: "Revisar el orden de foco.",
      wcagReferences: [],
      helpUrl: null,
      nodes: [],
      affectedNodeCount: 0,
    });
    stubFetch((url) => {
      if (url.endsWith("/findings")) {
        return { status: 200, body: { items: [makeFinding(), reviewFinding], total: 2 } };
      }
      return {
        status: 200,
        body: makeAnalysis({
          status: "completed",
          stage: "completed",
          summary: SUMMARY,
          durationMs: 3000,
          axeVersion: "4.14.0",
          finishedAt: "2026-11-12T10:00:05.000Z",
        }),
      };
    });

    window.location.hash = `#/analisis/${ANALYSIS_ID}`;
    render(<App />);

    expect(await screen.findByText("Mostrando 2 de 2 incidencias.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Gravedad"), { target: { value: "critical" } });
    expect(screen.getByText("Mostrando 1 de 2 incidencias.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Gravedad"), { target: { value: "serious" } });
    expect(screen.getByText("No hay incidencias que coincidan con los filtros.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Quitar filtros" }));

    fireEvent.click(screen.getByRole("button", { name: "Ver detalle de image-alt" }));
    const detail = screen.getByRole("region", { name: "Detalle: image-alt" });
    expect(within(detail).getByText("Una imagen no tiene texto alternativo.")).toBeTruthy();
    expect(within(detail).getByText("img.logo")).toBeTruthy();
    expect(within(detail).getByText("WCAG 1.1.1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Ver detalle de focus-order-semantics" }));
    const reviewDetail = screen.getByRole("region", { name: "Detalle: focus-order-semantics" });
    expect(within(reviewDetail).getByText(/requiere revisión manual/)).toBeTruthy();
    expect(within(reviewDetail).getByText(/buena práctica/)).toBeTruthy();
  });
});

describe("Histórico", () => {
  it("lista los análisis con su estado y permite repetir uno", async () => {
    const mock = stubFetch((url, init) => {
      if (url.startsWith("/api/analyses?") && (init?.method ?? "GET") === "GET") {
        return {
          status: 200,
          body: {
            items: [makeAnalysis({ status: "failed", errorCode: "dns_error" })],
            total: 1,
            limit: 20,
            offset: 0,
          },
        };
      }
      return { status: 202, body: makeAnalysis({ id: "11111111-1111-4111-8111-111111111111" }) };
    });

    window.location.hash = "#/historial";
    render(<App />);

    expect(await screen.findByRole("link", { name: "https://ejemplo.com/" })).toBeTruthy();
    expect(screen.getByText(/Fallido/)).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Repetir análisis de https://ejemplo.com/" }),
    );
    await waitFor(() => {
      expect(window.location.hash).toBe("#/analisis/11111111-1111-4111-8111-111111111111");
    });
    const posts = mock.mock.calls.filter((call) => call[1]?.method === "POST");
    expect(posts).toHaveLength(1);
  });

  it("muestra un estado vacío cuando no hay análisis", async () => {
    stubFetch(() => ({ status: 200, body: { items: [], total: 0, limit: 20, offset: 0 } }));
    window.location.hash = "#/historial";
    render(<App />);
    expect(await screen.findByText("Todavía no hay análisis.")).toBeTruthy();
  });
});

describe("Navegación", () => {
  it("muestra una página de no encontrada para rutas desconocidas", () => {
    window.location.hash = "#/no-existe";
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "Página no encontrada" })).toBeTruthy();
  });

  it("reacciona al cambio de hash sin recargar", async () => {
    stubFetch(() => ({ status: 200, body: { items: [], total: 0, limit: 20, offset: 0 } }));
    render(<App />);
    window.location.hash = "#/historial";
    expect(
      await screen.findByRole("heading", { level: 1, name: "Histórico de análisis" }),
    ).toBeTruthy();
  });
});
