import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompareForm } from "./CompareForm.js";
import { makeAnalysis } from "../test/fixtures.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

describe("CompareForm", () => {
  it("no aparece si hay menos de dos análisis completados", () => {
    const { container } = render(
      <CompareForm items={[makeAnalysis({ id: A, status: "completed" })]} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("solo ofrece como destino análisis completados de la misma URL normalizada", () => {
    const items = [
      makeAnalysis({ id: A, status: "completed", normalizedUrl: "https://ejemplo.com/" }),
      makeAnalysis({ id: B, status: "completed", normalizedUrl: "https://ejemplo.com/" }),
      makeAnalysis({ id: C, status: "completed", normalizedUrl: "https://otra.com/" }),
      makeAnalysis({
        id: "44444444-4444-4444-8444-444444444444",
        status: "failed",
        normalizedUrl: "https://ejemplo.com/",
      }),
    ];
    render(<CompareForm items={items} />);

    const target = screen.getByLabelText<HTMLSelectElement>("Segunda revisión (la más reciente)");
    expect(target.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Primera revisión (la más antigua)"), {
      target: { value: A },
    });
    const options = within(target)
      .getAllByRole("option")
      .map((option) => (option as HTMLOptionElement).value);
    expect(options).toEqual(["", A, B]);
    expect(target.disabled).toBe(false);
  });

  it("navega a la comparación cuando las dos selecciones son distintas", () => {
    const items = [
      makeAnalysis({ id: A, status: "completed" }),
      makeAnalysis({ id: B, status: "completed" }),
    ];
    render(<CompareForm items={items} />);

    const button = screen.getByRole<HTMLButtonElement>("button", { name: "Comparar" });
    expect(button.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Primera revisión (la más antigua)"), {
      target: { value: A },
    });
    fireEvent.change(screen.getByLabelText("Segunda revisión (la más reciente)"), {
      target: { value: B },
    });
    expect(button.disabled).toBe(false);

    fireEvent.click(button);
    expect(window.location.hash).toBe(`#/comparar/${A}/${B}`);
  });
});
