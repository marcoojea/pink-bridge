import { z } from "zod";
import { analysisSchema, findingSchema, impactSchema } from "./analysis.js";

export const MAX_URL_LENGTH = 2048;

export const createAnalysisRequestSchema = z
  .object({
    url: z.string().min(1).max(MAX_URL_LENGTH).optional(),
    target: z.literal("demo").optional(),
    submissionToken: z.uuid(),
  })
  .strict()
  .refine((value) => (value.url === undefined) !== (value.target === undefined), {
    message: "Indica exactamente una de estas opciones: url o target.",
  });
export type CreateAnalysisRequest = z.infer<typeof createAnalysisRequestSchema>;

export const listAnalysesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();
export type ListAnalysesQuery = z.infer<typeof listAnalysesQuerySchema>;

export const listAnalysesResponseSchema = z
  .object({
    items: z.array(analysisSchema),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  })
  .strict();
export type ListAnalysesResponse = z.infer<typeof listAnalysesResponseSchema>;

export const findingsQuerySchema = z
  .object({
    kind: z.enum(["automatic", "needs_review"]).optional(),
    impact: impactSchema.optional(),
    ruleId: z.string().min(1).max(100).optional(),
  })
  .strict();
export type FindingsQuery = z.infer<typeof findingsQuerySchema>;

export const findingsResponseSchema = z
  .object({
    items: z.array(findingSchema),
    total: z.number().int().nonnegative(),
  })
  .strict();
export type FindingsResponse = z.infer<typeof findingsResponseSchema>;

export const REVIEW_STATUSES = ["pending", "reviewed", "accepted", "fixed"] as const;
export const reviewStatusSchema = z.enum(REVIEW_STATUSES);
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;

export const updateReviewRequestSchema = z
  .object({
    status: reviewStatusSchema,
    note: z.string().max(500).optional(),
  })
  .strict();
export type UpdateReviewRequest = z.infer<typeof updateReviewRequestSchema>;

/** Estado de revisión: separado de los resultados de la auditoría, que son inmutables. */
export const reviewStateSchema = z
  .object({
    findingId: z.string().min(1),
    status: reviewStatusSchema,
    note: z.string().nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type ReviewState = z.infer<typeof reviewStateSchema>;

export const reviewsResponseSchema = z
  .object({
    items: z.array(reviewStateSchema),
  })
  .strict();
export type ReviewsResponse = z.infer<typeof reviewsResponseSchema>;

/** Hallazgos de la comparación: exacto si coincide la huella fuerte, aproximado si solo la débil. */
export const MATCH_TYPES = ["exact", "approximate"] as const;
export const matchTypeSchema = z.enum(MATCH_TYPES);
export type MatchType = z.infer<typeof matchTypeSchema>;

export const comparisonEntrySchema = z
  .object({
    ruleId: z.string().min(1),
    impact: impactSchema,
    matchType: matchTypeSchema.nullable(),
    baselineFindingId: z.string().nullable(),
    targetFindingId: z.string().nullable(),
    affectedNodeCount: z.number().int().nonnegative(),
  })
  .strict();
export type ComparisonEntry = z.infer<typeof comparisonEntrySchema>;

export const comparisonResultSchema = z
  .object({
    baselineAnalysisId: z.uuid(),
    targetAnalysisId: z.uuid(),
    normalizedUrl: z.string().min(1),
    newFindings: z.array(comparisonEntrySchema),
    resolvedFindings: z.array(comparisonEntrySchema),
    persistentFindings: z.array(comparisonEntrySchema),
    summaryDelta: z
      .object({
        automaticFindings: z.number().int(),
        affectedNodes: z.number().int(),
        // Un delta puede ser negativo (menos incidencias que antes), por eso no usa impactCountsSchema.
        byImpact: z
          .object({
            critical: z.number().int(),
            serious: z.number().int(),
            moderate: z.number().int(),
            minor: z.number().int(),
            unknown: z.number().int(),
          })
          .strict(),
      })
      .strict(),
    limitations: z.array(z.string()),
  })
  .strict();
export type ComparisonResult = z.infer<typeof comparisonResultSchema>;
