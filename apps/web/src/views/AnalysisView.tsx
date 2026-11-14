import { useEffect, useRef, useState } from "react";
import type { Analysis, AnalysisSummary } from "@pink-bridge/shared";
import { getAnalysis } from "../api/client.js";
import { downloadWithToken, getToken } from "../api/token.js";
import { AgentPromptPanel } from "../components/AgentPromptPanel.js";
import { FindingsPanel } from "../components/FindingsPanel.js";
import { Glossary } from "../components/Glossary.js";
import { SummaryCards } from "../components/SummaryCards.js";
import {
  formatDate,
  formatDuration,
  pluralize,
  STAGE_LABELS,
  STAGE_ORDER,
  STATUS_LABELS,
} from "../labels.js";
import { messageOf } from "./HomeView.js";

import { apiHref } from "../demo.js";
const POLL_MS = 1000;
const POLL_MAX_MS = 5000;

function isActive(analysis: Analysis): boolean {
  return analysis.status === "queued" || analysis.status === "running";
}

/** Frase de resumen en lenguaje llano: lo primero que debe leer quien llega a la revisión. */
export function summarySentence(summary: AnalysisSummary | null): string {
  if (summary === null) {
    return "Todavía no hay resultados.";
  }
  const { automaticFindings, needsReview, byImpact } = summary;
  if (automaticFindings === 0 && needsReview === 0) {
    return "No hemos encontrado problemas automáticos. Eso no garantiza que la página sea accesible: algunas comprobaciones necesitan revisión a mano.";
  }
  const parts: string[] = [];
  if (automaticFindings > 0) {
    parts.push(
      `Hemos encontrado ${pluralize(automaticFindings, "problema automático", "problemas automáticos")}.`,
    );
    const severe = byImpact.critical + byImpact.serious;
    if (severe > 0) {
      parts.push(
        `${pluralize(severe, "es crítico o grave", "son críticos o graves")}. Empieza por ${severe === 1 ? "él" : "ellos"}.`,
      );
    }
  }
  if (needsReview > 0) {
    parts.push(
      `Además, ${pluralize(needsReview, "punto necesita", "puntos necesitan")} que lo revise una persona.`,
    );
  }
  return parts.join(" ");
}

