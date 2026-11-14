import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Finding } from "@pink-bridge/shared";
import { createPinkBridge } from "../app.js";
import type { AnalysisRecord } from "../analysis/store.js";
import { migrate, openDatabase, SqliteAnalysisStore } from "./sqlite.js";

let directory: string;
let databasePath: string;
let store: SqliteAnalysisStore;

function record(overrides: Partial<AnalysisRecord> = {}): AnalysisRecord {
  return {
    id: randomUUID(),
    url: "https://ejemplo.com/",
    normalizedUrl: "https://ejemplo.com/",
    source: "url",
    mode: "page",
    maxPages: null,
    submissionToken: randomUUID(),
    createdAt: "2026-11-12T10:00:00.000Z",
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    status: "queued",
    stage: null,
    axeVersion: null,
    summary: null,
    errorCode: null,
    errorMessage: null,
    ...overrides,
  };
}

function finding(analysisId: string, overrides: Partial<Finding> = {}): Finding {
  const id = `${analysisId}:automatic:${overrides.ruleId ?? "image-alt"}`;
  return {
    id,
    analysisId,
    kind: "automatic",
    ruleId: "image-alt",
    description: "Una imagen no tiene texto alternativo.",
    help: "Images must have alternative text",
    helpUrl: null,
    impact: "critical",
    wcagReferences: ["1.1.1"],
    affectedNodeCount: 1,
    recommendation: "Añade alt.",
    detectedAt: "2026-11-12T10:00:00.000Z",
    fingerprint: { strong: "a".repeat(64), loose: "b".repeat(64) },
    nodes: [
      {
        id: `${id}:0`,
        findingId: id,
        target: ["img"],
        selector: "img",
        evidence: [{ type: "html_snippet", content: "<img>", redacted: false }],
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "pink-bridge-db-"));
  databasePath = join(directory, "test.sqlite");
  store = new SqliteAnalysisStore(openDatabase(databasePath));
});

