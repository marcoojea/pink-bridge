import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewState } from "@pink-bridge/shared";
import { ReviewEditor } from "./ReviewEditor.js";
import { ANALYSIS_ID, makeFinding, stubFetch } from "../test/fixtures.js";

function bodyOf(call: unknown[] | undefined): string {
  const init = call?.[1] as RequestInit | undefined;
  return typeof init?.body === "string" ? init.body : "{}";
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const finding = makeFinding();

describe("ReviewEditor", () => {
  it("guarda el estado y la nota en una petición PATCH y confirma el guardado", async () => {
    const saved: ReviewState = {
      findingId: finding.id,
      status: "reviewed",
      note: "Comprobado en la plantilla.",
      updatedAt: "2026-11-12T10:05:00.000Z",
    };
    const mock = stubFetch(() => ({ status: 200, body: saved }));
    const onSaved = vi.fn();
    render(<ReviewEditor finding={finding} review={undefined} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "reviewed" } });
    fireEvent.change(screen.getByLabelText("Nota (opcional)"), {
      target: { value: "  Comprobado en la plantilla.  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar revisión" }));

    expect(await screen.findByText("Revisión guardada.")).toBeTruthy();
    expect(onSaved).toHaveBeenCalledWith(saved);
    const call = mock.mock.calls[0];
    expect(call?.[0]).toBe(`/api/findings/${encodeURIComponent(finding.id)}/review`);
    expect(call?.[1]?.method).toBe("PATCH");
    expect(JSON.parse(bodyOf(call))).toEqual({
      status: "reviewed",
      note: "Comprobado en la plantilla.",
    });
  });

  it("no envía nota vacía y avisa de que 'corregida' no se verifica sola", async () => {
    const mock = stubFetch(() => ({
      status: 200,
      body: {
        findingId: finding.id,
        status: "fixed",
        note: null,
        updatedAt: "2026-11-12T10:05:00.000Z",
      },
    }));
    render(<ReviewEditor finding={finding} review={undefined} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "fixed" } });
    expect(screen.getByText(/No se verifica automáticamente/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Guardar revisión" }));

    await waitFor(() => {
      expect(mock).toHaveBeenCalledTimes(1);
    });
    expect(JSON.parse(bodyOf(mock.mock.calls[0]))).toEqual({ status: "fixed" });
  });

  it("muestra el error de la API sin perder el borrador", async () => {
    stubFetch(() => ({
      status: 404,
      body: { error: { code: "not_found", message: "Incidencia no encontrada." } },
    }));
    render(<ReviewEditor finding={finding} review={undefined} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Nota (opcional)"), { target: { value: "borrador" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar revisión" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Incidencia no encontrada.");
    expect(screen.getByLabelText<HTMLTextAreaElement>("Nota (opcional)").value).toBe("borrador");
  });

  it("muestra la última actualización cuando ya existe una revisión", () => {
    const existing: ReviewState = {
      findingId: finding.id,
      status: "accepted",
      note: null,
      updatedAt: "2026-11-12T10:05:00.000Z",
    };
    render(<ReviewEditor finding={finding} review={existing} onSaved={vi.fn()} />);
    expect(screen.getByText(/Última actualización/)).toBeTruthy();
    expect(screen.getByLabelText<HTMLSelectElement>("Estado").value).toBe("accepted");
    expect(ANALYSIS_ID).toHaveLength(36);
  });
});
