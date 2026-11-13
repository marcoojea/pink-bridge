import { createHash } from "node:crypto";
import type { Finding, FindingKind, Impact, ViewportName } from "@pink-bridge/shared";
import type { FormProbe, PageObservations } from "./probes.js";

export interface QaContext {
  readonly analysisId: string;
  readonly detectedAt: string;
  readonly pageUrl: string;
  readonly viewport: ViewportName;
  readonly scope: string;
}

export interface QaInput {
  readonly observations: PageObservations;
  readonly forms: readonly FormProbe[];
  /** Enlaces de esta página que apuntan a páginas que han respondido con error HTTP. */
  readonly brokenLinks: readonly { readonly href: string; readonly status: number }[];
}

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

function listed(items: readonly string[]): string {
  return (
    items.slice(0, 5).join(", ") + (items.length > 5 ? ` (y ${String(items.length - 5)} más)` : "")
  );
}

function make(
  ctx: QaContext,
  ruleId: string,
  kind: FindingKind,
  impact: Impact,
  description: string,
  recommendation: string,
  count: number,
  idSuffix = "",
): Finding {
  const id = `${ctx.analysisId}:${kind}:${ruleId}:${ctx.scope}${idSuffix}`;
  const key = sha256(`${ruleId}|${ctx.pageUrl}|${ctx.viewport}|${description}`);
  return {
    id,
    analysisId: ctx.analysisId,
    kind,
    pageUrl: ctx.pageUrl,
    viewport: ctx.viewport,
    ruleId,
    description,
    help: description,
    helpUrl: null,
    impact,
    wcagReferences: [],
    affectedNodeCount: count,
    recommendation,
    detectedAt: ctx.detectedAt,
    fingerprint: { strong: key, loose: sha256(`${ruleId}|${ctx.pageUrl}`) },
    nodes: [],
  };
}

/**
 * Convierte observaciones de la página en incidencias QA. Los errores de consola y los formularios sin
 * feedback son observaciones heurísticas: se marcan como revisión manual, no como incumplimientos.
 */
export function qaFindings(input: QaInput, ctx: QaContext): Finding[] {
  const findings: Finding[] = [];
  const { observations, forms, brokenLinks } = input;

  if (observations.badResponses.length > 0) {
    findings.push(
      make(
        ctx,
        "qa-resource-error",
        "automatic",
        "serious",
        `Recursos que responden con error HTTP: ${listed(observations.badResponses.map((r) => `${String(r.status)} ${r.url}`))}`,
        "Corrige o elimina los recursos rotos (imágenes, scripts, hojas de estilo).",
        observations.badResponses.length,
      ),
    );
  }

  if (observations.mixedContent.length > 0) {
    findings.push(
      make(
        ctx,
        "qa-mixed-content",
        "automatic",
        "serious",
        `La página HTTPS carga recursos por HTTP: ${listed(observations.mixedContent)}`,
        "Sirve todos los recursos por HTTPS.",
        observations.mixedContent.length,
      ),
    );
  }

  if (observations.consoleErrors.length > 0 || observations.pageErrors.length > 0) {
    const all = [...observations.pageErrors, ...observations.consoleErrors];
    findings.push(
      make(
        ctx,
        "qa-console-error",
        "needs_review",
        "moderate",
        `Errores en la consola del navegador: ${listed(all)}`,
        "Revisa si el error afecta a la página. Puede venir de un tercero.",
        all.length,
      ),
    );
  }

  if (brokenLinks.length > 0) {
    findings.push(
      make(
        ctx,
        "qa-broken-link",
        "automatic",
        "serious",
        `Enlaces a páginas con error HTTP: ${listed(brokenLinks.map((l) => `${String(l.status)} ${l.href}`))}`,
        "Corrige el destino del enlace o retíralo.",
        brokenLinks.length,
      ),
    );
  }

  for (const form of forms) {
    if (form.emptySubmit === "silent") {
      findings.push(
        make(
          ctx,
          "qa-form-no-feedback",
          "needs_review",
          "serious",
          `El formulario ${String(form.index + 1)} acepta un envío vacío sin mostrar ningún error, aunque tiene ${String(form.requiredFields)} campo(s) obligatorio(s) o campos tipados.`,
          "Valida en cliente y servidor, y muestra el error asociado al campo (aria-invalid y texto visible).",
          1,
          `:f${String(form.index)}`,
        ),
      );
    }
  }

  return findings;
}

/** Incidencia para una página o viewport que no se ha podido auditar. */
export function pageErrorFinding(
  ctx: QaContext,
  code: string,
  message: string,
  httpStatus?: number,
): Finding {
  const status = httpStatus !== undefined ? ` (HTTP ${String(httpStatus)})` : "";
  return {
    id: `${ctx.analysisId}:automatic:qa-page-unreachable:${ctx.scope}`,
    analysisId: ctx.analysisId,
    kind: "automatic",
    pageUrl: ctx.pageUrl,
    viewport: ctx.viewport,
    ruleId: "qa-page-unreachable",
    description: `La página no se pudo auditar en ${ctx.viewport} (${code}${status}): ${message}`,
    help: "La página no se pudo cargar, así que no se ha comprobado.",
    helpUrl: null,
    impact: "serious",
    wcagReferences: [],
    affectedNodeCount: 0,
    recommendation: "Revisa que la página carga en este tamaño y en este entorno.",
    detectedAt: ctx.detectedAt,
    fingerprint: {
      strong: sha256(`qa-page-unreachable|${ctx.pageUrl}|${ctx.viewport}|${code}`),
      loose: sha256(`qa-page-unreachable|${ctx.pageUrl}`),
    },
    nodes: [],
  };
}
