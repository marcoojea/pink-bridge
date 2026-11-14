import { useEffect, useRef, useState } from "react";
import type { ComparisonEntry, ComparisonResult } from "@pink-bridge/shared";
import { compareAnalyses } from "../api/client.js";
import { historyHref } from "../router.js";
import { IMPACT_LABELS, ruleTitle } from "../labels.js";
import { messageOf } from "./HomeView.js";

const MATCH_LABELS: Readonly<Record<"exact" | "approximate", string>> = {
  exact: "Mismo problema, misma parte de la página",
  approximate: "Parece el mismo problema, pero en otra posición",
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
            <h4>{ruleTitle(entry.ruleId)}</h4>
            <p className="badges">
              <span className={`badge badge-${entry.impact}`}>{IMPACT_LABELS[entry.impact]}</span>
              {entry.matchType !== null && (
                <span className="badge">{MATCH_LABELS[entry.matchType]}</span>
              )}
            </p>
            <p className="hint">
              {entry.affectedNodeCount} {entry.affectedNodeCount === 1 ? "parte" : "partes"} de la
              página afectadas
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
          <a href={historyHref()}>Volver a mis revisiones</a>
        </p>
      </section>
    );
  }

  if (result === null) {
    return (
      <section className="card">
        <h1 tabIndex={-1}>Comparando las revisiones</h1>
        <p role="status">Calculando las diferencias…</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="titulo-comparacion" className="stack-lg">
      <div className="card">
        <h1 id="titulo-comparacion" tabIndex={-1} ref={headingRef}>
          Qué ha cambiado
        </h1>
        <p>
          <span className="sr-only">Página: </span>
          <code>{result.normalizedUrl}</code>
        </p>
        <p className="notice">
          «Resuelto» significa que el problema ya no aparece en la revisión más reciente. No
          significa que esté comprobado como corregido: confírmalo revisando la página.
        </p>
      </div>

      <section aria-labelledby="titulo-resumen-comparacion" className="card">
        <h2 id="titulo-resumen-comparacion">Resumen de cambios</h2>
        <dl className="comparison-summary">
          <div>
            <dt>Problemas nuevos</dt>
            <dd>{result.newFindings.length}</dd>
          </div>
          <div>
            <dt>Resueltos (sin comprobar)</dt>
            <dd>{result.resolvedFindings.length}</dd>
          </div>
          <div>
            <dt>Siguen igual</dt>
            <dd>{result.persistentFindings.length}</dd>
          </div>
          <div>
            <dt>Cambio en problemas automáticos</dt>
            <dd>{signed(result.summaryDelta.automaticFindings)}</dd>
          </div>
          <div>
            <dt>Cambio en partes afectadas</dt>
            <dd>{signed(result.summaryDelta.affectedNodes)}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="titulo-nuevas" className="card">
        <h2 id="titulo-nuevas">Problemas nuevos</h2>
        <p className="hint">Están en la revisión más reciente y no estaban en la anterior.</p>
        <EntryList entries={result.newFindings} empty="No hay problemas nuevos." />
      </section>

      <section aria-labelledby="titulo-resueltas" className="card">
        <h2 id="titulo-resueltas">Resueltos (sin comprobar)</h2>
        <p className="hint">Estaban en la revisión anterior y ya no aparecen.</p>
        <EntryList
          entries={result.resolvedFindings}
          empty="No hay problemas que hayan dejado de aparecer."
        />
      </section>

      <section aria-labelledby="titulo-persistentes" className="card">
        <h2 id="titulo-persistentes">Siguen igual</h2>
        <p className="hint">Aparecen en las dos revisiones: todavía no se han corregido.</p>
        <EntryList entries={result.persistentFindings} empty="Ningún problema sigue igual." />
      </section>

      <section aria-labelledby="titulo-limitaciones" className="card">
        <h2 id="titulo-limitaciones">Límites de esta comparación</h2>
        <ul>
          {result.limitations.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </section>
    </section>
  );
}
