export const MAX_SNIPPET_LENGTH = 400;

const SENSITIVE_ATTRIBUTE =
  /(^|[-_:])(value|password|passwd|token|secret|api[-_]?key|auth|authorization|cookie|session|csrf)/i;

/**
 * Atributos cuyo valor sirve para entender el defecto sin revelar datos del usuario.
 * Todo lo demás (data-*, meta content, valores de campos…) se sustituye por "[omitido]".
 */
const ALLOWED_ATTRIBUTES: ReadonlySet<string> = new Set([
  "id",
  "class",
  "name",
  "type",
  "role",
  "lang",
  "dir",
  "for",
  "alt",
  "title",
  "placeholder",
  "tabindex",
  "scope",
  "headers",
  "colspan",
  "rowspan",
  "width",
  "height",
  "href",
  "src",
  "rel",
  "target",
  "hreflang",
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  "aria-hidden",
  "aria-expanded",
  "aria-controls",
  "aria-live",
  "aria-current",
  "aria-required",
  "aria-invalid",
  "aria-disabled",
  "aria-haspopup",
  "aria-checked",
  "aria-selected",
  "aria-pressed",
  "aria-level",
  "aria-orientation",
  "aria-modal",
  "aria-owns",
]);

/** Atributos con URL: se conserva la ruta y se oculta la query, que puede llevar tokens. */
const URL_ATTRIBUTES: ReadonlySet<string> = new Set(["href", "src"]);

export interface SanitizedSnippet {
  readonly content: string;
  readonly redacted: boolean;
}

function unquote(value: string): string {
  return /^["']/.test(value) ? value.slice(1, -1) : value;
}

/**
 * Prepara un fragmento HTML para persistir y mostrar.
 * Nunca guarda el HTML completo: colapsa espacios, elimina el contenido de scripts, conserva
 * solo los atributos de la lista permitida, redacta los sensibles, oculta la query de las URL y trunca.
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
    (match, name: string, rawValue: string) => {
      const lower = name.toLowerCase();
      if (SENSITIVE_ATTRIBUTE.test(name)) {
        redacted = true;
        return `${name}="[redactado]"`;
      }
      if (!ALLOWED_ATTRIBUTES.has(lower)) {
        redacted = true;
        return `${name}="[omitido]"`;
      }
      if (URL_ATTRIBUTES.has(lower)) {
        const value = unquote(rawValue);
        const queryAt = value.indexOf("?");
        if (queryAt !== -1) {
          redacted = true;
          return `${name}="${value.slice(0, queryAt)}?[omitido]"`;
        }
      }
      return match;
    },
  );

  if (content.length > MAX_SNIPPET_LENGTH) {
    content = `${content.slice(0, MAX_SNIPPET_LENGTH)}…`;
  }

  return { content, redacted };
}
