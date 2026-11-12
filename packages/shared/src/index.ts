import { z } from "zod";

export * from "./analysis.js";
export * from "./api.js";

export const API_VERSION = "0.1.0";

export const healthResponseSchema = z
  .object({
    status: z.literal("ok"),
    service: z.literal("pink-bridge-api"),
    version: z.string().min(1),
  })
  .strict();

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const apiErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export type ApiError = z.infer<typeof apiErrorSchema>;

export function createApiError(code: string, message: string): ApiError {
  return { error: { code, message } };
}