afterEach(() => {
  store.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("SqliteAnalysisStore: contrato", () => {
  it("guarda y recupera un análisis con todos sus campos", async () => {
    const original = record({ summary: null });
    await store.insertAnalysis(original);
    expect(await store.getAnalysis(original.id)).toEqual(original);
    expect(await store.findBySubmissionToken(original.submissionToken)).toEqual(original);
  });

  it("actualiza solo los campos de estado y conserva la identidad", async () => {
    const original = record();
    await store.insertAnalysis(original);
    await store.updateAnalysis(original.id, {
      status: "completed",
      stage: "completed",
      finishedAt: "2026-11-12T10:00:05.000Z",
      durationMs: 5000,
      axeVersion: "4.14.0",
      summary: {
        automaticRules: 1,
        automaticFindings: 1,
        affectedNodes: 1,
        needsReview: 0,
        passedRules: 3,
        byImpact: { critical: 1, serious: 0, moderate: 0, minor: 0, unknown: 0 },
      },
    });
    const after = await store.getAnalysis(original.id);
    expect(after?.status).toBe("completed");
    expect(after?.summary?.byImpact.critical).toBe(1);
    expect(after?.url).toBe(original.url);
    expect(after?.submissionToken).toBe(original.submissionToken);
  });

  it("rechaza actualizar un análisis inexistente", async () => {
    await expect(store.updateAnalysis(randomUUID(), { status: "failed" })).rejects.toThrow(
      "no existe",
    );
  });

  it("pagina el histórico del más reciente al más antiguo y cuenta el total", async () => {
    await store.insertAnalysis(record({ createdAt: "2026-11-12T10:00:00.000Z" }));
    await store.insertAnalysis(record({ createdAt: "2026-11-12T11:00:00.000Z" }));
    await store.insertAnalysis(record({ createdAt: "2026-11-12T12:00:00.000Z" }));

    const firstPage = await store.listAnalyses(2, 0);
    expect(firstPage.total).toBe(3);
    expect(firstPage.items.map((item) => item.createdAt)).toEqual([
      "2026-11-12T12:00:00.000Z",
      "2026-11-12T11:00:00.000Z",
    ]);
    const secondPage = await store.listAnalyses(2, 2);
    expect(secondPage.items).toHaveLength(1);
  });

  it("lista los análisis por estado, incluido el conjunto vacío", async () => {
    await store.insertAnalysis(record({ status: "queued" }));
    await store.insertAnalysis(record({ status: "completed" }));
    expect(await store.listByStatus(["queued", "running"])).toHaveLength(1);
    expect(await store.listByStatus([])).toEqual([]);
  });

  it("guarda incidencias en orden y las filtra combinando criterios", async () => {
    const analysis = record();
    await store.insertAnalysis(analysis);
    const items = [
      finding(analysis.id, { ruleId: "image-alt", impact: "critical" }),
      finding(analysis.id, { ruleId: "link-name", impact: "serious" }),
      finding(analysis.id, { ruleId: "focus-order", impact: "minor", kind: "needs_review" }),
    ];
    await store.insertFindings(analysis.id, items);

    expect((await store.listFindings(analysis.id, {})).map((f) => f.ruleId)).toEqual([
      "image-alt",
      "link-name",
      "focus-order",
    ]);
    expect((await store.listFindings(analysis.id, { kind: "automatic" })).length).toBe(2);
    expect(
      (await store.listFindings(analysis.id, { impact: "serious" })).map((f) => f.ruleId),
    ).toEqual(["link-name"]);
    expect((await store.listFindings(analysis.id, { ruleId: "focus-order" })).length).toBe(1);
    expect(await store.getFinding(items[0]?.id ?? "")).toEqual(items[0]);
    expect(await store.getFinding("no-existe")).toBeUndefined();
  });

  it("no permite guardar dos veces las incidencias de un mismo análisis", async () => {
    const analysis = record();
    await store.insertAnalysis(analysis);
    await store.insertFindings(analysis.id, [finding(analysis.id)]);
    await expect(store.insertFindings(analysis.id, [finding(analysis.id)])).rejects.toThrow(
      "ya están guardadas",
    );
  });

  it("no inserta nada si una incidencia falla a mitad (transacción atómica)", async () => {
    const analysis = record();
    await store.insertAnalysis(analysis);
    const duplicated = finding(analysis.id);
    await expect(store.insertFindings(analysis.id, [duplicated, duplicated])).rejects.toThrow();
    expect(await store.listFindings(analysis.id, {})).toEqual([]);
  });
});

describe("SqliteAnalysisStore: invariantes dentro de la base de datos", () => {
  it("impide modificar o borrar incidencias guardadas", async () => {
    const analysis = record();
    await store.insertAnalysis(analysis);
    await store.insertFindings(analysis.id, [finding(analysis.id)]);

    const db = openDatabase(databasePath);
    try {
      expect(() => db.prepare("UPDATE findings SET rule_id = 'otra'").run()).toThrow(
        "findings_immutable",
      );
      expect(() => db.prepare("DELETE FROM findings").run()).toThrow("findings_immutable");
    } finally {
      db.close();
    }
  });

  it("impide cambiar la identidad de un análisis y borrarlo", async () => {
    const analysis = record();
    await store.insertAnalysis(analysis);

    const db = openDatabase(databasePath);
    try {
      expect(() => db.prepare("UPDATE analyses SET url = 'https://otra.com/'").run()).toThrow(
        "analysis_identity_immutable",
      );
      expect(() => db.prepare("UPDATE analyses SET submission_token = 'x'").run()).toThrow(
        "analysis_identity_immutable",
      );
      expect(() => db.prepare("DELETE FROM analyses").run()).toThrow("analyses_immutable");
    } finally {
      db.close();
    }
  });

  it("rechaza estados fuera de catálogo a nivel de esquema", () => {
    const db = openDatabase(databasePath);
    try {
      expect(() =>
        db
          .prepare(
            "INSERT INTO analyses (id, url, normalized_url, source, submission_token, created_at, status) VALUES (?, 'u', 'u', 'url', ?, 'c', 'pendiente')",
          )
          .run(randomUUID(), randomUUID()),
      ).toThrow();
    } finally {
      db.close();
    }
  });
});

describe("migraciones", () => {
  it("son idempotentes: una segunda ejecución no aplica nada", () => {
    const db = openDatabase(databasePath);
    try {
      expect(migrate(db)).toEqual([]);
      const rows = db.prepare("SELECT version FROM schema_migrations").all();
      expect(rows).toHaveLength(3);
    } finally {
      db.close();
    }
  });
});

describe("persistencia tras reinicio", () => {
  it("un análisis en curso sobrevive a un reinicio y se marca como interrumpido", async () => {
    const pending = record({ status: "running" });
    await store.insertAnalysis(pending);
    store.close();

    store = new SqliteAnalysisStore(openDatabase(databasePath));
    const restarted = createPinkBridge({ store });
    await restarted.app.ready();
    try {
      expect(await restarted.service.recoverInterrupted()).toBe(1);
      const after = await restarted.service.get(pending.id);
      expect(after?.status).toBe("failed");
      expect(after?.errorCode).toBe("interrupted");
    } finally {
      await restarted.app.close();
    }
  });

  it("un análisis real del demo se conserva íntegro tras reiniciar el servidor", async () => {
    const fixture = fileURLToPath(
      new URL("../../../../tests/fixtures/demo/index.html", import.meta.url),
    );
    const first = createPinkBridge({ store, service: { demoFixturePath: fixture } });
    await first.app.ready();
    const created = await first.app.inject({
      method: "POST",
      url: "/api/analyses",
      headers: { "content-type": "application/json" },
      payload: { target: "demo", submissionToken: randomUUID() },
    });
    const id = created.json<{ id: string }>().id;
    await first.service.drain();
    const before = await first.service.get(id);
    const beforeFindings = await first.service.findings(id, {});
    await first.app.close();
    store.close();

    store = new SqliteAnalysisStore(openDatabase(databasePath));
    const second = createPinkBridge({ store });
    await second.app.ready();
    try {
      expect(await second.service.get(id)).toEqual(before);
      expect(before?.status).toBe("completed");
      expect(await second.service.findings(id, {})).toEqual(beforeFindings);
      expect(beforeFindings).toHaveLength(5);
    } finally {
      await second.app.close();
    }
  }, 120_000);
});
