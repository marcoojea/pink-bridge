import { z } from "zod";
import {
  fingerprintSchema,
  findingKindSchema,
  impactSchema,
  viewportNameSchema,
} from "./analysis.js";

/** Versión del formato de línea base. Cambiarla exige migrar los ficheros existentes. */
export const BASELINE_VERSION = 1;

/**
 * Incidencia guardada en una línea base. No incluye HTML, nodos ni texto de la página:
 * solo lo necesario para emparejarla en una nueva auditoría. Así el fichero puede versionarse en git.
 */
export const baselineFindingSchema = z
  .object({
    ruleId: z.string().min(1).max(100),
    kind: findingKindSchema,
    impact: impactSchema,
    pageUrl: z.string().min(1).max(2048).optional(),
    viewport: viewportNameSchema.optional(),
    affectedNodeCount: z.number().int().nonnegative(),
    fingerprint: fingerprintSchema,
  })
  .strict();
export type BaselineFinding = z.infer<typeof baselineFindingSchema>;

export const baselineSchema = z
  .object({
    version: z.literal(BASELINE_VERSION),
    url: z.string().min(1).max(2048),
    mode: z.enum(["page", "site"]),
    createdAt: z.iso.datetime(),
    axeVersion: z.string().max(40).nullable(),
    findings: z.array(baselineFindingSchema).max(20_000),
  })
  .strict();
export type Baseline = z.infer<typeof baselineSchema>;
