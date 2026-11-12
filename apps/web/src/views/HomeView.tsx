import { useRef, useState, type SyntheticEvent } from "react";
import type { CreateAnalysisRequest } from "@pink-bridge/shared";
import { ApiRequestError, createAnalysis } from "../api/client.js";
import { analysisHref, navigateTo, routeHref } from "../router.js";

export function localUrlError(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return "Introduce una dirección web.";
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return "La dirección no tiene un formato válido.";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "Solo se admiten direcciones http o https.";
  }
  return null;
}

export function messageOf(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.message;
  }
  return "Ha ocurrido un error inesperado. Inténtalo de nuevo.";
}

export function HomeView() {
  const [url, setUrl] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const tokenRef = useRef<string>(crypto.randomUUID());
  const inputRef = useRef<HTMLInputElement>(null);

  async function launch(request: CreateAnalysisRequest): Promise<void> {
    setSubmitting(true);
    setServerError(null);
    try {
      const result = await createAnalysis(request);
      tokenRef.current = crypto.randomUUID();
      navigateTo(analysisHref(result.analysis.id));
    } catch (error) {
      setServerError(messageOf(error));
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (submitting) {
      return;
    }
    const problem = localUrlError(url);
    setFieldError(problem);
    if (problem !== null) {
      inputRef.current?.focus();
      return;
    }
    void launch({ url: url.trim(), submissionToken: tokenRef.current });
  }

  function onDemo(): void {
    if (submitting) {
      return;
    }
    void launch({ target: "demo", submissionToken: tokenRef.current });
  }

  return (
    <section aria-labelledby="titulo-inicio" className="card">
      <h1 id="titulo-inicio" tabIndex={-1}>
        Analiza la accesibilidad de una página
      </h1>
      <p>
        Pink Bridge carga la página en un navegador aislado y ejecuta comprobaciones automáticas con
        axe-core. Los resultados automáticos no sustituyen la revisión manual.
      </p>

      <form onSubmit={onSubmit} noValidate className="stack">
        <div className="field">
          <label htmlFor="url-input">Dirección web</label>
          <p id="url-hint" className="hint">
            Introduce una dirección completa, por ejemplo https://ejemplo.com
          </p>
          <input
            id="url-input"
            ref={inputRef}
            type="url"
            inputMode="url"
            autoComplete="url"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
            }}
            aria-invalid={fieldError !== null}
            aria-describedby={fieldError !== null ? "url-error url-hint" : "url-hint"}
            disabled={submitting}
          />
          {fieldError !== null && (
            <p id="url-error" className="field-error">
              {fieldError}
            </p>
          )}
        </div>
        <div className="actions">
          <button type="submit" disabled={submitting}>
            {submitting ? "Enviando…" : "Analizar"}
          </button>
        </div>
      </form>

      {serverError !== null && (
        <p role="alert" className="notice notice-error">
          {serverError}
        </p>
      )}

      <div className="secondary-actions">
        <button type="button" className="secondary" onClick={onDemo} disabled={submitting}>
          Probar con la página de demostración
        </button>
        <a href={routeHref("history")}>Ver el histórico de análisis</a>
      </div>
    </section>
  );
}
