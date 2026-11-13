import { useEffect, useRef, useState } from "react";
import type { Analysis } from "@pink-bridge/shared";
import { getAnalysis } from "../api/client.js";
import { FindingsPanel } from "../components/FindingsPanel.js";
import { SummaryCards } from "../components/SummaryCards.js";
import { formatDate, formatDuration, STAGE_LABELS, STAGE_ORDER, STATUS_LABELS } from "../labels.js";
import { messageOf } from "./HomeView.js";

const POLL_MS = 1000;

function isActive(analysis: Analysis): boolean {
  return analysis.status === "queued" || analysis.status === "running";
}

export function AnalysisView({ id }: { readonly id: string }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async (): Promise<void> => {
      try {
        const next = await getAnalysis(id);
        if (cancelled) {
          return;
        }
        setAnalysis(next);
        setLoadError(null);
        if (isActive(next)) {
          timer = setTimeout(() => {
            void tick();
          }, POLL_MS);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(messageOf(error));
        }
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
  }, [id]);

  const terminal = analysis !== null && !isActive(analysis) ? analysis.id : null;
  useEffect(() => {
    if (terminal !== null) {
      headingRef.current?.focus();
    }
  }, [terminal]);

  if (loadError !== null) {
    return (
      <section className="card">
        <h1 tabIndex={-1} ref={headingRef}>
          No se pudo cargar el análisis
        </h1>
        <p role="alert" className="notice notice-error">
          {loadError}
        </p>
        <p>
          <a href="#/">Volver al inicio</a>
        </p>
      </section>
    );
  }

  if (analysis === null) {
    return (
      <section className="card">
        <h1 tabIndex={-1}>Cargando el análisis</h1>
        <p role="status">Consultando el estado del análisis…</p>
      </section>
    );
  }

  if (isActive(analysis)) {
    return <Progress analysis={analysis} />;
  }

  if (analysis.status === "failed") {
    return (
      <section aria-labelledby="titulo-fallo" className="card">
        <h1 id="titulo-fallo" tabIndex={-1} ref={headingRef}>
          No se pudo completar el análisis
        </h1>
        <Meta analysis={analysis} />
        <p role="alert" className="notice notice-error">
          {analysis.errorMessage ?? "El análisis terminó con un error."}
        </p>
        <p className="hint">
          Código de error: <code>{analysis.errorCode ?? "desconocido"}</code>. Un fallo no significa
          que la página no tenga incidencias: no se ha comprobado.
        </p>
        <p>
          <a href="#/">Probar con otra dirección</a>
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="titulo-resultados" className="stack-lg">
      <div className="card">
        <h1 id="titulo-resultados" tabIndex={-1} ref={headingRef}>
          Resultados del análisis
        </h1>
        <Meta analysis={analysis} />
        <p className="notice">
          Las incidencias automáticas proceden de axe-core. Las comprobaciones de revisión manual no
          están aprobadas: requieren una revisión humana. Esta herramienta no certifica la
          conformidad WCAG.
        </p>
        <nav aria-label="Descargar informe" className="secondary-actions">
          <a
            className="button-link secondary-link"
            href={`/api/analyses/${analysis.id}/report?format=json`}
            download
          >
            Descargar informe JSON
          </a>
          <a
            className="button-link secondary-link"
            href={`/api/analyses/${analysis.id}/report?format=html`}
            download
          >
            Descargar informe HTML
          </a>
          <a
            className="button-link secondary-link"
            href={`/api/analyses/${analysis.id}/agent-prompts`}
            download
          >
            Prompt para Claude Code o Codex (Markdown)
          </a>
        </nav>
      </div>
      {analysis.summary !== null && <SummaryCards summary={analysis.summary} />}
      <FindingsPanel analysisId={analysis.id} />
    </section>
  );
}

function Meta({ analysis }: { readonly analysis: Analysis }) {
  return (
    <dl className="meta">
      <div>
        <dt>Dirección</dt>
        <dd>{analysis.url}</dd>
      </div>
      <div>
        <dt>Estado</dt>
        <dd>{STATUS_LABELS[analysis.status]}</dd>
      </div>
      <div>
        <dt>Creado</dt>
        <dd>{formatDate(analysis.createdAt)}</dd>
      </div>
      <div>
        <dt>Duración</dt>
        <dd>{formatDuration(analysis.durationMs)}</dd>
      </div>
      {analysis.axeVersion !== null && (
        <div>
          <dt>Versión de axe-core</dt>
          <dd>{analysis.axeVersion}</dd>
        </div>
      )}
    </dl>
  );
}

function Progress({ analysis }: { readonly analysis: Analysis }) {
  const current = analysis.stage;
  const currentIndex = current === null ? -1 : STAGE_ORDER.indexOf(current);
  const label = current === null ? "En cola, esperando su turno" : STAGE_LABELS[current];

  return (
    <section aria-labelledby="titulo-progreso" className="card">
      <h1 id="titulo-progreso" tabIndex={-1}>
        Analizando la página
      </h1>
      <p>
        <span className="sr-only">Dirección: </span>
        <code>{analysis.url}</code>
      </p>
      <p role="status" aria-live="polite" className="progress-label">
        {label}
      </p>
      <ol className="stages">
        {STAGE_ORDER.map((stage, index) => {
          const state =
            index < currentIndex ? "hecho" : index === currentIndex ? "en curso" : "pendiente";
          return (
            <li
              key={stage}
              aria-current={index === currentIndex ? "step" : undefined}
              data-state={state}
            >
              <span>{STAGE_LABELS[stage]}</span>
              <span className="sr-only"> ({state})</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
