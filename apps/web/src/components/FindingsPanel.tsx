import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Finding, FindingKind, Impact, ReviewState } from "@pink-bridge/shared";
import { getFindings, getReviews } from "../api/client.js";
import { messageOf } from "../views/HomeView.js";
import { IMPACT_LABELS, KIND_LABELS, REVIEW_LABELS } from "../labels.js";
import { ReviewEditor } from "./ReviewEditor.js";

export interface FindingFilters {
  readonly kind: FindingKind | "";
  readonly impact: Impact | "";
  readonly ruleId: string;
  readonly viewport?: "mobile" | "tablet" | "desktop" | "";
}

export const NO_FILTERS: FindingFilters = { kind: "", impact: "", ruleId: "" };

/** Filtros combinables sobre el conjunto de incidencias de un análisis. */
export function filterFindings(findings: readonly Finding[], filters: FindingFilters): Finding[] {
  return findings.filter(
    (finding) =>
      (filters.kind === "" || finding.kind === filters.kind) &&
      (filters.impact === "" || finding.impact === filters.impact) &&
      (filters.ruleId === "" || finding.ruleId === filters.ruleId) &&
      (!filters.viewport || finding.viewport === filters.viewport),
  );
}

const IMPACT_OPTIONS: readonly Impact[] = ["critical", "serious", "moderate", "minor", "unknown"];

