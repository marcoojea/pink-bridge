import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getToken } from "../api/token.js";
import { AccessForm } from "./AccessForm.js";

const KEY = "pink-bridge:token";

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe("AccessForm", () => {
  it("guarda el token escrito, vacía el campo y cambia el resumen", () => {
    render(<AccessForm />);
    expect(screen.getByText("Token de acceso")).toBeTruthy();

    const input = screen.getByLabelText<HTMLInputElement>("Solo si la API lo exige");
    fireEvent.change(input, { target: { value: "secreto-de-prueba-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar en esta pestaña" }));

    expect(getToken()).toBe("secreto-de-prueba-123");
    expect(input.value).toBe("");
    expect(screen.getByText("Token de acceso guardado")).toBeTruthy();
  });

  it("muestra como guardado un token que ya estaba en la sesión", () => {
    window.sessionStorage.setItem(KEY, "secreto-de-prueba-123");
    render(<AccessForm />);
    expect(screen.getByText("Token de acceso guardado")).toBeTruthy();
  });
});
