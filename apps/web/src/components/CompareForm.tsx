import { useId, useState } from "react";
import type { Analysis } from "@pink-bridge/shared";
import { compareHref, navigateTo } from "../router.js";
import { formatDate } from "../labels.js";

/**
 * Elige dos revisiones completadas de la misma dirección. Solo ofrece combinaciones compatibles,
 * de modo que el servidor nunca recibe una comparación que sabemos inválida.
 */
export function CompareForm({ items }: { readonly items: readonly Analysis[] }) {
  const baseId = useId();
  const targetId = useId();
  const completed = items.filter((item) => item.status === "completed");
  const [baseline, setBaseline] = useState("");
  const [target, setTarget] = useState("");

  const base = completed.find((item) => item.id === baseline);
  const targets = base ? completed.filter((item) => item.normalizedUrl === base.normalizedUrl) : [];

  if (completed.length < 2) {
    return null;
  }

  return (
    <section aria-labelledby={`${baseId}-title`} className="card stack">
      <h2 id={`${baseId}-title`}>¿Quieres ver qué ha cambiado?</h2>
      <p className="hint">
        Elige dos revisiones completadas de la misma página. Te diremos qué problemas son nuevos,
        cuáles han desaparecido y cuáles siguen igual.
      </p>
      <div className="filter-row">
        <div className="field">
          <label htmlFor={baseId}>Primera revisión (la más antigua)</label>
          <select
            id={baseId}
            value={baseline}
            onChange={(event) => {
              setBaseline(event.target.value);
              setTarget("");
            }}
          >
            <option value="">Elegir…</option>
            {completed.map((item) => (
              <option key={item.id} value={item.id}>
                {item.url} · {formatDate(item.createdAt)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={targetId}>Segunda revisión (la más reciente)</label>
          <select
            id={targetId}
            value={target}
            disabled={base === undefined}
            onChange={(event) => {
              setTarget(event.target.value);
            }}
          >
            <option value="">Elegir…</option>
            {targets.map((item) => (
              <option key={item.id} value={item.id}>
                {item.url} · {formatDate(item.createdAt)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="actions">
        <button
          type="button"
          disabled={baseline === "" || target === "" || baseline === target}
          onClick={() => {
            navigateTo(compareHref(baseline, target));
          }}
        >
          Comparar
        </button>
      </div>
    </section>
  );
}
