import { describe, expect, it } from "vitest";
import { MAX_SNIPPET_LENGTH, sanitizeHtmlSnippet } from "./sanitize.js";

describe("sanitizeHtmlSnippet", () => {
  it("colapsa espacios y recorta bordes", () => {
    const result = sanitizeHtmlSnippet('  <img\n   src="a.png"\t>  ');
    expect(result).toEqual({ content: '<img src="a.png" >', redacted: false });
  });

  it("redacta el valor de cualquier atributo value", () => {
    const result = sanitizeHtmlSnippet('<input type="email" value="persona@ejemplo.com">');
    expect(result.content).toBe('<input type="email" value="[redactado]">');
    expect(result.content).not.toContain("persona@ejemplo.com");
    expect(result.redacted).toBe(true);
  });

  it("redacta atributos con nombres sensibles aunque se escriban en mayúsculas", () => {
    const result = sanitizeHtmlSnippet("<input PASSWORD='hunter2' data-token=abc>");
    expect(result.content).not.toContain("hunter2");
    expect(result.content).toContain('PASSWORD="[redactado]"');
    expect(result.redacted).toBe(true);
  });

  it("no toca atributos inocuos", () => {
    const result = sanitizeHtmlSnippet('<a href="/ayuda" class="enlace">Ayuda</a>');
    expect(result).toEqual({
      content: '<a href="/ayuda" class="enlace">Ayuda</a>',
      redacted: false,
    });
  });

  it("elimina el contenido de los scripts", () => {
    const result = sanitizeHtmlSnippet("<div>ok<script>fetch('/secreto')</script></div>");
    expect(result.content).toBe("<div>ok<script>[contenido omitido]</script></div>");
    expect(result.redacted).toBe(true);
  });

  it("trunca fragmentos largos", () => {
    const long = `<p>${"x".repeat(MAX_SNIPPET_LENGTH * 2)}</p>`;
    const result = sanitizeHtmlSnippet(long);
    expect(result.content.endsWith("…")).toBe(true);
    expect(result.content.length).toBe(MAX_SNIPPET_LENGTH + 1);
  });
});

describe("sanitizeHtmlSnippet (lista permitida)", () => {
  it("sustituye por [omitido] los atributos que no están en la lista permitida", () => {
    const result = sanitizeHtmlSnippet('<div data-user="ana" class="caja">x</div>');
    expect(result.content).toBe('<div data-user="[omitido]" class="caja">x</div>');
    expect(result.redacted).toBe(true);
  });

  it("oculta el contenido de meta content", () => {
    const result = sanitizeHtmlSnippet('<meta name="author" content="Ana García">');
    expect(result.content).not.toContain("Ana");
    expect(result.redacted).toBe(true);
  });

  it("conserva la ruta de href y oculta la query", () => {
    const result = sanitizeHtmlSnippet('<a href="/reset?token=abc123">Cambiar</a>');
    expect(result.content).toBe('<a href="/reset?[omitido]">Cambiar</a>');
    expect(result.content).not.toContain("abc123");
    expect(result.redacted).toBe(true);
  });

  it("no marca como redactado un href sin query", () => {
    const result = sanitizeHtmlSnippet('<a href="/ayuda">Ayuda</a>');
    expect(result.redacted).toBe(false);
  });
});

describe("sanitizeHtmlSnippet (endurecimiento)", () => {
  it("redacta atributos con token, api key o csrf en cualquier posición del nombre", () => {
    const result = sanitizeHtmlSnippet('<input data-token="abc" x-api-key="k1" csrf-token="c2">');
    expect(result.content).not.toMatch(/abc|k1|c2/);
    expect(result.redacted).toBe(true);
  });

  it("elimina el contenido de un script sin etiqueta de cierre", () => {
    const result = sanitizeHtmlSnippet("<div>ok<script>var secreto = 1;");
    expect(result.content).not.toContain("secreto");
    expect(result.redacted).toBe(true);
  });
});
