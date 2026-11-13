import type { CSSProperties } from "react";
import type { AnalysisSummary, Impact } from "@pink-bridge/shared";
import { IMPACT_LABELS } from "../labels.js";

const IMPACT_ORDER: readonly Impact[] = ["critical", "serious", "moderate", "minor", "unknown"];

export function SummaryCards({ summary }: { readonly summary: AnalysisSummary }) {
  const impacts = IMPACT_ORDER.filter((impact) => summary.byImpact[impact] > 0);

  return (
    <section aria-labelledby="titulo-resumen" className="card">
      <h2 id="titulo-resumen">Resumen</h2>
      <dl className="summary-grid">
        <div style={{ "--i": 0 } as CSSProperties}>
          <dt>Incidencias automáticas</dt>
          <dd>{summary.automaticFindings}</dd>
        </div>
        <div style={{ "--i": 1 } as CSSProperties}>
          <dt>Elementos afectados</dt>
          <dd>{summary.affectedNodes}</dd>
        </div>
        <div style={{ "--i": 2 } as CSSProperties}>
          <dt>Para revisión manual</dt>
          <dd>{summary.needsReview}</dd>
        </div>
        <div style={{ "--i": 3 } as CSSProperties}>
          <dt>Comprobaciones superadas por axe</dt>
          <dd>{summary.passedRules}</dd>
        </div>
      </dl>
      {impacts.length > 0 ? (
        <>
          <h3>Por gravedad</h3>
          <ul className="impact-list">
            {impacts.map((impact) => (
              <li key={impact}>
                <span className={`badge badge-${impact}`}>{IMPACT_LABELS[impact]}</span>{" "}
                {summary.byImpact[impact]}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="hint">No se ha detectado ninguna incidencia automática.</p>
      )}
    </section>
  );
}
