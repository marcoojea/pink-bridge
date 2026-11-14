import { useState } from "react";
import { getAgentPromptText } from "../api/client.js";
import { messageOf } from "../views/HomeView.js";

type CopyState =
  | { readonly kind: "idle" }
  | { readonly kind: "busy" }
  | { readonly kind: "done" }
  | { readonly kind: "error"; readonly message: string };

const NO_CLIPBOARD = "Este navegador no permite copiar al portapapeles.";
const DOWNLOAD_HINT = "Descarga el archivo con el enlace de arriba.";

/** Copia el prompt para agentes y muestra los comandos para ejecutarlo en la terminal. */
export function AgentPromptPanel({ analysisId }: { readonly analysisId: string }) {
  const [copy, setCopy] = useState<CopyState>({ kind: "idle" });
  const fileName = `pink-bridge-${analysisId}-agente.md`;

  async function copyPrompt(): Promise<void> {
    setCopy({ kind: "busy" });
    let text: string;
    try {
      text = await getAgentPromptText(analysisId);
    } catch (caught) {
      setCopy({ kind: "error", message: `${messageOf(caught)} ${DOWNLOAD_HINT}` });
      return;
    }
    const clipboard = navigator.clipboard as Clipboard | undefined;
    if (clipboard === undefined) {
      setCopy({ kind: "error", message: `${NO_CLIPBOARD} ${DOWNLOAD_HINT}` });
      return;
    }
    try {
      await clipboard.writeText(text);
      setCopy({ kind: "done" });
    } catch {
      setCopy({ kind: "error", message: `No se pudo copiar. ${DOWNLOAD_HINT}` });
    }
  }

  return (
    <div className="agent-panel">
      <div className="secondary-actions">
        <button
          type="button"
          className="secondary"
          disabled={copy.kind === "busy"}
          onClick={() => {
            void copyPrompt();
          }}
        >
          Copiar instrucciones para el asistente
        </button>
      </div>
      {copy.kind === "done" && (
        <p role="status" className="notice">
          Instrucciones copiadas. Pégalas en Claude Code o Codex.
        </p>
      )}
      {copy.kind === "error" && (
        <p role="alert" className="notice notice-error">
          {copy.message}
        </p>
      )}
      <details>
        <summary>Cómo usarlas desde la terminal</summary>
        <p className="hint">
          Primero descarga el archivo <code>{fileName}</code>. Después, en la terminal y dentro de
          la carpeta del proyecto que quieres corregir, cambia <code>ARCHIVO</code> por la ruta de
          ese archivo y ejecuta uno de estos comandos.
        </p>
        <pre>
          <code>{`claude "$(cat ARCHIVO)"`}</code>
        </pre>
        <pre>
          <code>{`codex "$(cat ARCHIVO)"`}</code>
        </pre>
        <p className="hint">
          Las instrucciones incluyen texto de la web revisada. Revisa cada cambio que proponga el
          asistente antes de aceptarlo.
        </p>
      </details>
    </div>
  );
}
