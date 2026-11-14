import type {
  AnalysisStage,
  AnalysisStatus,
  FindingKind,
  Impact,
  ReviewStatus,
} from "@pink-bridge/shared";

export const IMPACT_LABELS: Readonly<Record<Impact, string>> = {
  critical: "Crítico",
  serious: "Grave",
  moderate: "Moderado",
  minor: "Menor",
  unknown: "Sin clasificar",
};

/** Qué significa cada gravedad, para quien no conoce la escala. */
export const IMPACT_HELP: Readonly<Record<Impact, string>> = {
  critical: "Impide usar esa parte de la página.",
  serious: "Dificulta mucho usarla.",
  moderate: "Molesta, pero se puede usar.",
  minor: "Pequeño detalle que conviene corregir.",
  unknown: "La herramienta no ha podido valorar su gravedad.",
};

export const STATUS_LABELS: Readonly<Record<AnalysisStatus, string>> = {
  queued: "En cola",
  running: "En curso",
  completed: "Completada",
  failed: "No completada",
};

export const STAGE_LABELS: Readonly<Record<AnalysisStage, string>> = {
  validating: "Comprobando la dirección",
  preparing_browser: "Abriendo la página en un navegador aislado",
  navigating: "Cargando la página",
  running_checks: "Buscando problemas de accesibilidad",
  processing_results: "Ordenando los resultados",
  saving_report: "Guardando la revisión",
  completed: "Revisión terminada",
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
  automatic: "Problema automático",
  needs_review: "Para revisar a mano",
};

export const KIND_HELP: Readonly<Record<FindingKind, string>> = {
  automatic: "La herramienta lo ha comprobado y es un fallo claro.",
  needs_review:
    "La herramienta no puede decidirlo sola. Una persona debe comprobar si la página cumple.",
};

export const REVIEW_LABELS: Readonly<Record<ReviewStatus, string>> = {
  pending: "Sin revisar",
  reviewed: "Revisado",
  accepted: "Aceptado, no se corrige",
  fixed: "Corregido (sin verificar)",
};

/**
 * Nombres sencillos de las reglas de axe más habituales. Lo que no esté aquí se muestra
 * con su nombre técnico, que sigue siendo útil para quien desarrolla.
 */
export const RULE_NAMES: Readonly<Record<string, string>> = {
  "image-alt": "Imagen sin descripción",
  "button-name": "Botón sin nombre",
  "link-name": "Enlace sin texto",
  "color-contrast": "Texto con poco contraste",
  "heading-order": "Títulos en desorden",
  label: "Campo sin etiqueta",
  "html-has-lang": "Página sin idioma indicado",
  "document-title": "Página sin título",
  list: "Lista mal construida",
  region: "Contenido fuera de regiones",
  "landmark-one-main": "Falta el contenido principal",
  "page-has-heading-one": "Falta el título principal",
  "duplicate-id": "Identificadores repetidos",
  "aria-allowed-attr": "Atributo ARIA no permitido",
};

export function ruleTitle(ruleId: string): string {
  return RULE_NAMES[ruleId] ?? `Regla técnica ${ruleId}`;
}

/** Plural sencillo en español: pluralize(1, "problema") → "1 problema". */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${String(count)} ${count === 1 ? singular : plural}`;
}

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
