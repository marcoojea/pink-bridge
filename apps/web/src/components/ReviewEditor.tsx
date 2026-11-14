import { useId, useState, type SyntheticEvent } from "react";
import type { Finding, ReviewState, ReviewStatus } from "@pink-bridge/shared";
import { saveReview } from "../api/client.js";
import { messageOf } from "../views/HomeView.js";
import { formatDate } from "../labels.js";

/** Estados que el usuario elige, con texto pensado para quien no conoce la herramienta. */
const STATUS_OPTIONS: readonly (readonly [ReviewStatus, string])[] = [
  ["pending", "Todavía no lo he mirado"],
  ["reviewed", "Lo he revisado"],
  ["accepted", "Lo acepto tal cual, no lo voy a corregir"],
  ["fixed", "Ya lo he corregido"],
];

/**
 * Seguimiento humano del problema. Se guarda aparte de la revisión automática: cambiar el
 * estado nunca altera los resultados.
 */
export function ReviewEditor({
  finding,
  review,
  onSaved,
}: {
  readonly finding: Finding;
  readonly review: ReviewState | undefined;
  readonly onSaved: (review: ReviewState) => void;
}) {
  const statusId = useId();
  const noteId = useId();
  const [status, setStatus] = useState<ReviewStatus>(review?.status ?? "pending");
  const [note, setNote] = useState(review?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving) {
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const trimmed = note.trim();
      const saved = await saveReview(finding.id, {
        status,
        ...(trimmed === "" ? {} : { note: trimmed }),
      });
      onSaved(saved);
      setMessage("Tu seguimiento está guardado.");
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      className="review-editor stack"
      aria-labelledby={`${statusId}-title`}
    >
      <h4 id={`${statusId}-title`}>Tu seguimiento</h4>
      <p className="hint">
        Sirve para que tu equipo sepa en qué punto está este problema. No cambia el resultado de la
        revisión.
      </p>
      <div className="field">
        <label htmlFor={statusId}>¿En qué punto estás?</label>
        <select
          id={statusId}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as ReviewStatus);
          }}
          disabled={saving}
        >
          {STATUS_OPTIONS.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={noteId}>Nota (opcional)</label>
        <textarea
          id={noteId}
          maxLength={500}
          rows={3}
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
          }}
          disabled={saving}
        />
      </div>
      {status === "fixed" && (
        <p className="notice">
          Pink Bridge no comprueba por sí sola que el problema esté corregido. Para confirmarlo,
          vuelve a revisar la página cuando hayas hecho el cambio.
        </p>
      )}
      <div className="actions">
        <button type="submit" disabled={saving}>
          {saving ? "Guardando…" : "Guardar mi seguimiento"}
        </button>
        {review && (
          <span className="hint">Última vez guardado: {formatDate(review.updatedAt)}</span>
        )}
      </div>
      {message !== null && (
        <p role="status" className="hint">
          {message}
        </p>
      )}
      {error !== null && (
        <p role="alert" className="notice notice-error">
          {error}
        </p>
      )}
    </form>
  );
}
