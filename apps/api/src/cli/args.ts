import { parseArgs } from "node:util";
import { IMPACTS, type Impact } from "@pink-bridge/shared";

/** Error de uso: la orden está mal escrita o le faltan datos. Sale con código 2. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export interface AuditCliOptions {
  /** Dirección a auditar. Vacía solo con --demo-site. */
  readonly url: string;
  /** Línea base que se lee para comparar. */
  readonly baseline?: string;
  /** Línea base que se escribe con el resultado actual (p. ej. para regenerarla en una rama). */
  readonly writeBaseline?: string;
  /** Sale con código 1 si aparecen nuevas incidencias por encima del umbral. */
  readonly failOnNew: boolean;
  readonly minImpact: Impact;
  /** Incluye las comprobaciones de revisión manual en la comparación. */
  readonly includeReview: boolean;
  /** Carpeta donde se escriben report.html y report.json. */
  readonly report?: string;
  /** 1 audita una página; más de 1, recorre el mismo sitio (hasta 10). */
  readonly maxPages: number;
  /** Pausa entre lotes de páginas. Limita la tasa de peticiones al sitio auditado. */
  readonly pauseMs: number;
  /** Audita el sitio de demostración incluido en el repositorio, sin red. */
  readonly demoSite: boolean;
}

export type ParsedCommand =
  { readonly kind: "help" } | { readonly kind: "audit"; readonly options: AuditCliOptions };

export const CLI_USAGE = `Uso:
  npm run cli -- audit <url> [opciones]
  npm run cli -- audit --demo-site [opciones]

Opciones:
  --baseline <archivo.json>       Compara con esta línea base.
  --write-baseline <archivo.json> Guarda el resultado como nueva línea base.
  --fail-on-new                   Sale con código 1 si hay nuevas incidencias.
  --min-impact <gravedad>         critical | serious | moderate | minor (por defecto: serious).
  --include-review                Incluye las comprobaciones de revisión manual.
  --report <carpeta>              Escribe report.html y report.json en la carpeta.
  --max-pages <1-10>              Páginas del mismo sitio a revisar (por defecto: 1).
  --pause-ms <0-10000>            Pausa entre páginas en milisegundos (por defecto: 500).
  --demo-site                     Audita el sitio de demostración, sin red.
  -h, --help                      Muestra esta ayuda.

Códigos de salida: 0 correcto, 1 nuevas incidencias con --fail-on-new,
2 uso o línea base no válida, 3 la auditoría no se pudo completar.`;

const DEFAULT_PAUSE_MS = 500;
const DEMO_SITE_PAGES = 5;
const MAX_PAGES = 10;
const MAX_PAUSE_MS = 10_000;

function integerOption(
  value: string | undefined,
  name: string,
  min: number,
  max: number,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new UsageError(`${name} debe ser un entero entre ${String(min)} y ${String(max)}.`);
  }
  return number;
}

function impactOption(value: string | undefined): Impact {
  if (value === undefined) {
    return "serious";
  }
  if (!(IMPACTS as readonly string[]).includes(value)) {
    throw new UsageError(`--min-impact debe ser uno de: ${IMPACTS.join(", ")}.`);
  }
  return value as Impact;
}

/** Interpreta la línea de órdenes. Nunca lee el entorno: todo lo que cambia el comportamiento va explícito. */
export function parseCliArgs(argv: readonly string[]): ParsedCommand {
  let parsed;
  try {
    parsed = parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : "Opciones no válidas.");
  }
  const { values, positionals } = parsed;

  if (values.help === true || positionals.length === 0) {
    if (values.help === true) {
      return { kind: "help" };
    }
    throw new UsageError("Falta el comando. Usa «audit».");
  }
  const [command, url, ...extra] = positionals;
  if (command !== "audit") {
    throw new UsageError(`Comando desconocido: ${command ?? ""}. El único comando es «audit».`);
  }
  if (extra.length > 0) {
    throw new UsageError("Demasiados argumentos posicionales.");
  }

  const demoSite = values["demo-site"] === true;
  if (!demoSite && (url === undefined || url.length === 0)) {
    throw new UsageError("Falta la dirección a auditar.");
  }
  if (demoSite && url !== undefined) {
    throw new UsageError("Con --demo-site no se indica dirección.");
  }

  const maxPages = integerOption(
    values["max-pages"],
    "--max-pages",
    1,
    MAX_PAGES,
    demoSite ? DEMO_SITE_PAGES : 1,
  );
  const pauseMs = integerOption(
    values["pause-ms"],
    "--pause-ms",
    0,
    MAX_PAUSE_MS,
    DEFAULT_PAUSE_MS,
  );
  const minImpact = impactOption(values["min-impact"]);

  if (values["fail-on-new"] === true && values.baseline === undefined) {
    throw new UsageError("--fail-on-new necesita una línea base con --baseline.");
  }

  return {
    kind: "audit",
    options: {
      url: url ?? "",
      ...(values.baseline !== undefined ? { baseline: values.baseline } : {}),
      ...(values["write-baseline"] !== undefined
        ? { writeBaseline: values["write-baseline"] }
        : {}),
      failOnNew: values["fail-on-new"] === true,
      minImpact,
      includeReview: values["include-review"] === true,
      ...(values.report !== undefined ? { report: values.report } : {}),
      maxPages,
      pauseMs,
      demoSite,
    },
  };
}

const OPTIONS = {
  baseline: { type: "string" },
  "write-baseline": { type: "string" },
  "fail-on-new": { type: "boolean" },
  "min-impact": { type: "string" },
  "include-review": { type: "boolean" },
  report: { type: "string" },
  "max-pages": { type: "string" },
  "pause-ms": { type: "string" },
  "demo-site": { type: "boolean" },
  help: { type: "boolean", short: "h" },
} as const;
