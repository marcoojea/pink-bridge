import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentPromptPanel } from "./AgentPromptPanel.js";
import { ANALYSIS_ID } from "../test/fixtures.js";

const MARKDOWN = "# Incidencias de accesibilidad y QA para corregir\n";

function stubPromptFetch(status = 200) {
  const mock = vi.fn<(input: string) => Promise<Response>>(() =>
    Promise.resolve(
      new Response(MARKDOWN, {
        status,
        headers: { "content-type": "text/markdown; charset=utf-8" },
      }),
    ),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

function stubClipboard(writeText: ((text: string) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, "clipboard", {
    value: writeText === undefined ? undefined : { writeText },
    configurable: true,
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("AgentPromptPanel", () => {
  it("copia el Markdown del prompt y lo confirma", async () => {
    const mock = stubPromptFetch();
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    stubClipboard(writeText);
    render(<AgentPromptPanel analysisId={ANALYSIS_ID} />);

    fireEvent.click(screen.getByRole("button", { name: "Copiar prompt para agentes" }));

    expect(await screen.findByText("Prompt copiado. Pégalo en Claude Code o Codex.")).toBeTruthy();
    expect(mock.mock.calls[0]?.[0]).toBe(`/api/analyses/${ANALYSIS_ID}/agent-prompts`);
    expect(writeText).toHaveBeenCalledWith(MARKDOWN);
  });

  it("explica qué hacer si el navegador no permite copiar", async () => {
    stubPromptFetch();
    stubClipboard(undefined);
    render(<AgentPromptPanel analysisId={ANALYSIS_ID} />);

    fireEvent.click(screen.getByRole("button", { name: "Copiar prompt para agentes" }));

    expect(
      await screen.findByText(
        "Este navegador no permite copiar al portapapeles. Descarga el archivo con el enlace de arriba.",
      ),
    ).toBeTruthy();
  });

  it("muestra el error si el prompt no se puede obtener", async () => {
    stubPromptFetch(404);
    stubClipboard(() => Promise.resolve());
    render(<AgentPromptPanel analysisId={ANALYSIS_ID} />);

    fireEvent.click(screen.getByRole("button", { name: "Copiar prompt para agentes" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText(/Prompt copiado/)).toBeNull();
  });

  it("ofrece los comandos de terminal con el nombre del archivo del análisis", () => {
    render(<AgentPromptPanel analysisId={ANALYSIS_ID} />);

    expect(screen.getByText(`claude "$(cat ARCHIVO)"`)).toBeTruthy();
    expect(screen.getByText(`codex "$(cat ARCHIVO)"`)).toBeTruthy();
    expect(screen.getByText(`pink-bridge-${ANALYSIS_ID}-agente.md`)).toBeTruthy();
  });
});
