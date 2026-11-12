import type { AnalysisStage, AnalysisStatus, FindingKind, Impact } from "@pink-bridge/shared";

export const IMPACT_LABELS: Readonly<Record<Impact, string>> = {
  critical: "Crítico",
  serious: "Grave",
  moderate: "Moderado",
  minor: "Menor",
  unknown: "Sin clasificar",
};

export const STATUS_LABELS: Readonly<Record<AnalysisStatus, string>> = {
  queued: "En cola",
  running: "En curso",
  completed: "Completado",
  failed: "Fallido",
};

export const STAGE_LABELS: Readonly<Record<AnalysisStage, string>> = {
  validating: "Validando la URL",
  preparing_browser: "Preparando el navegador aislado",
  navigating: "Cargando la página",
  running_checks: "Ejecutando las comprobaciones de accesibilidad",
  processing_results: "Procesando los resultados",
  saving_report: "Guardando el informe",
  completed: "Completado",
};

/** Orden de las etapas reales del proceso, para mostrar el progreso. */
export const STAGE_ORDER: readonly AnalysisStage[] = [
  "validating",
  "preparing_browser",
  "navigating",
  "running_checks",
  "processing_results",
  "saving_report",
  "completed",
];

export const KIND_LABELS: Readonly<Record<FindingKind, string>> = {
  automatic: "Incidencia automática",
  needs_review: "Revisión manual",
};

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

export function formatDuration(ms: number | null): string {
  if (ms === null) {
    return "—";
  }
  return `${(ms / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })} s`;
}
