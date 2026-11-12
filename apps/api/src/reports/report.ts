import {
  API_VERSION,
  type Analysis,
  type AnalysisSummary,
  type Finding,
  type ReviewState,
} from "@pink-bridge/shared";

/** Límites metodológicos que todo informe incluye. */
export const REPORT_LIMITATIONS: readonly string[] = [
  "Las pruebas automáticas no sustituyen la navegación manual con teclado.",
  "No sustituyen las pruebas con lectores de pantalla ni con otros productos de apoyo.",
  "No evalúan el zoom al 200 % ni el reflow del contenido; solo detectan algunos problemas relacionados.",
  "Solo evalúan la página en el momento de la carga: no cubren flujos interactivos ni contenido que aparece después.",
  "No sustituyen las pruebas con personas usuarias reales ni con distintos navegadores y dispositivos.",
  "Los estados de revisión son decisiones humanas y no se verifican automáticamente.",
  "Este informe no certifica la conformidad con WCAG 2.2.",
];

const IMPACT_LABELS: Readonly<Record<Finding["impact"], string>> = {
  critical: "Crítico",
  serious: "Grave",
  moderate: "Moderado",
  minor: "Menor",
  unknown: "Sin clasificar",
};

export interface ReportEvidence {
  readonly type: string;
  readonly content: string;
  readonly redacted: boolean;
}

export interface ReportFinding {
  readonly id: string;
  readonly kind: Finding["kind"];
  readonly ruleId: string;
  readonly impact: Finding["impact"];
  readonly description: string;
  readonly recommendation: string;
  readonly wcagReferences: readonly string[];
  readonly helpUrl: string | null;
  readonly affectedNodeCount: number;
  readonly review: {
    readonly status: ReviewState["status"];
    readonly note: string | null;
    readonly updatedAt: string;
  } | null;
  readonly nodes: readonly {
    readonly selector: string;
    readonly evidence: readonly ReportEvidence[];
  }[];
}

export interface ReportModel {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly tool: { readonly name: "Pink Bridge"; readonly version: string };
  readonly analysis: {
    readonly id: string;
    readonly url: string;
    readonly normalizedUrl: string;
    readonly source: Analysis["source"];
    readonly createdAt: string;
    readonly finishedAt: string | null;
    readonly durationMs: number | null;
    readonly axeVersion: string | null;
    readonly ruleSet: string;
  };
  readonly summary: AnalysisSummary | null;
  readonly findings: readonly ReportFinding[];
  readonly limitations: readonly string[];
}

/** Construye el modelo normalizado a partir de una auditoría completada y sus revisiones. */
export function buildReport(
  analysis: Analysis,
  findings: readonly Finding[],
  reviews: readonly ReviewState[],
  generatedAt: string,
): ReportModel {
  const reviewsById = new Map(reviews.map((review) => [review.findingId, review]));

  return {
    schemaVersion: 1,
    generatedAt,
    tool: { name: "Pink Bridge", version: API_VERSION },
    analysis: {
      id: analysis.id,
      url: analysis.url,
      normalizedUrl: analysis.normalizedUrl,
      source: analysis.source,
      createdAt: analysis.createdAt,
      finishedAt: analysis.finishedAt,
      durationMs: analysis.durationMs,
      axeVersion: analysis.axeVersion,
      ruleSet: `Reglas por defecto de axe-core ${analysis.axeVersion ?? "(versión desconocida)"}`,
    },
    summary: analysis.summary,
    findings: findings.map((finding) => {
      const review = reviewsById.get(finding.id);
      return {
        id: finding.id,
        kind: finding.kind,
        ruleId: finding.ruleId,
        impact: finding.impact,
        description: finding.description,
        recommendation: finding.recommendation,
        wcagReferences: finding.wcagReferences,
        helpUrl: finding.helpUrl,
        affectedNodeCount: finding.affectedNodeCount,
        review: review
          ? { status: review.status, note: review.note, updatedAt: review.updatedAt }
          : null,
        nodes: finding.nodes.map((node) => ({
          selector: node.selector,
          evidence: node.evidence.map((item) => ({
            type: item.type,
            content: item.content,
            redacted: item.redacted,
          })),
        })),
      };
    }),
    limitations: REPORT_LIMITATIONS,
  };
}

export function renderReportJson(model: ReportModel): string {
  return `${JSON.stringify(model, null, 2)}\n`;
}

