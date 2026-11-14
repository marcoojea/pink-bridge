import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Finding, FindingKind, Impact, ReviewState } from "@pink-bridge/shared";
import { getFindings, getReviews } from "../api/client.js";
import { messageOf } from "../views/HomeView.js";
import {
  IMPACT_HELP,
  IMPACT_LABELS,
  KIND_HELP,
  KIND_LABELS,
  pluralize,
  REVIEW_LABELS,
  ruleTitle,
} from "../labels.js";
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

const VIEWPORT_LABELS: Readonly<Record<"mobile" | "tablet" | "desktop", string>> = {
  mobile: "móvil",
  tablet: "tablet",
  desktop: "escritorio",
};

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
        <h2>Problemas encontrados</h2>
        <p role="alert" className="notice notice-error">
          {loadError}
        </p>
      </section>
    );
  }

  if (findings === null) {
    return (
      <section className="card">
        <h2>Problemas encontrados</h2>
        <p role="status">Cargando la lista de problemas…</p>
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
      <h2 id="titulo-incidencias">Problemas encontrados</h2>

      {findings.length === 0 ? (
        <p>No hemos encontrado ningún problema automático ni comprobación pendiente de revisar.</p>
      ) : (
        <>
          <p>
            Cada tarjeta es un problema. Pulsa «Ver cómo arreglarlo» para ver dónde está y qué
            hacer.
          </p>
          <fieldset className="filters">
            <legend>Mostrar solo</legend>
            <div className="filter-row">
              <div className="field">
                <label htmlFor="filtro-tipo">Tipo de problema</label>
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
                <label htmlFor="filtro-regla">Regla técnica (para desarrolladores)</label>
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
                      {ruleTitle(rule)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <dl className="impact-help">
              {IMPACT_OPTIONS.map((impact) => (
                <div key={impact}>
                  <dt>
                    <span className={`badge badge-${impact}`}>{IMPACT_LABELS[impact]}</span>
                  </dt>
                  <dd className="hint">{IMPACT_HELP[impact]}</dd>
                </div>
              ))}
            </dl>
          </fieldset>

          <p className="hint" role="status" aria-live="polite">
            Mostrando {pluralize(visible.length, "problema", "problemas")} de{" "}
            {pluralize(findings.length, "problema", "problemas")}.
          </p>

          {visible.length === 0 ? (
            <div className="empty">
              <p>No hay problemas que coincidan con estos filtros.</p>
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
                    <h3>{ruleTitle(finding.ruleId)}</h3>
                    <p className="badges">
                      <span className={`badge badge-${finding.impact}`}>
                        {IMPACT_LABELS[finding.impact]}
                      </span>
                      <span className="badge badge-kind">{KIND_LABELS[finding.kind]}</span>
                    </p>
                    <p>{finding.description}</p>
                    {finding.pageUrl !== undefined && (
                      <p className="hint">
                        Dónde: {finding.pageUrl}
                        {finding.viewport !== undefined &&
                          ` (${VIEWPORT_LABELS[finding.viewport]})`}
                      </p>
                    )}
                    <p className="hint">
                      {pluralize(
                        finding.affectedNodeCount,
                        "elemento afectado",
                        "elementos afectados",
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    aria-expanded={selectedId === finding.id}
                    aria-controls="detalle-incidencia"
                    aria-label={`${selectedId === finding.id ? "Ocultar" : "Ver cómo arreglarlo"}: ${ruleTitle(finding.ruleId)}`}
                    onClick={() => {
                      setSelectedId(selectedId === finding.id ? null : finding.id);
                    }}
                  >
                    {selectedId === finding.id ? "Ocultar" : "Ver cómo arreglarlo"}
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
  const title = ruleTitle(finding.ruleId);

  return (
    <section
      id="detalle-incidencia"
      aria-labelledby="titulo-detalle"
      className="detail"
      tabIndex={-1}
      ref={detailRef}
    >
      <h3 id="titulo-detalle">Cómo arreglar: {title}</h3>
      <p className="badges">
        <span className={`badge badge-${finding.impact}`}>{IMPACT_LABELS[finding.impact]}</span>
        <span className="badge badge-kind">{KIND_LABELS[finding.kind]}</span>
        <span className="badge badge-pending">
          Tu revisión: {REVIEW_LABELS[review?.status ?? "pending"]}
        </span>
      </p>

      {isReview && <p className="notice">{KIND_HELP.needs_review}</p>}

      <h4>Qué significa</h4>
      <p>{finding.description}</p>

      <h4>Norma WCAG relacionada</h4>
      {finding.wcagReferences.length > 0 ? (
        <p>
          WCAG {finding.wcagReferences.join(", ")}. Son las normas internacionales de accesibilidad
          web.
        </p>
      ) : (
        <p>No está ligado a una norma WCAG concreta: es una buena práctica.</p>
      )}

      <h4>Cómo arreglarlo</h4>
      <p>{finding.recommendation}</p>

      {finding.helpUrl !== null && (
        <p>
          <a href={finding.helpUrl} target="_blank" rel="noopener noreferrer">
            Leer la explicación de esta regla (se abre en otra pestaña)
          </a>
        </p>
      )}

      <h4>Dónde está</h4>
      <p className="hint">
        Cada elemento es una parte concreta de la página. El selector sirve para localizarlo en el
        código.
      </p>
      <ol className="node-list">
        {finding.nodes.map((node, index) => (
          <li key={node.id}>
            <p>
              Elemento {index + 1}. Selector: <code>{node.selector}</code>
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
                  <p className="hint">Algunos valores sensibles se han ocultado.</p>
                )}
              </div>
            ))}
          </li>
        ))}
      </ol>

      <ReviewEditor key={finding.id} finding={finding} review={review} onSaved={onSaved} />

      <p className="hint">
        Esta lista muestra lo que encontró la revisión. Tu seguimiento se guarda aparte y no cambia
        el resultado.
      </p>
    </section>
  );
}