export function AnalysisView({ id }: { readonly id: string }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Espera creciente mientras la revisión está en curso: 1 s, 2 s, 4 s y, después, 5 s.
    let delay = POLL_MS;

    const tick = async (): Promise<void> => {
      try {
        const next = await getAnalysis(id, controller.signal);
        setAnalysis(next);
        setLoadError(null);
        if (isActive(next)) {
          timer = setTimeout(() => {
            void tick();
          }, delay);
          delay = Math.min(delay * 2, POLL_MAX_MS);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(messageOf(error));
        }
      }
    };

    void tick();
    return () => {
      controller.abort();
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
          No se pudo abrir esta revisión
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
        <h1 tabIndex={-1}>Abriendo la revisión</h1>
        <p role="status">Un momento, estamos cargando la información.</p>
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
          No se pudo terminar la revisión
        </h1>
        <Meta analysis={analysis} />
        <p role="alert" className="notice notice-error">
          {analysis.errorMessage ?? "La revisión terminó con un error."}
        </p>
        <p className="hint">
          Que la revisión no haya terminado no significa que la página no tenga problemas: no se ha
          podido comprobar. Puedes intentarlo de nuevo.
        </p>
        {analysis.errorCode !== null && (
          <p className="hint">
            Código técnico: <code>{analysis.errorCode}</code>
          </p>
        )}
        <p>
          <a href="#/">Revisar otra página</a>
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="titulo-resultados" className="stack-lg">
      <div className="card">
        <h1 id="titulo-resultados" tabIndex={-1} ref={headingRef}>
          Resultados de la revisión
        </h1>
        <p className="lead">{summarySentence(analysis.summary)}</p>
        <Meta analysis={analysis} />
        <p className="notice">
          Pink Bridge ayuda a encontrar problemas. No certifica que la página cumpla WCAG ni
          sustituye las pruebas con personas que usan tecnologías de apoyo.
        </p>
      </div>

      <section aria-labelledby="titulo-pasos" className="card">
        <h2 id="titulo-pasos">Qué hacer ahora</h2>
        <ol className="steps">
          <li>
            Revisa los problemas, empezando por los críticos. Usa el filtro «Gravedad» en la lista
            de abajo.
          </li>
          <li>
            Corrígelos en tu proyecto. Si usas un asistente de programación, descarga sus
            instrucciones.
          </li>
          <li>Vuelve a revisar la página para comprobar que los problemas han desaparecido.</li>
        </ol>
      </section>

      <section aria-labelledby="titulo-guardar" className="card">
        <h2 id="titulo-guardar">Guardar o compartir</h2>
        <ul className="download-list">
          <li>
            <DownloadLink
              href={apiHref(`/api/analyses/${analysis.id}/report?format=html`)}
              filename={`informe-${analysis.id}.html`}
            >
              Informe para compartir (HTML)
            </DownloadLink>
            <span className="hint">Se abre en cualquier navegador. Envíalo a tu equipo.</span>
          </li>
          <li>
            <DownloadLink
              href={apiHref(`/api/analyses/${analysis.id}/report?format=json`)}
              filename={`datos-${analysis.id}.json`}
            >
              Datos completos (JSON)
            </DownloadLink>
            <span className="hint">Para programas que quieran procesar los resultados.</span>
          </li>
          <li>
            <DownloadLink
              href={apiHref(`/api/analyses/${analysis.id}/agent-prompts`)}
              filename={`instrucciones-${analysis.id}.md`}
            >
              Instrucciones para un asistente de programación (Markdown)
            </DownloadLink>
            <span className="hint">
              Sirven para pedir a Claude Code o Codex que corrijan los problemas.
            </span>
          </li>
        </ul>
        <AgentPromptPanel analysisId={analysis.id} />
      </section>

      {analysis.summary !== null && <SummaryCards summary={analysis.summary} />}
      <FindingsPanel analysisId={analysis.id} />
      <Glossary />
    </section>
  );
}

/** Enlace de descarga. Con token guardado descarga con la cabecera de autorización; sin él, es un enlace normal. */
function DownloadLink({
  href,
  filename,
  children,
}: {
  readonly href: string;
  readonly filename: string;
  readonly children: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <>
      <a
        className="button-link secondary-link"
        href={href}
        download={filename}
        onClick={(event) => {
          if (getToken() === null) {
            return;
          }
          event.preventDefault();
          setFailed(false);
          downloadWithToken(href, filename).catch(() => {
            setFailed(true);
          });
        }}
      >
        {children}
      </a>
      {failed && (
        <span role="alert" className="hint">
          No se pudo descargar. Comprueba el token de acceso.
        </span>
      )}
    </>
  );
}

function Meta({ analysis }: { readonly analysis: Analysis }) {
  return (
    <dl className="meta">
      <div>
        <dt>Página revisada</dt>
        <dd>{analysis.url}</dd>
      </div>
      <div>
        <dt>Estado</dt>
        <dd>{STATUS_LABELS[analysis.status]}</dd>
      </div>
      <div>
        <dt>Fecha</dt>
        <dd>{formatDate(analysis.createdAt)}</dd>
      </div>
      <div>
        <dt>Tiempo que tardó</dt>
        <dd>{formatDuration(analysis.durationMs)}</dd>
      </div>
      {analysis.axeVersion !== null && (
        <div>
          <dt>Motor de comprobación</dt>
          <dd>axe-core {analysis.axeVersion}</dd>
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
        Estamos revisando la página
      </h1>
      <p className="lead">
        Esto tarda unos segundos. No hace falta que hagas nada más mientras esperas.
      </p>
      <p>
        <span className="sr-only">Página: </span>
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
