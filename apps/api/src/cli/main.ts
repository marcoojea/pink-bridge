import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AnalysisInputError } from "../analyzer/urlPolicy.js";
import { buildReport, renderReportHtml, renderReportJson } from "../reports/report.js";
import { CLI_USAGE, parseCliArgs, UsageError } from "./args.js";
import { AuditFailedError, auditTarget, runAudit } from "./audit.js";
import { BaselineError, readBaseline, toBaseline, writeBaseline } from "./baseline.js";
import { assertComparable, compareWithBaseline } from "./gate.js";
import { formatAuditLines } from "./format.js";

/** Códigos de salida estables: el pipeline puede distinguir fallo de la herramienta y fallo de calidad. */
export const EXIT = {
  ok: 0,
  newFindings: 1,
  usage: 2,
  failed: 3,
} as const;

/**
 * Punto de entrada del CLI. Devuelve el código de salida en vez de terminar el proceso,
 * para poder probarlo. La salida normal va a `out`; los errores, a `err`.
 */
export async function main(
  argv: readonly string[],
  out: (line: string) => void = (line) => {
    console.log(line);
  },
  err: (line: string) => void = (line) => {
    console.error(line);
  },
): Promise<number> {
  let command: ReturnType<typeof parseCliArgs>;
  try {
    command = parseCliArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      err(error.message);
      err(CLI_USAGE);
      return EXIT.usage;
    }
    throw error;
  }
  if (command.kind === "help") {
    out(CLI_USAGE);
    return EXIT.ok;
  }

  const options = command.options;
  try {
    const baseline =
      options.baseline !== undefined ? await readBaseline(options.baseline) : undefined;

    // Se valida antes de auditar: una línea base de otra dirección no debe gastar un navegador.
    if (baseline !== undefined) {
      assertComparable(baseline, auditTarget(options));
    }
    const run = await runAudit(options);
    const comparison =
      baseline !== undefined
        ? compareWithBaseline(baseline, run.findings, {
            includeReview: options.includeReview,
            minImpact: options.minImpact,
          })
        : undefined;

    if (options.writeBaseline !== undefined) {
      await writeBaseline(
        options.writeBaseline,
        toBaseline({
          url: run.analysis.normalizedUrl,
          mode: run.mode,
          axeVersion: run.analysis.axeVersion,
          createdAt: run.analysis.createdAt,
          findings: run.findings,
        }),
      );
    }

    if (options.report !== undefined) {
      const folder = resolve(options.report);
      await mkdir(folder, { recursive: true });
      const model = buildReport(run.analysis, run.findings, [], new Date().toISOString());
      await writeFile(join(folder, "report.html"), renderReportHtml(model), "utf8");
      await writeFile(join(folder, "report.json"), renderReportJson(model), "utf8");
    }

    for (const line of formatAuditLines(run, comparison, {
      failOnNew: options.failOnNew,
      minImpact: options.minImpact,
    })) {
      out(line);
    }

    const blocking = comparison?.blocking.length ?? 0;
    return options.failOnNew && blocking > 0 ? EXIT.newFindings : EXIT.ok;
  } catch (error) {
    if (
      error instanceof UsageError ||
      error instanceof BaselineError ||
      error instanceof AnalysisInputError
    ) {
      err(error.message);
      return EXIT.usage;
    }
    if (error instanceof AuditFailedError) {
      err(`La auditoría no se pudo completar: ${error.message} (código ${error.code}).`);
      return EXIT.failed;
    }
    // Cualquier otro error es de la herramienta, nunca «sin incidencias».
    err("Error inesperado al ejecutar la auditoría.");
    return EXIT.failed;
  }
}

const isEntryPoint =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntryPoint) {
  void main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
