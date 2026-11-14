import { readFile, stat, writeFile } from "node:fs/promises";
import {
  BASELINE_VERSION,
  baselineSchema,
  type Baseline,
  type BaselineFinding,
  type Finding,
} from "@pink-bridge/shared";

/** Tope de lectura: una línea base de sitio grande cabe de sobra; más de esto es un error. */
export const MAX_BASELINE_BYTES = 5 * 1024 * 1024;

export class BaselineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BaselineError";
  }
}

export interface BaselineInput {
  readonly url: string;
  readonly mode: "page" | "site";
  readonly axeVersion: string | null;
  readonly createdAt: string;
  readonly findings: readonly Finding[];
}

function toBaselineFinding(finding: Finding): BaselineFinding {
  return {
    ruleId: finding.ruleId,
    kind: finding.kind,
    impact: finding.impact,
    affectedNodeCount: finding.affectedNodeCount,
    fingerprint: { strong: finding.fingerprint.strong, loose: finding.fingerprint.loose },
    ...(finding.pageUrl !== undefined ? { pageUrl: finding.pageUrl } : {}),
    ...(finding.viewport !== undefined ? { viewport: finding.viewport } : {}),
  };
}

/** Orden estable: el fichero versionado en git solo cambia cuando cambian las incidencias. */
function compareBaselineFindings(a: BaselineFinding, b: BaselineFinding): number {
  return (
    a.ruleId.localeCompare(b.ruleId) ||
    a.fingerprint.strong.localeCompare(b.fingerprint.strong) ||
    (a.pageUrl ?? "").localeCompare(b.pageUrl ?? "") ||
    (a.viewport ?? "").localeCompare(b.viewport ?? "") ||
    a.kind.localeCompare(b.kind)
  );
}

/** Convierte los hallazgos de una auditoría en una línea base. Sin HTML ni nodos. */
export function toBaseline(input: BaselineInput): Baseline {
  const findings = input.findings.map(toBaselineFinding).sort(compareBaselineFindings);
  return baselineSchema.parse({
    version: BASELINE_VERSION,
    url: input.url,
    mode: input.mode,
    createdAt: input.createdAt,
    axeVersion: input.axeVersion,
    findings,
  });
}

/** Escribe la línea base con formato estable y salto final, listo para versionar. */
export async function writeBaseline(path: string, baseline: Baseline): Promise<void> {
  const checked = baselineSchema.parse(baseline);
  await writeFile(path, `${JSON.stringify(checked, null, 2)}\n`, "utf8");
}

/** Lee y valida una línea base. Un fichero inválido se rechaza con un motivo, no se usa a medias. */
export async function readBaseline(path: string): Promise<Baseline> {
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    throw new BaselineError(`No se encuentra la línea base: ${path}`);
  }
  if (size > MAX_BASELINE_BYTES) {
    throw new BaselineError("La línea base supera el tamaño máximo permitido.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new BaselineError(`La línea base no es JSON válido: ${path}`);
  }

  const result = baselineSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue === undefined || issue.path.length === 0 ? "raíz" : issue.path.join(".");
    throw new BaselineError(`La línea base no es válida en «${where}».`);
  }
  return result.data;
}
