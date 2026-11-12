import type {
  AnalysisErrorCode,
  AnalysisStage,
  AnalysisStatus,
  AnalysisSummary,
  Finding,
  ReviewState,
} from "@pink-bridge/shared";

export interface AnalysisRecord {
  readonly id: string;
  readonly url: string;
  readonly normalizedUrl: string;
  readonly source: "url" | "demo";
  readonly submissionToken: string;
  readonly createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  status: AnalysisStatus;
  stage: AnalysisStage | null;
  axeVersion: string | null;
  summary: AnalysisSummary | null;
  errorCode: AnalysisErrorCode | null;
  errorMessage: string | null;
}

export type AnalysisPatch = Partial<
  Pick<
    AnalysisRecord,
    | "startedAt"
    | "finishedAt"
    | "durationMs"
    | "status"
    | "stage"
    | "axeVersion"
    | "summary"
    | "errorCode"
    | "errorMessage"
  >
>;

export interface FindingFilter {
  readonly kind?: Finding["kind"];
  readonly impact?: Finding["impact"];
  readonly ruleId?: string;
}

/**
 * Contrato de persistencia del análisis. La implementación en memoria se usa en Fase 4;
 * la SQLite de Fase 6 debe cumplir el mismo contrato.
 *
 * Invariantes:
 * - Un análisis se crea una vez; sus campos inmutables (url, token, fecha de creación) no cambian.
 * - Las incidencias de un análisis se insertan una sola vez y después no se modifican.
 */
export interface AnalysisStore {
  insertAnalysis(record: AnalysisRecord): Promise<void>;
  updateAnalysis(id: string, patch: AnalysisPatch): Promise<void>;
  getAnalysis(id: string): Promise<AnalysisRecord | undefined>;
  findBySubmissionToken(token: string): Promise<AnalysisRecord | undefined>;
  listAnalyses(limit: number, offset: number): Promise<{ items: AnalysisRecord[]; total: number }>;
  listByStatus(statuses: readonly AnalysisStatus[]): Promise<AnalysisRecord[]>;
  insertFindings(analysisId: string, findings: readonly Finding[]): Promise<void>;
  listFindings(analysisId: string, filter: FindingFilter): Promise<Finding[]>;
  getFinding(findingId: string): Promise<Finding | undefined>;
  /** Crea o reemplaza el estado de revisión. Nunca modifica las incidencias de la auditoría. */
  upsertReview(review: ReviewState): Promise<void>;
  getReview(findingId: string): Promise<ReviewState | undefined>;
  listReviews(analysisId: string): Promise<ReviewState[]>;
}

export class AnalysisStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisStoreError";
  }
}

function matches(finding: Finding, filter: FindingFilter): boolean {
  if (filter.kind !== undefined && finding.kind !== filter.kind) {
    return false;
  }
  if (filter.impact !== undefined && finding.impact !== filter.impact) {
    return false;
  }
  if (filter.ruleId !== undefined && finding.ruleId !== filter.ruleId) {
    return false;
  }
  return true;
}

/** Implementación en memoria. Copia cada valor al entrar y al salir para proteger la inmutabilidad. */
export class InMemoryAnalysisStore implements AnalysisStore {
  private readonly analyses = new Map<string, AnalysisRecord>();
  private readonly findingsByAnalysis = new Map<string, Finding[]>();
  private readonly reviews = new Map<string, ReviewState>();

  insertAnalysis(record: AnalysisRecord): Promise<void> {
    if (this.analyses.has(record.id)) {
      return Promise.reject(new AnalysisStoreError("El análisis ya existe."));
    }
    this.analyses.set(record.id, structuredClone(record));
    return Promise.resolve();
  }

  updateAnalysis(id: string, patch: AnalysisPatch): Promise<void> {
    const current = this.analyses.get(id);
    if (!current) {
      return Promise.reject(new AnalysisStoreError("El análisis no existe."));
    }
    Object.assign(current, structuredClone(patch));
    return Promise.resolve();
  }

  getAnalysis(id: string): Promise<AnalysisRecord | undefined> {
    const record = this.analyses.get(id);
    return Promise.resolve(record ? structuredClone(record) : undefined);
  }

  findBySubmissionToken(token: string): Promise<AnalysisRecord | undefined> {
    const record = [...this.analyses.values()].find((item) => item.submissionToken === token);
    return Promise.resolve(record ? structuredClone(record) : undefined);
  }

  listAnalyses(limit: number, offset: number): Promise<{ items: AnalysisRecord[]; total: number }> {
    const ordered = [...this.analyses.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    return Promise.resolve({
      items: ordered.slice(offset, offset + limit).map((item) => structuredClone(item)),
      total: ordered.length,
    });
  }

  listByStatus(statuses: readonly AnalysisStatus[]): Promise<AnalysisRecord[]> {
    return Promise.resolve(
      [...this.analyses.values()]
        .filter((item) => statuses.includes(item.status))
        .map((item) => structuredClone(item)),
    );
  }

  insertFindings(analysisId: string, findings: readonly Finding[]): Promise<void> {
    if (this.findingsByAnalysis.has(analysisId)) {
      return Promise.reject(
        new AnalysisStoreError("Las incidencias de este análisis ya están guardadas."),
      );
    }
    this.findingsByAnalysis.set(analysisId, structuredClone([...findings]));
    return Promise.resolve();
  }

  listFindings(analysisId: string, filter: FindingFilter): Promise<Finding[]> {
    const findings = this.findingsByAnalysis.get(analysisId) ?? [];
    return Promise.resolve(
      findings
        .filter((finding) => matches(finding, filter))
        .map((finding) => structuredClone(finding)),
    );
  }

  upsertReview(review: ReviewState): Promise<void> {
    this.reviews.set(review.findingId, structuredClone(review));
    return Promise.resolve();
  }

  getReview(findingId: string): Promise<ReviewState | undefined> {
    const review = this.reviews.get(findingId);
    return Promise.resolve(review ? structuredClone(review) : undefined);
  }

  listReviews(analysisId: string): Promise<ReviewState[]> {
    const ids = new Set(
      (this.findingsByAnalysis.get(analysisId) ?? []).map((finding) => finding.id),
    );
    return Promise.resolve(
      [...this.reviews.values()]
        .filter((review) => ids.has(review.findingId))
        .map((review) => structuredClone(review)),
    );
  }

  getFinding(findingId: string): Promise<Finding | undefined> {
    for (const findings of this.findingsByAnalysis.values()) {
      const found = findings.find((finding) => finding.id === findingId);
      if (found) {
        return Promise.resolve(structuredClone(found));
      }
    }
    return Promise.resolve(undefined);
  }
}
