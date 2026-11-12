import Database from "better-sqlite3";
import type { AnalysisStatus, Finding, ReviewState } from "@pink-bridge/shared";
import {
  AnalysisStoreError,
  type AnalysisPatch,
  type AnalysisRecord,
  type AnalysisStore,
  type FindingFilter,
} from "../analysis/store.js";

type Db = Database.Database;

interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

/**
 * Migraciones numeradas e inmutables: una vez publicada una versión, no se edita.
 * Los triggers aplican las invariantes también dentro de la base de datos.
 */
const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "analisis_e_incidencias",
    sql: `
      CREATE TABLE analyses (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        normalized_url TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('url', 'demo')),
        submission_token TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        duration_ms INTEGER,
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
        stage TEXT,
        axe_version TEXT,
        summary_json TEXT,
        error_code TEXT,
        error_message TEXT
      );
      CREATE INDEX analyses_status ON analyses (status);
      CREATE INDEX analyses_created ON analyses (created_at DESC);

      CREATE TABLE findings (
        id TEXT PRIMARY KEY,
        analysis_id TEXT NOT NULL REFERENCES analyses (id),
        position INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('automatic', 'needs_review')),
        rule_id TEXT NOT NULL,
        impact TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        UNIQUE (analysis_id, position)
      );
      CREATE INDEX findings_analysis ON findings (analysis_id, kind, impact, rule_id);

      CREATE TRIGGER findings_no_update BEFORE UPDATE ON findings
      BEGIN SELECT RAISE(ABORT, 'findings_immutable'); END;

      CREATE TRIGGER findings_no_delete BEFORE DELETE ON findings
      BEGIN SELECT RAISE(ABORT, 'findings_immutable'); END;

      CREATE TRIGGER analyses_identity_immutable BEFORE UPDATE OF url, normalized_url, source, submission_token, created_at ON analyses
      BEGIN SELECT RAISE(ABORT, 'analysis_identity_immutable'); END;

      CREATE TRIGGER analyses_no_delete BEFORE DELETE ON analyses
      BEGIN SELECT RAISE(ABORT, 'analyses_immutable'); END;
    `,
  },
  {
    version: 2,
    name: "estados_de_revision",
    sql: `
      CREATE TABLE review_states (
        finding_id TEXT PRIMARY KEY REFERENCES findings (id),
        status TEXT NOT NULL CHECK (status IN ('pending', 'reviewed', 'accepted', 'fixed')),
        note TEXT,
        updated_at TEXT NOT NULL
      );
    `,
  },
];

/** Aplica las migraciones pendientes. Devuelve las versiones aplicadas en esta llamada. */
export function migrate(db: Db): number[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    (db.prepare("SELECT version FROM schema_migrations").all() as { version: number }[]).map(
      (row) => row.version,
    ),
  );
  const record = db.prepare(
    "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
  );
  const appliedNow: number[] = [];

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) {
      continue;
    }
    db.transaction(() => {
      db.exec(migration.sql);
      record.run(migration.version, migration.name, new Date().toISOString());
    })();
    appliedNow.push(migration.version);
  }
  return appliedNow;
}

export function openDatabase(filename: string): Db {
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  return db;
}

interface AnalysisRow {
  id: string;
  url: string;
  normalized_url: string;
  source: "url" | "demo";
  submission_token: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  status: AnalysisStatus;
  stage: AnalysisRecord["stage"];
  axe_version: string | null;
  summary_json: string | null;
  error_code: AnalysisRecord["errorCode"];
  error_message: string | null;
}

function toRecord(row: AnalysisRow): AnalysisRecord {
  return {
    id: row.id,
    url: row.url,
    normalizedUrl: row.normalized_url,
    source: row.source,
    submissionToken: row.submission_token,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    status: row.status,
    stage: row.stage,
    axeVersion: row.axe_version,
    summary:
      row.summary_json === null
        ? null
        : (JSON.parse(row.summary_json) as AnalysisRecord["summary"]),
    errorCode: row.error_code,
    errorMessage: row.error_message,
  };
}