/** Escapa los caracteres significativos de HTML. Todo texto del informe pasa por aquí. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function findingSection(finding: ReportFinding): string {
  const review = finding.review
    ? `<p>Estado de revisión: <strong>${escapeHtml(finding.review.status)}</strong>${
        finding.review.note ? ` — ${escapeHtml(finding.review.note)}` : ""
      }</p>`
    : "<p>Estado de revisión: pendiente</p>";
  const nodes = finding.nodes
    .map(
      (node) =>
        `<li><p>Selector: <code>${escapeHtml(node.selector)}</code></p>${node.evidence
          .map(
            (item) =>
              `<pre><code>${escapeHtml(item.content)}</code></pre>${item.redacted ? "<p>Valores sensibles redactados.</p>" : ""}`,
          )
          .join("")}</li>`,
    )
    .join("");
  const wcag =
    finding.wcagReferences.length > 0
      ? `WCAG ${finding.wcagReferences.map(escapeHtml).join(", ")}`
      : "Sin criterio WCAG asociado (buena práctica)";
  const kind = finding.kind === "automatic" ? "Incidencia automática" : "Revisión manual";

  return `<article>
  <h3>${escapeHtml(finding.ruleId)}</h3>
  <p><span class="badge">${escapeHtml(IMPACT_LABELS[finding.impact])}</span> <span class="badge">${kind}</span></p>
  <p>${escapeHtml(finding.description)}</p>
  <p>${escapeHtml(wcag)}</p>
  <p><strong>Recomendación:</strong> ${escapeHtml(finding.recommendation)}</p>
  ${review}
  <p>Elementos afectados: ${String(finding.affectedNodeCount)}</p>
  <ol>${nodes}</ol>
</article>`;
}

export function renderReportHtml(model: ReportModel): string {
  const automatic = model.findings.filter((finding) => finding.kind === "automatic");
  const review = model.findings.filter((finding) => finding.kind === "needs_review");
  const summary = model.summary;

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
  <title>Informe de accesibilidad: ${escapeHtml(model.analysis.normalizedUrl)}</title>
  <style>
    body { font-family: system-ui, sans-serif; line-height: 1.55; margin: 0 auto; max-width: 52rem; padding: 1.25rem; color: #1d1520; background: #fff; }
    h1 { font-size: 1.6rem; } h2 { font-size: 1.25rem; margin-top: 2rem; } h3 { font-size: 1.05rem; }
    article { border: 1px solid #d8cdd6; border-radius: 0.6rem; padding: 0.9rem 1rem; margin-bottom: 1rem; }
    pre { background: #f1ecf7; padding: 0.5rem; border-radius: 0.4rem; white-space: pre-wrap; word-break: break-word; }
    .badge { display: inline-block; border: 1px solid #8a7a8c; border-radius: 999px; padding: 0 0.5rem; font-size: 0.85rem; }
    dt { color: #4f4152; } dd { margin: 0 0 0.5rem; font-weight: 600; }
  </style>
</head>
<body>
<main>
  <h1>Informe de accesibilidad</h1>
  <p>Generado por ${escapeHtml(model.tool.name)} ${escapeHtml(model.tool.version)} el ${escapeHtml(model.generatedAt)}.</p>
  <dl>
    <dt>Dirección analizada</dt><dd>${escapeHtml(model.analysis.url)}</dd>
    <dt>Fecha del análisis</dt><dd>${escapeHtml(model.analysis.createdAt)}</dd>
    <dt>Duración</dt><dd>${model.analysis.durationMs === null ? "—" : String(model.analysis.durationMs)} ms</dd>
    <dt>Motor</dt><dd>${escapeHtml(model.analysis.ruleSet)}</dd>
  </dl>

  <h2>Resumen</h2>
  ${
    summary === null
      ? "<p>Sin resumen disponible.</p>"
      : `<ul>
    <li>Incidencias automáticas: ${String(summary.automaticFindings)}</li>
    <li>Elementos afectados: ${String(summary.affectedNodes)}</li>
    <li>Comprobaciones para revisión manual: ${String(summary.needsReview)} (no están aprobadas)</li>
    <li>Comprobaciones superadas por axe: ${String(summary.passedRules)}</li>
  </ul>`
  }

  <h2>Incidencias automáticas</h2>
  ${automatic.length === 0 ? "<p>No se ha detectado ninguna incidencia automática.</p>" : automatic.map(findingSection).join("\n")}

  <h2>Comprobaciones para revisión manual</h2>
  ${review.length === 0 ? "<p>No hay comprobaciones pendientes de revisión manual.</p>" : review.map(findingSection).join("\n")}

  <h2>Limitaciones de la prueba</h2>
  <ul>${model.limitations.map((text) => `<li>${escapeHtml(text)}</li>`).join("")}</ul>
</main>
</body>
</html>
`;
}
