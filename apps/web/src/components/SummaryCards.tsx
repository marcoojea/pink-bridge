import type { CSSProperties } from "react";
import type { AnalysisSummary, Impact } from "@pink-bridge/shared";
import { IMPACT_HELP, IMPACT_LABELS } from "../labels.js";

const IMPACT_ORDER: readonly Impact[] = ["critical", "serious", "moderate", "minor", "unknown"];

export function SummaryCards({ summary }: { readonly summary: AnalysisSummary }) {
  const impacts = IMPACT_ORDER.filter((impact) => summary.byImpact[impact] > 0);

  return (
    <section aria-labelledby="titulo-resumen" className="card">
      <h2 id="titulo-resumen">Resumen en cifras</h2>
      <dl className="summary-grid">
        <div style={{ "--i": 0 } as CSSProperties}>
          <dt>Problemas automáticos</dt>
          <dd>{summary.automaticFindings}</dd>
        </div>
        <div style={{ "--i": 1 } as CSSProperties}>
          <dt>Partes de la página afectadas</dt>
          <dd>{summary.affectedNodes}</dd>
        </div>
        <div style={{ "--i": 2 } as CSSProperties}>
          <dt>Para revisar a mano</dt>
          <dd>{summary.needsReview}</dd>
        </div>
        <div style={{ "--i": 3 } as CSSProperties}>
          <dt>Comprobaciones que sí superó</dt>
          <dd>{summary.passedRules}</dd>
        </div>
      </dl>
      <p className="hint">Un mismo problema puede afectar a varias partes de la página.</p>
      {impacts.length > 0 ? (
        <>
          <h3>Por gravedad</h3>
          <ul className="impact-list">
            {impacts.map((impact) => (
              <li key={impact}>
                <span className={`badge badge-${impact}`}>{IMPACT_LABELS[impact]}</span>{" "}
                {summary.byImpact[impact]}
                <span className="hint"> · {IMPACT_HELP[impact]}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="hint">No se ha encontrado ningún problema automático.</p>
      )}
    </section>
  );
}