const PATCH_COLUMNS: Readonly<Record<keyof AnalysisPatch, string>> = {
  startedAt: "started_at",
  finishedAt: "finished_at",
  durationMs: "duration_ms",
  status: "status",
  stage: "stage",
  axeVersion: "axe_version",
  summary: "summary_json",
  errorCode: "error_code",
  errorMessage: "error_message",
};

interface ReviewRow {
  finding_id: string;
  status: ReviewState["status"];
  note: string | null;
  updated_at: string;
}

function toReview(row: ReviewRow): ReviewState {
  return {
    findingId: row.finding_id,
    status: row.status,
    note: row.note,
    updatedAt: row.updated_at,
  };
}

/** Almacén SQLite. Cumple el mismo contrato que InMemoryAnalysisStore. */
export class SqliteAnalysisStore implements AnalysisStore {
  private readonly insertAnalysisStmt: Database.Statement;
  private readonly getAnalysisStmt: Database.Statement;
  private readonly findTokenStmt: Database.Statement;
  private readonly countAnalysesStmt: Database.Statement;
  private readonly listAnalysesStmt: Database.Statement;
  private readonly countFindingsStmt: Database.Statement;
  private readonly insertFindingStmt: Database.Statement;
  private readonly getFindingStmt: Database.Statement;

