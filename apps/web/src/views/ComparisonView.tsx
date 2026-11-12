import { useEffect, useRef, useState } from "react";
import type { ComparisonEntry, ComparisonResult } from "@pink-bridge/shared";
import { compareAnalyses } from "../api/client.js";
import { historyHref } from "../router.js";
import { IMPACT_LABELS } from "../labels.js";
import { messageOf } from "./HomeView.js";

const MATCH_LABELS: Readonly<Record<"exact" | "approximate", string>> = {
  exact: "Coincidencia exacta",
  approximate: "Coincidencia aproximada",
};

function signed(value: number): string {
  return value > 0 ? `+${String(value)}` : String(value);
}

function EntryList({
  entries,
  empty,
}: {
  readonly entries: readonly ComparisonEntry[];
  readonly empty: string;
}) {
  if (entries.length === 0) {
    return <p className="hint">{empty}</p>;
  }
  return (
    <ul className="finding-list">
      {entries.map((entry, index) => (
        <li key={`${entry.ruleId}-${String(index)}`} className="finding-item">
          <div>
            <h4>{entry.ruleId}</h4>
            <p className="badges">
              <span className={`badge badge-${entry.impact}`}>{IMPACT_LABELS[entry.impact]}</span>
              {entry.matchType !== null && (
                <span className="badge">{MATCH_LABELS[entry.matchType]}</span>
              )}
            </p>
            <p className="hint">
              {entry.affectedNodeCount} {entry.affectedNodeCount === 1 ? "elemento" : "elementos"}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ComparisonView({ from, to }: { readonly from: string; readonly to: string }) {
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let cancelled = false;
    compareAnalyses(from, to)
      .then((value) => {
        if (!cancelled) {
          setResult(value);
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
  }, [from, to]);

  useEffect(() => {
    if (result !== null || error !== null) {
      headingRef.current?.focus();
    }
  }, [result, error]);

  if (error !== null) {
    return (
      <section className="card">
        <h1 tabIndex={-1} ref={headingRef}>
          No se pudo comparar
        </h1>
        <p role="alert" className="notice notice-error">
          {error}
        </p>
        <p>
          <a href={historyHref()}>Volver al histórico</a>
        </p>
      </section>
    );
  }

  if (result === null) {
    return (
      <section className="card">
        <h1 tabIndex={-1}>Comparando análisis</h1>
        <p role="status">Calculando las diferencias…</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="titulo-comparacion" className="stack-lg">
      <div className="card">
        <h1 id="titulo-comparacion" tabIndex={-1} ref={headingRef}>
          Comparación de análisis
        </h1>
        <p>
          <span className="sr-only">Dirección: </span>
          <code>{result.normalizedUrl}</code>
        </p>
        <p className="notice">
          Las incidencias «resueltas» han dejado de aparecer en el segundo análisis. No se han
          verificado como corregidas.
        </p>
      </div>

      <section aria-labelledby="titulo-resumen-comparacion" className="card">
        <h2 id="titulo-resumen-comparacion">Resumen de cambios</h2>
        <dl className="comparison-summary">
          <div>
            <dt>Nuevas</dt>
            <dd>{result.newFindings.length}</dd>
          </div>
          <div>
            <dt>Resueltas</dt>
            <dd>{result.resolvedFindings.length}</dd>
          </div>
          <div>
            <dt>Persistentes</dt>
            <dd>{result.persistentFindings.length}</dd>
          </div>
          <div>
            <dt>Incidencias automáticas</dt>
            <dd>{signed(result.summaryDelta.automaticFindings)}</dd>
          </div>
          <div>
            <dt>Elementos afectados</dt>
            <dd>{signed(result.summaryDelta.affectedNodes)}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="titulo-nuevas" className="card">
        <h2 id="titulo-nuevas">Nuevas</h2>
        <EntryList entries={result.newFindings} empty="No hay incidencias nuevas." />
      </section>

      <section aria-labelledby="titulo-resueltas" className="card">
        <h2 id="titulo-resueltas">Resueltas (no verificadas)</h2>
        <EntryList
          entries={result.resolvedFindings}
          empty="No hay incidencias que hayan dejado de aparecer."
        />
      </section>

      <section aria-labelledby="titulo-persistentes" className="card">
        <h2 id="titulo-persistentes">Persistentes</h2>
        <EntryList entries={result.persistentFindings} empty="No hay incidencias que persistan." />
      </section>

      <section aria-labelledby="titulo-limitaciones" className="card">
        <h2 id="titulo-limitaciones">Limitaciones de la comparación</h2>
        <ul>
          {result.limitations.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </section>
    </section>
  );
}
