import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComparisonView } from "./ComparisonView.js";
import { stubFetch } from "../test/fixtures.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FROM = "11111111-1111-4111-8111-111111111111";
const TO = "22222222-2222-4222-8222-222222222222";

const RESULT = {
  baselineAnalysisId: FROM,
  targetAnalysisId: TO,
  normalizedUrl: "https://ejemplo.com/",
  newFindings: [
    {
      ruleId: "link-name",
      impact: "serious",
      matchType: null,
      baselineFindingId: null,
      targetFindingId: "t1",
      affectedNodeCount: 2,
    },
  ],
  resolvedFindings: [
    {
      ruleId: "image-alt",
      impact: "critical",
      matchType: null,
      baselineFindingId: "b1",
      targetFindingId: null,
      affectedNodeCount: 1,
    },
  ],
  persistentFindings: [
    {
      ruleId: "button-name",
      impact: "critical",
      matchType: "approximate",
      baselineFindingId: "b2",
      targetFindingId: "t2",
      affectedNodeCount: 1,
    },
  ],
  summaryDelta: {
    automaticFindings: 0,
    affectedNodes: 1,
    byImpact: { critical: -1, serious: 1, moderate: 0, minor: 0, unknown: 0 },
  },
  limitations: ["Una incidencia 'resuelta' no equivale a una corrección verificada."],
};

describe("ComparisonView", () => {
  it("muestra el resumen, las tres listas y las limitaciones", async () => {
    stubFetch(() => ({ status: 200, body: RESULT }));
    render(<ComparisonView from={FROM} to={TO} />);

    expect(await screen.findByRole("heading", { level: 1, name: "Qué ha cambiado" })).toBeTruthy();
    expect(screen.getByText("Enlace sin texto")).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: "Resueltos (sin comprobar)" }),
    ).toBeTruthy();
    expect(screen.getByText("Imagen sin descripción")).toBeTruthy();
    expect(screen.getByText("Parece el mismo problema, pero en otra posición")).toBeTruthy();
    expect(screen.getByText("+1", { selector: "dd" })).toBeTruthy();
    expect(screen.getByText(/No significa que esté comprobado como corregido/)).toBeTruthy();
  });

  it("muestra los estados vacíos de cada lista", async () => {
    stubFetch(() => ({
      status: 200,
      body: {
        ...RESULT,
        newFindings: [],
        resolvedFindings: [],
        persistentFindings: [],
        summaryDelta: {
          automaticFindings: 0,
          affectedNodes: 0,
          byImpact: RESULT.summaryDelta.byImpact,
        },
      },
    }));
    render(<ComparisonView from={FROM} to={TO} />);

    expect(await screen.findByText("No hay problemas nuevos.")).toBeTruthy();
    expect(screen.getByText("No hay problemas que hayan dejado de aparecer.")).toBeTruthy();
    expect(screen.getByText("Ningún problema sigue igual.")).toBeTruthy();
  });

  it("explica el error cuando la API rechaza la comparación", async () => {
    stubFetch(() => ({
      status: 409,
      body: {
        error: {
          code: "incompatible_analyses",
          message: "Solo se pueden comparar análisis de la misma URL.",
        },
      },
    }));
    render(<ComparisonView from={FROM} to={TO} />);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "Solo se pueden comparar análisis de la misma URL.",
      );
    });
    expect(screen.getByRole("heading", { level: 1, name: "No se pudo comparar" })).toBeTruthy();
  });

  it("muestra el estado de carga mientras se calcula", () => {
    stubFetch(() => ({ status: 200, body: RESULT }));
    render(<ComparisonView from={FROM} to={TO} />);
    expect(screen.getByRole("status").textContent).toBe("Calculando las diferencias…");
  });
});
