import { z } from "zod";

export const IMPACTS = ["critical", "serious", "moderate", "minor", "unknown"] as const;
export const impactSchema = z.enum(IMPACTS);
export type Impact = z.infer<typeof impactSchema>;

export const ANALYSIS_STATUSES = ["queued", "running", "completed", "failed"] as const;
export const analysisStatusSchema = z.enum(ANALYSIS_STATUSES);
export type AnalysisStatus = z.infer<typeof analysisStatusSchema>;

export const ANALYSIS_STAGES = [
  "validating",
  "preparing_browser",
  "navigating",
  "running_checks",
  "processing_results",
  "saving_report",
  "completed",
] as const;
export const analysisStageSchema = z.enum(ANALYSIS_STAGES);
export type AnalysisStage = z.infer<typeof analysisStageSchema>;

export const ANALYSIS_ERROR_CODES = [
  "invalid_url",
  "url_too_long",
  "unsupported_protocol",
  "credentials_in_url",
  "sensitive_query_parameter",
  "blocked_destination",
  "dns_error",
  "navigation_timeout",
  "navigation_failed",
  "certificate_error",
  "http_error",
  "non_html_content",
  "response_too_large",
  "browser_error",
  "checks_error",
  "analysis_timeout",
  "interrupted",
  "persistence_error",
] as const;
export const analysisErrorCodeSchema = z.enum(ANALYSIS_ERROR_CODES);
export type AnalysisErrorCode = z.infer<typeof analysisErrorCodeSchema>;

export const findingKindSchema = z.enum(["automatic", "needs_review"]);
export type FindingKind = z.infer<typeof findingKindSchema>;

export const impactCountsSchema = z
  .object({
    critical: z.number().int().nonnegative(),
    serious: z.number().int().nonnegative(),
    moderate: z.number().int().nonnegative(),
    minor: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
  })
  .strict();
export type ImpactCounts = z.infer<typeof impactCountsSchema>;

export const analysisSummarySchema = z
  .object({
    automaticRules: z.number().int().nonnegative(),
    automaticFindings: z.number().int().nonnegative(),
    affectedNodes: z.number().int().nonnegative(),
    needsReview: z.number().int().nonnegative(),
    passedRules: z.number().int().nonnegative(),
    byImpact: impactCountsSchema,
  })
  .strict();
export type AnalysisSummary = z.infer<typeof analysisSummarySchema>;

export const analysisSchema = z
  .object({
    id: z.uuid(),
    url: z.string().min(1),
    normalizedUrl: z.string().min(1),
    source: z.enum(["url", "demo"]),
    createdAt: z.iso.datetime(),
    startedAt: z.iso.datetime().nullable(),
    finishedAt: z.iso.datetime().nullable(),
    durationMs: z.number().int().nonnegative().nullable(),
    status: analysisStatusSchema,
    stage: analysisStageSchema.nullable(),
    axeVersion: z.string().nullable(),
    summary: analysisSummarySchema.nullable(),
    errorCode: analysisErrorCodeSchema.nullable(),
    errorMessage: z.string().nullable(),
  })
  .strict();
export type Analysis = z.infer<typeof analysisSchema>;

export const fingerprintSchema = z
  .object({
    strong: z.string().regex(/^[a-f0-9]{64}$/),
    loose: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type Fingerprint = z.infer<typeof fingerprintSchema>;

export const evidenceSchema = z
  .object({
    type: z.enum(["html_snippet", "failure_summary"]),
    content: z.string(),
    redacted: z.boolean(),
  })
  .strict();
export type Evidence = z.infer<typeof evidenceSchema>;

export const affectedNodeSchema = z
  .object({
    id: z.string().min(1),
    findingId: z.string().min(1),
    target: z.array(z.string()),
    selector: z.string(),
    evidence: z.array(evidenceSchema),
  })
  .strict();
export type AffectedNode = z.infer<typeof affectedNodeSchema>;

export const findingSchema = z
  .object({
    id: z.string().min(1),
    analysisId: z.uuid(),
    kind: findingKindSchema,
    ruleId: z.string().min(1),
    description: z.string(),
    help: z.string(),
    helpUrl: z.string().nullable(),
    impact: impactSchema,
    wcagReferences: z.array(z.string()),
    affectedNodeCount: z.number().int().nonnegative(),
    recommendation: z.string(),
    detectedAt: z.iso.datetime(),
    fingerprint: fingerprintSchema,
    nodes: z.array(affectedNodeSchema),
  })
  .strict();
export type Finding = z.infer<typeof findingSchema>;
