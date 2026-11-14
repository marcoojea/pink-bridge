import { createHash } from "node:crypto";
import {
  IMPACTS,
  type AffectedNode,
  type AnalysisSummary,
  type Evidence,
  type Finding,
  type FindingKind,
  type Impact,
  type ImpactCounts,
} from "@pink-bridge/shared";
import { explainRule } from "./ruleCatalog.js";
import { sanitizeHtmlSnippet } from "./sanitize.js";

/** Subconjunto estructural de los resultados de axe-core que el motor usa. */
export interface RawAxeNode {
  readonly target: readonly (string | readonly string[])[];
  readonly html: string;
  readonly failureSummary?: string | undefined;
}

export interface RawAxeRule {
  readonly id: string;
  readonly impact?: string | null | undefined;
  readonly description: string;
  readonly help: string;
  readonly helpUrl?: string | undefined;
  readonly tags: readonly string[];
  readonly nodes: readonly RawAxeNode[];
}

export interface RawAxeResults {
  readonly testEngine: { readonly version: string };
  readonly violations: readonly RawAxeRule[];
  readonly incomplete: readonly RawAxeRule[];
  readonly passes: readonly RawAxeRule[];
}

export interface NormalizeContext {
  readonly analysisId: string;
  readonly detectedAt: string;
  /** Página y tamaño de la pasada (modo sitio). Sin ellos, la pasada es una única página. */
  readonly pageUrl?: string;
  readonly viewport?: "mobile" | "tablet" | "desktop";
  /** Sufijo que distingue las incidencias de cada pasada (página y viewport). */
  readonly scope?: string;
}

export interface NormalizedResults {
  readonly axeVersion: string;
  readonly findings: readonly Finding[];
  readonly summary: AnalysisSummary;
}

const MAX_FAILURE_SUMMARY = 400;

/** Elementos guardados por incidencia. El total real queda en affectedNodeCount. */
export const MAX_NODES_PER_FINDING = 50;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function toImpact(value: string | null | undefined): Impact {
  return (IMPACTS as readonly string[]).includes(value ?? "") ? (value as Impact) : "unknown";
}

const IMPACT_ORDER: Readonly<Record<Impact, number>> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
  unknown: 4,
};

/** "wcag412" → "4.1.2", "wcag1412" → "1.4.12". Ignora etiquetas de nivel como "wcag2aa". */
export function wcagReferencesFromTags(tags: readonly string[]): string[] {
  return tags
    .filter((tag) => /^wcag\d{3,4}$/.test(tag))
    .map((tag) => {
      const digits = tag.slice(4);
      return `${digits.charAt(0)}.${digits.charAt(1)}.${digits.slice(2)}`;
    });
}

function targetToStrings(target: RawAxeNode["target"]): string[] {
  return target.map((part) => (Array.isArray(part) ? part.join(" ") : String(part)));
}

function buildNodes(
  rule: RawAxeRule,
  findingId: string,
): { nodes: AffectedNode[]; keys: string[] } {
  const keys: string[] = [];
  const nodes: AffectedNode[] = [];
  rule.nodes.forEach((node, index) => {
    const target = targetToStrings(node.target);
    const snippet = sanitizeHtmlSnippet(node.html);
    const snippetHash = sha256(snippet.content);
    keys.push(sha256(`${rule.id}|${target.join(">")}|${snippetHash}`));
    if (index >= MAX_NODES_PER_FINDING) {
      return;
    }

    const evidence: Evidence[] = [
      { type: "html_snippet", content: snippet.content, redacted: snippet.redacted },
    ];
    if (node.failureSummary) {
      evidence.push({
        type: "failure_summary",
        content: node.failureSummary.slice(0, MAX_FAILURE_SUMMARY),
        redacted: false,
      });
    }

    nodes.push({
      id: `${findingId}:${String(index)}`,
      findingId,
      target,
      selector: target.join(" > "),
      evidence,
    });
  });
  return { nodes, keys };
}

function buildFinding(
  rule: RawAxeRule,
  kind: FindingKind,
  context: NormalizeContext,
): Finding | null {
  if (rule.nodes.length === 0) {
    return null;
  }

  const findingId = `${context.analysisId}:${kind}:${rule.id}${context.scope ? `:${context.scope}` : ""}`;
  const { nodes, keys } = buildNodes(rule, findingId);
  const explanation = explainRule(rule.id, rule.help);
  const looseKeys = rule.nodes.map((node) => {
    const snippet = sanitizeHtmlSnippet(node.html);
    return sha256(`${rule.id}|${sha256(snippet.content)}`);
  });

  return {
    id: findingId,
    analysisId: context.analysisId,
    pageUrl: context.pageUrl,
    viewport: context.viewport,
    kind,
    ruleId: rule.id,
    description: explanation.explanation,
    help: rule.help,
    helpUrl: rule.helpUrl?.startsWith("https://") ? rule.helpUrl : null,
    impact: toImpact(rule.impact),
    wcagReferences: wcagReferencesFromTags(rule.tags),
    affectedNodeCount: rule.nodes.length,
    recommendation: explanation.recommendation,
    detectedAt: context.detectedAt,
    fingerprint: {
      strong: sha256(`${rule.id}|${[...keys].sort().join(",")}`),
      loose: sha256(`${rule.id}|${[...looseKeys].sort().join(",")}`),
    },
    nodes,
  };
}

function emptyImpactCounts(): ImpactCounts {
  return { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 };
}

/**
 * Convierte el resultado de axe en incidencias propias.
 * - `violations` → incidencias automáticas (kind "automatic").
 * - `incomplete` → comprobaciones que requieren revisión manual (kind "needs_review").
 * - `passes` solo cuenta; no se almacena detalle.
 */
export function normalizeAxeResults(
  raw: RawAxeResults,
  context: NormalizeContext,
): NormalizedResults {
  const automatic = raw.violations
    .map((rule) => buildFinding(rule, "automatic", context))
    .filter((finding): finding is Finding => finding !== null);

  const review = raw.incomplete
    .map((rule) => buildFinding(rule, "needs_review", context))
    .filter((finding): finding is Finding => finding !== null);

  const byImpact = emptyImpactCounts();
  for (const finding of automatic) {
    byImpact[finding.impact] += 1;
  }

  const sorted = [...automatic].sort(
    (a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact] || a.ruleId.localeCompare(b.ruleId),
  );

  return {
    axeVersion: raw.testEngine.version,
    findings: [...sorted, ...review],
    summary: {
      automaticRules: automatic.length,
      automaticFindings: automatic.length,
      affectedNodes: automatic.reduce((total, finding) => total + finding.affectedNodeCount, 0),
      needsReview: review.length,
      passedRules: raw.passes.length,
      byImpact,
    },
  };
}
