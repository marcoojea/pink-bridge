import { MAX_URL_LENGTH, type AnalysisErrorCode } from "@pink-bridge/shared";

export class AnalysisInputError extends Error {
  constructor(
    readonly code: AnalysisErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AnalysisInputError";
  }
}

export const DEFAULT_ALLOWED_PORTS: readonly number[] = [80, 443];

const LOCAL_HOSTNAME_SUFFIXES = [".localhost", ".local", ".localdomain", ".internal"];

const SENSITIVE_QUERY_PARAMETER =
  /^(token|access_token|id_token|refresh_token|api[_-]?key|key|secret|password|passwd|pwd|auth|session|sid|signature|sig)$/i;

/** Espacios y caracteres de control (C0, DEL) no pueden aparecer en una URL introducida por el usuario. */
function hasWhitespaceOrControl(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f || /\s/.test(char)) {
      return true;
    }
  }
  return false;
}

export interface NormalizedTarget {
  readonly url: URL;
  readonly normalized: string;
}

export function normalizeTargetUrl(
  rawInput: string,
  allowedPorts: readonly number[] = DEFAULT_ALLOWED_PORTS,
): NormalizedTarget {
  const raw = rawInput.trim();

  if (raw.length === 0) {
    throw new AnalysisInputError("invalid_url", "Introduce una URL.");
  }
  if (raw.length > MAX_URL_LENGTH) {
    throw new AnalysisInputError("url_too_long", "La URL supera la longitud máxima permitida.");
  }
  if (hasWhitespaceOrControl(raw)) {
    throw new AnalysisInputError(
      "invalid_url",
      "La URL contiene espacios o caracteres de control.",
    );
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AnalysisInputError("invalid_url", "La URL no es válida.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AnalysisInputError("unsupported_protocol", "Solo se admiten URLs http y https.");
  }
  if (url.username !== "" || url.password !== "") {
    throw new AnalysisInputError("credentials_in_url", "La URL no puede incluir credenciales.");
  }

  const hostname = url.hostname.replace(/\.$/, "").toLowerCase();
  if (hostname === "" || hostname === "localhost") {
    throw new AnalysisInputError("blocked_destination", "El destino no está permitido.");
  }
  if (LOCAL_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw new AnalysisInputError("blocked_destination", "El destino no está permitido.");
  }

  const port = url.port === "" ? (url.protocol === "https:" ? 443 : 80) : Number(url.port);
  if (!allowedPorts.includes(port)) {
    throw new AnalysisInputError("invalid_url", "El puerto de la URL no está permitido.");
  }

  for (const key of url.searchParams.keys()) {
    if (SENSITIVE_QUERY_PARAMETER.test(key)) {
      throw new AnalysisInputError(
        "sensitive_query_parameter",
        "La URL contiene parámetros que podrían incluir credenciales o tokens.",
      );
    }
  }

  url.hash = "";
  return { url, normalized: url.toString() };
}
