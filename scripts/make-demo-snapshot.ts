// Genera apps/web/public/demo/ a partir de dos auditorías reales del sitio de ejemplo del repositorio.
// Usa el mismo código que la API y el CLI: no hay datos escritos a mano. Requiere Chromium de Playwright.
// Uso: npm run docs:demo-snapshot
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { analysisSchema, listAnalysesResponseSchema, type Analysis } from "@pink-bridge/shared";
import { compareAnalyses } from "../apps/api/src/analysis/compare.js";
import { runAudit, type AuditRun } from "../apps/api/src/cli/audit.js";
import { buildAgentPrompts } from "../apps/api/src/reports/agentPrompts.js";
import { buildReport, renderReportHtml, renderReportJson } from "../apps/api/src/reports/report.js";

const OUT = resolve("apps/web/public/demo");
// La interfaz pide las incidencias en una sola página de 500: el snapshot debe caber en ella.
const FINDINGS_PAGE = 500;

const options = {
  url: "",
  demoSite: true,
  maxPages: 5,
  pauseMs: 0,
  failOnNew: false,
  minImpact: "serious" as const,
  includeReview: false,
};

function write(path: string, content: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function writeJson(path: string, value: unknown): void {
  write(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeAnalysis(run: AuditRun, now: string): void {
  const { analysis, findings } = run;
  if (findings.length > FINDINGS_PAGE) {
    throw new Error(`El snapshot supera ${String(FINDINGS_PAGE)} incidencias.`);
  }
  const folder = join(OUT, "analyses", analysis.id);
  writeJson(join(OUT, "analyses", `${analysis.id}.json`), analysis);
  writeJson(join(folder, "findings.json"), {
    items: findings,
    total: findings.length,
    limit: FINDINGS_PAGE,
    offset: 0,
  });
  writeJson(join(folder, "reviews.json"), { items: [] });

  const model = buildReport(analysis, findings, [], now);
  write(join(folder, "report.json"), renderReportJson(model));
  write(join(folder, "report.html"), renderReportHtml(model));
  write(join(folder, "agent-prompts.md"), buildAgentPrompts(analysis, findings, []));
}

async function main(): Promise<void> {
  rmSync(OUT, { recursive: true, force: true });
  const now = new Date().toISOString();

  // Dos ejecuciones seguidas del mismo sitio: la comparación muestra un estado real, sin cambios.
  const first = await runAudit(options);
  const second = await runAudit(options);
  // El historial va del más reciente al más antiguo, como en la API.
  const ordered = [second, first];

  for (const run of ordered) {
    writeAnalysis(run, now);
  }

  const analyses: Analysis[] = ordered.map((run) => analysisSchema.parse(run.analysis));
  writeJson(
    join(OUT, "analyses.json"),
    listAnalysesResponseSchema.parse({
      items: analyses,
      total: analyses.length,
      limit: 20,
      offset: 0,
    }),
  );

  // Comparación en los dos sentidos: la interfaz deja elegir cualquier orden.
  for (const base of ordered) {
    for (const target of ordered) {
      if (base === target) {
        continue;
      }
      const result = compareAnalyses(
        base.analysis,
        target.analysis,
        base.findings,
        target.findings,
      );
      const name = `${base.analysis.id}__${target.analysis.id}.json`;
      writeJson(join(OUT, "compare", name), result);
    }
  }

  console.log(`Snapshot generado en ${OUT} con ${String(ordered.length)} revisiones.`);
}

void main();
