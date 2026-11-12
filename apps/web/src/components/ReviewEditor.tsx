import { useId, useState, type SyntheticEvent } from "react";
import type { Finding, ReviewState, ReviewStatus } from "@pink-bridge/shared";
import { saveReview } from "../api/client.js";
import { messageOf } from "../views/HomeView.js";
import { formatDate, REVIEW_LABELS } from "../labels.js";

const STATUS_OPTIONS: readonly ReviewStatus[] = ["pending", "reviewed", "accepted", "fixed"];

/**
 * Editor del estado de revisión humana. Se guarda aparte de la auditoría: los resultados
 * automáticos nunca cambian al revisar.
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
      setMessage("Revisión guardada.");
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
      <h4 id={`${statusId}-title`}>Revisión humana</h4>
      <div className="field">
        <label htmlFor={statusId}>Estado</label>
        <select
          id={statusId}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as ReviewStatus);
          }}
          disabled={saving}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {REVIEW_LABELS[option]}
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
          Marcar la incidencia como corregida es una decisión humana. No se verifica
          automáticamente: confirma el cambio con un nuevo análisis.
        </p>
      )}
      <div className="actions">
        <button type="submit" disabled={saving}>
          {saving ? "Guardando…" : "Guardar revisión"}
        </button>
        {review && (
          <span className="hint">Última actualización: {formatDate(review.updatedAt)}</span>
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
