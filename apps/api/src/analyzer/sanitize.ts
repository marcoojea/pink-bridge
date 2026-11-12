export const MAX_SNIPPET_LENGTH = 400;

const SENSITIVE_ATTRIBUTE =
  /(^|[-_:])(value|password|passwd|token|secret|api[-_]?key|auth|authorization|cookie|session|csrf)/i;

export interface SanitizedSnippet {
  readonly content: string;
  readonly redacted: boolean;
}

/**
 * Prepara un fragmento HTML para persistir y mostrar.
 * Nunca guarda el HTML completo: colapsa espacios, elimina el contenido de scripts,
 * redacta valores de atributos sensibles (incluido `value` de cualquier campo) y trunca.
 */
export function sanitizeHtmlSnippet(raw: string): SanitizedSnippet {
  let redacted = false;

  let content = raw.replace(/\s+/g, " ").trim();

  content = content.replace(/<script\b[^>]*>[\s\S]*?(?:<\/script\s*>|$)/gi, () => {
    redacted = true;
    return "<script>[contenido omitido]</script>";
  });

  content = content.replace(
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/g,
    (match, name: string) => {
      if (SENSITIVE_ATTRIBUTE.test(name)) {
        redacted = true;
        return `${name}="[redactado]"`;
      }
      return match;
    },
  );

  if (content.length > MAX_SNIPPET_LENGTH) {
    content = `${content.slice(0, MAX_SNIPPET_LENGTH)}…`;
  }

  return { content, redacted };
}
