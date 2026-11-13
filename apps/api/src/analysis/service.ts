import { randomUUID } from "node:crypto";
import type {
  Analysis,
  AnalysisErrorCode,
  AnalysisStage,
  CreateAnalysisRequest,
  Finding,
  FindingsQuery,
  ComparisonResult,
  ReviewState,
  UpdateReviewRequest,
} from "@pink-bridge/shared";
import { compareAnalyses } from "./compare.js";
import { normalizeAxeResults } from "../analyzer/normalize.js";
import { pageErrorFinding, qaFindings } from "../analyzer/qa.js";
import { runSite, type PageOutcome } from "../analyzer/site.js";
import {
  AnalysisRunError,
  DEMO_ORIGIN,
  runAnalysis,
  type RunOptions,
  type RunResult,
  type RunSource,
} from "../analyzer/runAnalysis.js";
import { normalizeTargetUrl } from "../analyzer/urlPolicy.js";
import type { AnalysisRecord, AnalysisStore, FindingFilter } from "./store.js";

export class ServiceError extends Error {
  constructor(
    readonly status: 404 | 409 | 429,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export interface AnalysisLogger {
  error(context: Record<string, unknown>, message: string): void;
}

export interface AnalysisServiceOptions {
  readonly store: AnalysisStore;
  /** Fixture de demostración. Solo se habilita en desarrollo y pruebas. */
  readonly demoFixturePath?: string | undefined;
  /** Carpeta del sitio de demostración multipágina. */
  readonly demoSiteRoot?: string | undefined;
  readonly runner?: (options: RunOptions) => Promise<RunResult>;
  readonly runLimits?: RunOptions["limits"];
  readonly allowedPorts?: readonly number[];
  readonly logger?: AnalysisLogger | undefined;
  readonly maxPending?: number;
  readonly now?: () => Date;
}

export interface CreateOutcome {
  readonly created: boolean;
  readonly analysis: Analysis;
}

/** Convierte un registro interno en la forma pública (sin token de envío). */
export function toPublicAnalysis(record: AnalysisRecord): Analysis {
  return {
    id: record.id,
    url: record.url,
    normalizedUrl: record.normalizedUrl,
    source: record.source,
    mode: record.mode ?? "page",
    maxPages: record.maxPages ?? null,
    createdAt: record.createdAt,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    durationMs: record.durationMs,
    status: record.status,
    stage: record.stage,
    axeVersion: record.axeVersion,
    summary: record.summary,
    errorCode: record.errorCode,
    errorMessage: record.errorMessage,
  };
}

const DEFAULT_MAX_PAGES = 5;

const SAFE_MESSAGES: Readonly<Record<AnalysisErrorCode, string>> = {
  invalid_url: "La URL no es válida.",
  url_too_long: "La URL supera la longitud máxima permitida.",
  unsupported_protocol: "Solo se admiten URLs http y https.",
  credentials_in_url: "La URL no puede incluir credenciales.",
  sensitive_query_parameter:
    "La URL contiene parámetros que podrían incluir credenciales o tokens.",
  blocked_destination: "El destino no está permitido.",
  dns_error: "No se pudo resolver el nombre de host.",
  navigation_timeout: "La página tardó demasiado en cargar.",
  navigation_failed: "No se pudo cargar la página.",
  certificate_error: "El certificado HTTPS de la página no es válido.",
  http_error: "La página respondió con un error HTTP.",
  non_html_content: "El recurso no es una página HTML.",
  response_too_large: "Un recurso de la página supera el tamaño máximo.",
  browser_error: "No se pudo preparar el navegador de análisis.",
  checks_error: "Las comprobaciones de accesibilidad no pudieron completarse.",
  analysis_timeout: "El análisis superó el tiempo máximo permitido.",
  interrupted: "El análisis se interrumpió al reiniciar el servidor.",
  persistence_error: "No se pudieron guardar los resultados del análisis.",
};

/**
 * Orquesta los análisis: crea registros, los encola y ejecuta un único trabajo a la vez.
 * Cada transición de estado se persiste antes de continuar.
 */
export class AnalysisService {
  private readonly store: AnalysisStore;
  private readonly demoFixturePath: string | undefined;
  private readonly demoSiteRoot: string | undefined;
  private readonly runner: (options: RunOptions) => Promise<RunResult>;
  private readonly runLimits: RunOptions["limits"];
  private readonly allowedPorts: readonly number[] | undefined;
  private readonly logger: AnalysisLogger | undefined;
  private readonly now: () => Date;
  private readonly maxPending: number;

  private readonly queue: string[] = [];
  private pumping: Promise<void> | null = null;
  private accepting = true;

  constructor(options: AnalysisServiceOptions) {
    this.store = options.store;
    this.demoFixturePath = options.demoFixturePath;
    this.demoSiteRoot = options.demoSiteRoot;
    this.runner = options.runner ?? runAnalysis;
    this.runLimits = options.runLimits;
    this.allowedPorts = options.allowedPorts;
    this.logger = options.logger;
    this.now = options.now ?? (() => new Date());
    this.maxPending = options.maxPending ?? 20;
  }

  /**
   * Crea un análisis. Si el token de envío ya existe, devuelve el análisis existente
   * (evita duplicados por reenvíos accidentales; una repetición intencionada usa otro token).
   */
  async create(request: CreateAnalysisRequest): Promise<CreateOutcome> {
    if (this.queue.length >= this.maxPending) {
      throw new ServiceError(
        429,
        "queue_full",
        "Hay demasiados análisis en cola. Inténtalo más tarde.",
      );
    }
    const existing = await this.store.findBySubmissionToken(request.submissionToken);
    if (existing) {
      return { created: false, analysis: toPublicAnalysis(existing) };
    }

    const source = this.resolveSource(request);
    const record: AnalysisRecord = {
      id: randomUUID(),
      url: source.url,
      normalizedUrl: source.normalizedUrl,
      source: source.kind,
      mode: source.mode,
      maxPages: source.maxPages,
      submissionToken: request.submissionToken,
      createdAt: this.now().toISOString(),
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      status: "queued",
      stage: null,
      axeVersion: null,
      summary: null,
      errorCode: null,
      errorMessage: null,
    };

    await this.store.insertAnalysis(record);
    this.enqueue(record.id);
    return { created: true, analysis: toPublicAnalysis(record) };
  }

  async get(id: string): Promise<Analysis | undefined> {
    const record = await this.store.getAnalysis(id);
    return record ? toPublicAnalysis(record) : undefined;
  }

  async list(limit: number, offset: number): Promise<{ items: Analysis[]; total: number }> {
    const page = await this.store.listAnalyses(limit, offset);
    return { items: page.items.map(toPublicAnalysis), total: page.total };
  }

  async findings(analysisId: string, query: FindingsQuery): Promise<Finding[] | undefined> {
    const analysis = await this.store.getAnalysis(analysisId);
    if (!analysis) {
      return undefined;
    }
    const filter: FindingFilter = {
      ...(query.kind !== undefined ? { kind: query.kind } : {}),
      ...(query.impact !== undefined ? { impact: query.impact } : {}),
      ...(query.ruleId !== undefined ? { ruleId: query.ruleId } : {}),
    };
    return this.store.listFindings(analysisId, filter);
  }

  /**
   * Guarda la revisión humana de una incidencia. El estado es independiente de la auditoría:
   * marcar "corregida" no equivale a verificar que el problema ha desaparecido.
   */
  async setReview(
    findingId: string,
    request: UpdateReviewRequest,
  ): Promise<ReviewState | undefined> {
    const finding = await this.store.getFinding(findingId);
    if (!finding) {
      return undefined;
    }
    const review: ReviewState = {
      findingId,
      status: request.status,
      note: request.note ?? null,
      updatedAt: this.now().toISOString(),
    };
    await this.store.upsertReview(review);
    return review;
  }

  /** Datos para el informe. Un análisis fallido no tiene informe: nunca se presenta como "sin incidencias". */
  async reportData(
    analysisId: string,
  ): Promise<{ analysis: Analysis; findings: Finding[]; reviews: ReviewState[] } | undefined> {
    const record = await this.store.getAnalysis(analysisId);
    if (!record) {
      return undefined;
    }
    if (record.status !== "completed") {
      throw new ServiceError(
        409,
        "report_unavailable",
        "El informe solo está disponible para análisis completados.",
      );
    }
    const findings = await this.store.listFindings(analysisId, {});
    const reviews = await this.store.listReviews(analysisId);
    return { analysis: toPublicAnalysis(record), findings, reviews };
  }

  /** Compara dos auditorías completadas de la misma URL normalizada. */
  async compare(fromId: string, toId: string): Promise<ComparisonResult | undefined> {
    const from = await this.store.getAnalysis(fromId);
    const to = await this.store.getAnalysis(toId);
    if (!from || !to) {
      return undefined;
    }
    if (from.status !== "completed" || to.status !== "completed") {
      throw new ServiceError(
        409,
        "analysis_not_completed",
        "Solo se pueden comparar análisis completados.",
      );
    }
    if (from.normalizedUrl !== to.normalizedUrl) {
      throw new ServiceError(
        409,
        "incompatible_analyses",
        "Solo se pueden comparar análisis de la misma URL.",
      );
    }
    const baselineFindings = await this.store.listFindings(fromId, {});
    const targetFindings = await this.store.listFindings(toId, {});
    return compareAnalyses(
      toPublicAnalysis(from),
      toPublicAnalysis(to),
      baselineFindings,
      targetFindings,
    );
  }

  async reviews(analysisId: string): Promise<ReviewState[] | undefined> {
    const analysis = await this.store.getAnalysis(analysisId);
    if (!analysis) {
      return undefined;
    }
    return this.store.listReviews(analysisId);
  }

  /** Marca como fallidos los análisis que quedaron en cola o en curso tras un reinicio. */
  async recoverInterrupted(): Promise<number> {
    const pending = await this.store.listByStatus(["queued", "running"]);
    const finishedAt = this.now().toISOString();
    for (const record of pending) {
      await this.store.updateAnalysis(record.id, {
        status: "failed",
        stage: null,
        finishedAt,
        errorCode: "interrupted",
        errorMessage: SAFE_MESSAGES.interrupted,
      });
    }
    return pending.length;
  }

  /** Espera a que la cola quede vacía. Útil en pruebas y para un cierre ordenado. */
  async drain(): Promise<void> {
    while (this.pumping !== null) {
      await this.pumping;
    }
  }

  /** Deja de aceptar trabajos nuevos y espera al que esté en curso. */
  async stop(): Promise<void> {
    this.accepting = false;
    this.queue.length = 0;
    await this.drain();
  }

  private resolveSource(request: CreateAnalysisRequest): {
    kind: "url" | "demo";
    mode: "page" | "site";
    maxPages: number | null;
    url: string;
    normalizedUrl: string;
    runSource: RunSource;
  } {
    if (request.target === "demo-site") {
      if (this.demoSiteRoot === undefined) {
        throw new ServiceError(
          404,
          "not_found",
          "La demostración no está disponible en este entorno.",
        );
      }
      return {
        kind: "demo",
        mode: "site",
        maxPages: request.maxPages ?? DEFAULT_MAX_PAGES,
        url: `${DEMO_ORIGIN}/`,
        normalizedUrl: `${DEMO_ORIGIN}/`,
        runSource: { kind: "demo", fixturePath: this.demoSiteRoot, siteRoot: this.demoSiteRoot },
      };
    }
    if (request.target === "demo") {
      if (this.demoFixturePath === undefined) {
        throw new ServiceError(
          404,
          "not_found",
          "La demostración no está disponible en este entorno.",
        );
      }
      return {
        kind: "demo",
        mode: "page",
        maxPages: null,
        url: `${DEMO_ORIGIN}/`,
        normalizedUrl: `${DEMO_ORIGIN}/`,
        runSource: { kind: "demo", fixturePath: this.demoFixturePath },
      };
    }

    const target = normalizeTargetUrl(request.url ?? "", this.allowedPorts);
    return {
      kind: "url",
      mode: request.maxPages !== undefined ? "site" : "page",
      maxPages: request.maxPages ?? null,
      url: target.normalized,
      normalizedUrl: target.normalized,
      runSource: { kind: "url", url: target.url },
    };
  }

  private enqueue(id: string): void {
    if (!this.accepting) {
      return;
    }
    this.queue.push(id);
    this.pumping ??= this.pump();
  }

  private async pump(): Promise<void> {
    try {
      while (this.queue.length > 0 && this.accepting) {
        const id = this.queue.shift();
        if (id !== undefined) {
          await this.execute(id);
        }
      }
    } finally {
      this.pumping = null;
    }
  }

  private async execute(id: string): Promise<void> {
    const record = await this.store.getAnalysis(id);
    if (!record) {
      return;
    }

    const startedAt = this.now();
    await this.store.updateAnalysis(id, {
      status: "running",
      startedAt: startedAt.toISOString(),
      stage: "validating",
    });

    if (record.mode === "site") {
      await this.executeSite(id, record, startedAt);
      return;
    }

    const source: RunSource =
      record.source === "demo" && this.demoFixturePath !== undefined
        ? { kind: "demo", fixturePath: this.demoFixturePath }
        : { kind: "url", url: new URL(record.normalizedUrl) };

    try {
      const result = await this.runner({
        source,
        ...(this.runLimits !== undefined ? { limits: this.runLimits } : {}),
        ...(this.allowedPorts !== undefined ? { allowedPorts: this.allowedPorts } : {}),
        onStage: (stage: AnalysisStage) => {
          this.store.updateAnalysis(id, { stage }).catch(() => undefined);
        },
      });

      await this.store.updateAnalysis(id, { stage: "processing_results" });
      const normalized = normalizeAxeResults(result.raw, {
        analysisId: id,
        detectedAt: this.now().toISOString(),
      });

      await this.store.updateAnalysis(id, { stage: "saving_report" });
      try {
        await this.store.insertFindings(id, normalized.findings);
      } catch {
        throw new AnalysisRunError("persistence_error", SAFE_MESSAGES.persistence_error);
      }

      const finishedAt = this.now();
      await this.store.updateAnalysis(id, {
        status: "completed",
        stage: "completed",
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        axeVersion: normalized.axeVersion,
        summary: normalized.summary,
        errorCode: null,
        errorMessage: null,
      });
    } catch (error) {
      await this.fail(id, startedAt, error);
    }
  }

  /** Recorre varias páginas en tres viewports y consolida incidencias, QA y resumen. */
  private async executeSite(id: string, record: AnalysisRecord, startedAt: Date): Promise<void> {
    try {
      await this.store.updateAnalysis(id, { stage: "navigating" });
      const common = {
        maxPages: record.maxPages ?? DEFAULT_MAX_PAGES,
        viewports: ["desktop", "tablet", "mobile"] as const,
        ...(this.allowedPorts !== undefined ? { allowedPorts: this.allowedPorts } : {}),
        ...(this.runLimits !== undefined ? { limits: this.runLimits } : {}),
      };
      const site =
        record.source === "demo"
          ? await runSite({ ...common, demoSiteRoot: this.demoSiteRoot ?? "" })
          : await runSite({ ...common, startUrl: record.normalizedUrl });

      await this.store.updateAnalysis(id, { stage: "processing_results" });
      const detectedAt = this.now().toISOString();
      const findings: Finding[] = [];
      let axeVersion: string | null = null;
      let passedRules = 0;

      site.pages.forEach((page: PageOutcome, index: number) => {
        const ctx = {
          analysisId: id,
          detectedAt,
          pageUrl: page.url,
          viewport: page.viewport,
          scope: `p${String(index)}:${page.viewport}`,
        };
        if (!page.ok) {
          findings.push(pageErrorFinding(ctx, page.code, page.message, page.httpStatus));
          return;
        }
        axeVersion ??= page.run.raw.testEngine.version;
        passedRules += page.run.raw.passes.length;
        findings.push(...normalizeAxeResults(page.run.raw, ctx).findings);
        findings.push(
          ...qaFindings(
            {
              observations: page.run.observations,
              forms: page.run.forms,
              brokenLinks:
                page.viewport === "desktop" ? (site.brokenLinks.get(page.url) ?? []) : [],
            },
            ctx,
          ),
        );
      });

      if (!site.pages.some((page) => page.ok)) {
        const failure = site.pages.find((page) => !page.ok);
        throw new AnalysisRunError(
          failure?.ok === false ? failure.code : "navigation_failed",
          failure?.ok === false ? failure.message : "No se pudo cargar ninguna página.",
          failure?.ok === false ? failure.httpStatus : undefined,
        );
      }

      await this.store.updateAnalysis(id, { stage: "saving_report" });
      await this.store.insertFindings(id, findings);

      const automatic = findings.filter((finding) => finding.kind === "automatic");
      const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 };
      for (const finding of automatic) {
        byImpact[finding.impact] += 1;
      }
      const finishedAt = this.now();
      await this.store.updateAnalysis(id, {
        status: "completed",
        stage: "completed",
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        axeVersion,
        summary: {
          automaticRules: new Set(automatic.map((finding) => finding.ruleId)).size,
          automaticFindings: automatic.length,
          affectedNodes: automatic.reduce((total, finding) => total + finding.affectedNodeCount, 0),
          needsReview: findings.length - automatic.length,
          passedRules,
          byImpact,
          pagesAnalyzed: site.pagesVisited,
        },
        errorCode: null,
        errorMessage: null,
      });
    } catch (error) {
      await this.fail(id, startedAt, error);
    }
  }

  private async fail(id: string, startedAt: Date, error: unknown): Promise<void> {
    const code: AnalysisErrorCode =
      error instanceof AnalysisRunError ? error.code : "browser_error";
    if (!(error instanceof AnalysisRunError)) {
      this.logger?.error({ analysisId: id, err: error }, "Fallo inesperado durante el análisis");
    }
    const finishedAt = this.now();
    await this.store.updateAnalysis(id, {
      status: "failed",
      stage: null,
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      summary: null,
      errorCode: code,
      errorMessage: SAFE_MESSAGES[code],
    });
  }
}