export function FindingsPanel({ analysisId }: { readonly analysisId: string }) {
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [reviews, setReviews] = useState<Record<string, ReviewState>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FindingFilters>(NO_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getFindings(analysisId), getReviews(analysisId)])
      .then(([items, reviewList]) => {
        if (!cancelled) {
          setFindings(items);
          setReviews(Object.fromEntries(reviewList.map((review) => [review.findingId, review])));
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(messageOf(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [analysisId]);

  const rules = useMemo(
    () => [...new Set((findings ?? []).map((finding) => finding.ruleId))].sort(),
    [findings],
  );
  const visible = useMemo(() => filterFindings(findings ?? [], filters), [findings, filters]);
  const selected = findings?.find((finding) => finding.id === selectedId) ?? null;

  useEffect(() => {
    if (selected !== null) {
      detailRef.current?.focus();
    }
  }, [selected]);

  if (loadError !== null) {
    return (
      <section className="card">
        <h2>Incidencias</h2>
        <p role="alert" className="notice notice-error">
          {loadError}
        </p>
      </section>
    );
  }

  if (findings === null) {
    return (
      <section className="card">
        <h2>Incidencias</h2>
        <p role="status">Cargando las incidencias…</p>
        <ul className="finding-list" aria-hidden="true">
          {[0, 1, 2].map((row) => (
            <li key={row} className="skeleton-row" />
          ))}
        </ul>
      </section>
    );
  }

  const filtersActive = filters.kind !== "" || filters.impact !== "" || filters.ruleId !== "";

  return (
    <section aria-labelledby="titulo-incidencias" className="card stack">
      <h2 id="titulo-incidencias">Incidencias</h2>

      {findings.length === 0 ? (
        <p>
          No se ha detectado ninguna incidencia automática ni comprobación pendiente de revisión.
        </p>
      ) : (
        <>
          <fieldset className="filters">
            <legend>Filtrar incidencias</legend>
            <div className="filter-row">
              <div className="field">
                <label htmlFor="filtro-tipo">Tipo</label>
                <select
                  id="filtro-tipo"
                  value={filters.kind}
                  onChange={(event) => {
                    setFilters({ ...filters, kind: event.target.value as FindingKind | "" });
                  }}
                >
                  <option value="">Todos</option>
                  <option value="automatic">{KIND_LABELS.automatic}</option>
                  <option value="needs_review">{KIND_LABELS.needs_review}</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="filtro-gravedad">Gravedad</label>
                <select
                  id="filtro-gravedad"
                  value={filters.impact}
                  onChange={(event) => {
                    setFilters({ ...filters, impact: event.target.value as Impact | "" });
                  }}
                >
                  <option value="">Todas</option>
                  {IMPACT_OPTIONS.map((impact) => (
                    <option key={impact} value={impact}>
                      {IMPACT_LABELS[impact]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="filtro-regla">Regla</label>
                <select
                  id="filtro-regla"
                  value={filters.ruleId}
                  onChange={(event) => {
                    setFilters({ ...filters, ruleId: event.target.value });
                  }}
                >
                  <option value="">Todas</option>
                  {rules.map((rule) => (
                    <option key={rule} value={rule}>
                      {rule}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </fieldset>

          <p className="hint" role="status" aria-live="polite">
            Mostrando {visible.length} de {findings.length} incidencias.
          </p>

          {visible.length === 0 ? (
            <div className="empty">
              <p>No hay incidencias que coincidan con los filtros.</p>
              {filtersActive && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setFilters(NO_FILTERS);
                  }}
                >
                  Quitar filtros
                </button>
              )}
            </div>
          ) : (
            <ul className="finding-list">
              {visible.map((finding) => (
                <li key={finding.id} className="finding-item">
                  <div>
                    <h3>{finding.ruleId}</h3>
                    <p className="badges">
                      <span className={`badge badge-${finding.impact}`}>
                        {IMPACT_LABELS[finding.impact]}
                      </span>
                      <span className="badge badge-kind">{KIND_LABELS[finding.kind]}</span>
                    </p>
                    <p>{finding.description}</p>
                    {finding.pageUrl !== undefined && (
                      <p className="hint">
                        {finding.pageUrl} · {finding.viewport ?? "escritorio"}
                      </p>
                    )}
                    <p className="hint">
                      {finding.affectedNodeCount}{" "}
                      {finding.affectedNodeCount === 1 ? "elemento" : "elementos"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    aria-expanded={selectedId === finding.id}
                    aria-controls="detalle-incidencia"
                    aria-label={`${selectedId === finding.id ? "Ocultar" : "Ver"} detalle de ${finding.ruleId}`}
                    onClick={() => {
                      setSelectedId(selectedId === finding.id ? null : finding.id);
                    }}
                  >
                    {selectedId === finding.id ? "Ocultar detalle" : "Ver detalle"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {selected !== null && (
        <FindingDetail
          finding={selected}
          detailRef={detailRef}
          review={reviews[selected.id]}
          onSaved={(saved) => {
            setReviews((current) => ({ ...current, [saved.findingId]: saved }));
          }}
        />
      )}
    </section>
  );
}

function FindingDetail({
  finding,
  detailRef,
  review,
  onSaved,
}: {
  readonly finding: Finding;
  readonly detailRef: RefObject<HTMLElement | null>;
  readonly review: ReviewState | undefined;
  readonly onSaved: (review: ReviewState) => void;
}) {
  const isReview = finding.kind === "needs_review";

  return (
    <section
      id="detalle-incidencia"
      aria-labelledby="titulo-detalle"
      className="detail"
      tabIndex={-1}
      ref={detailRef}
    >
      <h3 id="titulo-detalle">Detalle: {finding.ruleId}</h3>
      <p className="badges">
        <span className={`badge badge-${finding.impact}`}>{IMPACT_LABELS[finding.impact]}</span>
        <span className="badge badge-kind">{KIND_LABELS[finding.kind]}</span>
        <span className="badge badge-pending">
          Estado de revisión: {REVIEW_LABELS[review?.status ?? "pending"]}
        </span>
      </p>

      {isReview && (
        <p className="notice">
          Esta comprobación requiere revisión manual. No está aprobada ni incumplida por la
          herramienta.
        </p>
      )}

      <h4>Qué significa</h4>
      <p>{finding.description}</p>

      <h4>Criterio de referencia</h4>
      {finding.wcagReferences.length > 0 ? (
        <p>WCAG {finding.wcagReferences.join(", ")}</p>
      ) : (
        <p>Sin criterio WCAG asociado: se trata de una buena práctica.</p>
      )}

      <h4>Recomendación</h4>
      <p>{finding.recommendation}</p>

      {finding.helpUrl !== null && (
        <p>
          <a href={finding.helpUrl} target="_blank" rel="noopener noreferrer">
            Documentación de la regla en axe-core (se abre en una pestaña nueva)
          </a>
        </p>
      )}

      <h4>Elementos afectados</h4>
      <ol className="node-list">
        {finding.nodes.map((node) => (
          <li key={node.id}>
            <p>
              Selector: <code>{node.selector}</code>
            </p>
            {node.evidence.map((item) => (
              <div key={`${node.id}-${item.type}`}>
                {item.type === "html_snippet" ? (
                  <pre>
                    <code>{item.content}</code>
                  </pre>
                ) : (
                  <p className="hint">{item.content}</p>
                )}
                {item.redacted && (
                  <p className="hint">Algunos valores sensibles se han redactado.</p>
                )}
              </div>
            ))}
          </li>
        ))}
      </ol>

      <ReviewEditor key={finding.id} finding={finding} review={review} onSaved={onSaved} />

      <p className="hint">
        Las incidencias y las comprobaciones de revisión manual se muestran tal como las ha
        detectado el análisis. La revisión humana se guarda aparte y no altera el resultado.
      </p>
    </section>
  );
}
