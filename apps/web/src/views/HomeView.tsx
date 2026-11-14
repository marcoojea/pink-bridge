import { useRef, useState, type SyntheticEvent } from "react";
import type { CreateAnalysisRequest } from "@pink-bridge/shared";
import { ApiRequestError, createAnalysis } from "../api/client.js";
import { Glossary } from "../components/Glossary.js";
import { analysisHref, navigateTo, routeHref } from "../router.js";

export function localUrlError(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return "Escribe la dirección de la página que quieres revisar.";
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return "Esto no parece una dirección web. Empieza por https:// y escribe el resto, por ejemplo https://ejemplo.com";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "Solo se pueden revisar páginas web. La dirección debe empezar por https:// o http://";
  }
  return null;
}

export function messageOf(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.message;
  }
  return "Algo ha salido mal. Vuelve a intentarlo en un momento.";
}

export function HomeView() {
  const [url, setUrl] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [site, setSite] = useState(false);
  const [maxPages, setMaxPages] = useState(5);
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
    void launch({
      url: url.trim(),
      submissionToken: tokenRef.current,
      ...(site ? { maxPages } : {}),
    });
  }

  function onDemo(): void {
    if (submitting) {
      return;
    }
    void launch({ target: "demo", submissionToken: tokenRef.current });
  }

  function onDemoSite(): void {
    if (submitting) {
      return;
    }
    void launch({ target: "demo-site", maxPages, submissionToken: tokenRef.current });
  }

  return (
    <section aria-labelledby="titulo-inicio" className="card">
      <h1 id="titulo-inicio" tabIndex={-1}>
        Revisa si tu página web es accesible
      </h1>
      <p className="lead">
        Pink Bridge busca problemas que pueden impedir usar una web a personas con discapacidad,
        como quien usa un lector de pantalla o solo el teclado. Te dice dónde está cada problema y
        cómo arreglarlo.
      </p>

      <ol className="steps">
        <li>Pega la dirección de la página.</li>
        <li>Elige si revisas solo esa página o varias del mismo sitio.</li>
        <li>Pulsa el botón y espera unos segundos.</li>
      </ol>

      <form onSubmit={onSubmit} noValidate className="stack">
        <div className="field">
          <label htmlFor="url-input">Dirección de la página</label>
          <p id="url-hint" className="hint">
            Empieza por https://. Por ejemplo: https://ejemplo.com
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

        <fieldset className="scope">
          <legend>¿Qué quieres revisar?</legend>
          <div className="option">
            <input
              id="alcance-pagina"
              type="radio"
              name="alcance"
              checked={!site}
              onChange={() => {
                setSite(false);
              }}
              disabled={submitting}
            />
            <label htmlFor="alcance-pagina">
              <strong>Solo esta página</strong>
              <span className="hint">La más rápida. Recomendada si es tu primera vez.</span>
            </label>
          </div>
          <div className="option">
            <input
              id="alcance-sitio"
              type="radio"
              name="alcance"
              checked={site}
              onChange={() => {
                setSite(true);
              }}
              disabled={submitting}
            />
            <label htmlFor="alcance-sitio">
              <strong>Varias páginas del mismo sitio</strong>
              <span className="hint">
                Sigue los enlaces internos y revisa cada página en móvil, tablet y escritorio. Tarda
                más.
              </span>
            </label>
          </div>
          {site && (
            <label className="check">
              Número máximo de páginas (de 1 a 10)
              <input
                type="number"
                min={1}
                max={10}
                value={maxPages}
                onChange={(event) => {
                  setMaxPages(Math.min(10, Math.max(1, Number(event.target.value) || 1)));
                }}
                disabled={submitting}
              />
            </label>
          )}
          <p className="hint">
            Pink Bridge nunca envía formularios de la web: los bloquea para no cambiar nada.
          </p>
        </fieldset>

        <div className="actions">
          <button type="submit" disabled={submitting}>
            {submitting ? "Revisando…" : site ? "Revisar el sitio" : "Revisar la página"}
          </button>
        </div>
      </form>

      {serverError !== null && (
        <p role="alert" className="notice notice-error">
          {serverError}
        </p>
      )}

      <section aria-labelledby="titulo-ejemplo" className="example">
        <h2 id="titulo-ejemplo">¿Primera vez? Prueba con un ejemplo</h2>
        <p className="hint">
          Son páginas de prueba con problemas conocidos. No necesitas escribir ninguna dirección.
        </p>
        <div className="secondary-actions">
          <button type="button" className="secondary" onClick={onDemo} disabled={submitting}>
            Ver un ejemplo de página
          </button>
          <button type="button" className="secondary" onClick={onDemoSite} disabled={submitting}>
            Ver un ejemplo de sitio
          </button>
        </div>
      </section>

      <p>
        <a href={routeHref("history")}>Ver mis revisiones anteriores</a>
      </p>

      <Glossary />
    </section>
  );
}