  constructor(private readonly db: Db) {
    this.insertAnalysisStmt = db.prepare(`
      INSERT INTO analyses (id, url, normalized_url, source, submission_token, created_at, started_at, finished_at,
        duration_ms, status, stage, axe_version, summary_json, error_code, error_message)
      VALUES (@id, @url, @normalized_url, @source, @submission_token, @created_at, @started_at, @finished_at,
        @duration_ms, @status, @stage, @axe_version, @summary_json, @error_code, @error_message)
    `);
    this.getAnalysisStmt = db.prepare("SELECT * FROM analyses WHERE id = ?");
    this.findTokenStmt = db.prepare("SELECT * FROM analyses WHERE submission_token = ?");
    this.countAnalysesStmt = db.prepare("SELECT COUNT(*) AS total FROM analyses");
    this.listAnalysesStmt = db.prepare(
      "SELECT * FROM analyses ORDER BY created_at DESC, id LIMIT ? OFFSET ?",
    );
    this.countFindingsStmt = db.prepare(
      "SELECT COUNT(*) AS total FROM findings WHERE analysis_id = ?",
    );
    this.insertFindingStmt = db.prepare(
      "INSERT INTO findings (id, analysis_id, position, kind, rule_id, impact, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    this.getFindingStmt = db.prepare("SELECT payload_json FROM findings WHERE id = ?");
  }

  insertAnalysis(record: AnalysisRecord): Promise<void> {
    this.insertAnalysisStmt.run({
      id: record.id,
      url: record.url,
      normalized_url: record.normalizedUrl,
      source: record.source,
      submission_token: record.submissionToken,
      created_at: record.createdAt,
      started_at: record.startedAt,
      finished_at: record.finishedAt,
      duration_ms: record.durationMs,
      status: record.status,
      stage: record.stage,
      axe_version: record.axeVersion,
      summary_json: record.summary === null ? null : JSON.stringify(record.summary),
      error_code: record.errorCode,
      error_message: record.errorMessage,
    });
    return Promise.resolve();
  }

  updateAnalysis(id: string, patch: AnalysisPatch): Promise<void> {
    const entries = Object.entries(patch) as [keyof AnalysisPatch, unknown][];
    if (entries.length === 0) {
      return Promise.resolve();
    }
    const assignments = entries
      .map(([key]) => `${PATCH_COLUMNS[key]} = @${PATCH_COLUMNS[key]}`)
      .join(", ");
    const values: Record<string, unknown> = { id };
    for (const [key, value] of entries) {
      const column = PATCH_COLUMNS[key];
      values[column] =
        key === "summary" && value !== null ? JSON.stringify(value) : (value ?? null);
    }
    const result = this.db.prepare(`UPDATE analyses SET ${assignments} WHERE id = @id`).run(values);
    if (result.changes === 0) {
      return Promise.reject(new AnalysisStoreError("El análisis no existe."));
    }
    return Promise.resolve();
  }

  getAnalysis(id: string): Promise<AnalysisRecord | undefined> {
    const row = this.getAnalysisStmt.get(id) as AnalysisRow | undefined;
    return Promise.resolve(row ? toRecord(row) : undefined);
  }

  findBySubmissionToken(token: string): Promise<AnalysisRecord | undefined> {
    const row = this.findTokenStmt.get(token) as AnalysisRow | undefined;
    return Promise.resolve(row ? toRecord(row) : undefined);
  }

  listAnalyses(limit: number, offset: number): Promise<{ items: AnalysisRecord[]; total: number }> {
    const total = (this.countAnalysesStmt.get() as { total: number }).total;
    const rows = this.listAnalysesStmt.all(limit, offset) as AnalysisRow[];
    return Promise.resolve({ items: rows.map(toRecord), total });
  }

  listByStatus(statuses: readonly AnalysisStatus[]): Promise<AnalysisRecord[]> {
    if (statuses.length === 0) {
      return Promise.resolve([]);
    }
    const placeholders = statuses.map(() => "?").join(", ");
    const rows = this.db
      .prepare(`SELECT * FROM analyses WHERE status IN (${placeholders}) ORDER BY created_at`)
      .all(...statuses) as AnalysisRow[];
    return Promise.resolve(rows.map(toRecord));
  }

  insertFindings(analysisId: string, findings: readonly Finding[]): Promise<void> {
    const write = this.db.transaction((items: readonly Finding[]) => {
      const existing = (this.countFindingsStmt.get(analysisId) as { total: number }).total;
      if (existing > 0) {
        throw new AnalysisStoreError("Las incidencias de este análisis ya están guardadas.");
      }
      items.forEach((finding, position) => {
        this.insertFindingStmt.run(
          finding.id,
          analysisId,
          position,
          finding.kind,
          finding.ruleId,
          finding.impact,
          JSON.stringify(finding),
        );
      });
    });
    try {
      write(findings);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(
        error instanceof Error ? error : new AnalysisStoreError("Error de persistencia."),
      );
    }
  }

  listFindings(analysisId: string, filter: FindingFilter): Promise<Finding[]> {
    const clauses = ["analysis_id = ?"];
    const values: unknown[] = [analysisId];
    if (filter.kind !== undefined) {
      clauses.push("kind = ?");
      values.push(filter.kind);
    }
    if (filter.impact !== undefined) {
      clauses.push("impact = ?");
      values.push(filter.impact);
    }
    if (filter.ruleId !== undefined) {
      clauses.push("rule_id = ?");
      values.push(filter.ruleId);
    }
    const rows = this.db
      .prepare(`SELECT payload_json FROM findings WHERE ${clauses.join(" AND ")} ORDER BY position`)
      .all(...values) as { payload_json: string }[];
    return Promise.resolve(rows.map((row) => JSON.parse(row.payload_json) as Finding));
  }

  getFinding(findingId: string): Promise<Finding | undefined> {
    const row = this.getFindingStmt.get(findingId) as { payload_json: string } | undefined;
    return Promise.resolve(row ? (JSON.parse(row.payload_json) as Finding) : undefined);
  }

  upsertReview(review: ReviewState): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO review_states (finding_id, status, note, updated_at) VALUES (@findingId, @status, @note, @updatedAt)
         ON CONFLICT (finding_id) DO UPDATE SET status = excluded.status, note = excluded.note, updated_at = excluded.updated_at`,
      )
      .run({
        findingId: review.findingId,
        status: review.status,
        note: review.note,
        updatedAt: review.updatedAt,
      });
    return Promise.resolve();
  }

  getReview(findingId: string): Promise<ReviewState | undefined> {
    const row = this.db
      .prepare("SELECT * FROM review_states WHERE finding_id = ?")
      .get(findingId) as ReviewRow | undefined;
    return Promise.resolve(row ? toReview(row) : undefined);
  }

  listReviews(analysisId: string): Promise<ReviewState[]> {
    const rows = this.db
      .prepare(
        `SELECT r.* FROM review_states r JOIN findings f ON f.id = r.finding_id
         WHERE f.analysis_id = ? ORDER BY f.position`,
      )
      .all(analysisId) as ReviewRow[];
    return Promise.resolve(rows.map(toReview));
  }

  close(): void {
    this.db.close();
  }
}
