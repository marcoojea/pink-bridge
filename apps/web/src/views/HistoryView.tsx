import { useEffect, useRef, useState } from "react";
import type { Analysis } from "@pink-bridge/shared";
import { createAnalysis, listAnalyses } from "../api/client.js";
import { analysisHref, navigateTo, routeHref } from "../router.js";
import { formatDate, formatDuration, STATUS_LABELS } from "../labels.js";
import { messageOf } from "./HomeView.js";

const PAGE_SIZE = 20;

export function HistoryView() {
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<Analysis[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    listAnalyses(PAGE_SIZE, offset)
      .then((page) => {
        if (!cancelled) {
          setItems(page.items);
          setTotal(page.total);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(messageOf(caught));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [offset]);

  async function repeat(analysis: Analysis): Promise<void> {
    setBusyId(analysis.id);
    setError(null);
    try {
      const request =
        analysis.source === "demo"
          ? { target: "demo" as const, submissionToken: crypto.randomUUID() }
          : { url: analysis.url, submissionToken: crypto.randomUUID() };
      const result = await createAnalysis(request);
      navigateTo(analysisHref(result.analysis.id));
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusyId(null);
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <section aria-labelledby="titulo-historial" className="card stack">
      <h1 id="titulo-historial" tabIndex={-1} ref={headingRef}>
        Histórico de análisis
      </h1>
      <p>
        Cada análisis se conserva por separado. Repetir una auditoría crea un análisis nuevo y no
        sobrescribe el anterior.
      </p>

      {error !== null && (
        <p role="alert" className="notice notice-error">
          {error}
        </p>
      )}

      {items === null && error === null && <p role="status">Cargando el histórico…</p>}

      {items !== null && items.length === 0 && (
        <div className="empty">
          <p>Todavía no hay análisis.</p>
          <p>
            <a href={routeHref("home")}>Analizar una página</a>
          </p>
        </div>
      )}

      {items !== null && items.length > 0 && (
        <ul className="history-list">
          {items.map((analysis) => (
            <li key={analysis.id} className="history-item">
              <div>
                <p>
                  <a href={analysisHref(analysis.id)}>{analysis.url}</a>
                </p>
                <p className="hint">
                  {formatDate(analysis.createdAt)} · {STATUS_LABELS[analysis.status]} ·{" "}
                  {formatDuration(analysis.durationMs)}
                  {analysis.summary !== null && (
                    <> · {analysis.summary.automaticFindings} incidencias automáticas</>
                  )}
                </p>
              </div>
              <button
                type="button"
                className="secondary"
                disabled={busyId !== null}
                aria-label={`Repetir análisis de ${analysis.url}`}
                onClick={() => {
                  void repeat(analysis);
                }}
              >
                Repetir análisis
              </button>
            </li>
          ))}
        </ul>
      )}

      {items !== null && total > PAGE_SIZE && (
        <nav aria-label="Paginación del histórico" className="pagination">
          <button
            type="button"
            className="secondary"
            disabled={offset === 0}
            onClick={() => {
              setOffset(Math.max(0, offset - PAGE_SIZE));
            }}
          >
            Anterior
          </button>
          <span role="status">
            Página {currentPage} de {pageCount}
          </span>
          <button
            type="button"
            className="secondary"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => {
              setOffset(offset + PAGE_SIZE);
            }}
          >
            Siguiente
          </button>
        </nav>
      )}
    </section>
  );
}
