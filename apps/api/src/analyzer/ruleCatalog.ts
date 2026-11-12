export interface RuleExplanation {
  readonly explanation: string;
  readonly recommendation: string;
}

/**
 * Explicaciones en lenguaje claro para las reglas más habituales de axe-core.
 * Si una regla no aparece aquí, se usa el texto original de axe (`help`).
 */
export const RULE_CATALOG: Readonly<Record<string, RuleExplanation>> = {
  "image-alt": {
    explanation:
      "Una imagen no tiene texto alternativo, así que un lector de pantalla no puede describirla.",
    recommendation:
      'Añade un atributo alt descriptivo. Si la imagen es decorativa, usa alt="" o aria-hidden="true".',
  },
  "button-name": {
    explanation:
      "Un botón no tiene nombre accesible: quien usa un lector de pantalla no sabe qué hace.",
    recommendation:
      "Añade texto visible, aria-label o aria-labelledby que describa la acción del botón.",
  },
  "link-name": {
    explanation:
      "Un enlace no tiene texto accesible; su destino o función no se entiende fuera de contexto.",
    recommendation: "Escribe texto que describa el destino del enlace o usa aria-label.",
  },
  "color-contrast": {
    explanation:
      "El contraste entre el texto y el fondo es insuficiente para leerlo con comodidad.",
    recommendation:
      "Aumenta el contraste hasta al menos 4,5:1 en texto normal o 3:1 en texto grande.",
  },
  "heading-order": {
    explanation: "Los encabezados saltan niveles y la estructura del documento no es coherente.",
    recommendation:
      "Usa niveles de encabezado consecutivos (h1, h2, h3…) según la jerarquía del contenido.",
  },
  "document-title": {
    explanation: "La página no tiene un título descriptivo.",
    recommendation: "Añade un elemento title único y descriptivo en el head.",
  },
  "html-has-lang": {
    explanation:
      "El documento no declara su idioma, y los lectores de pantalla no saben qué voz usar.",
    recommendation: 'Declara el idioma en el elemento html, por ejemplo lang="es".',
  },
  "html-lang-valid": {
    explanation: "El idioma declarado en el documento no es un código válido.",
    recommendation: 'Usa un código de idioma BCP 47 válido, por ejemplo "es" o "en-GB".',
  },
  label: {
    explanation: "Un campo de formulario no tiene una etiqueta asociada.",
    recommendation: "Asocia un elemento label con for/id o envuelve el campo en el label.",
  },
  "duplicate-id": {
    explanation:
      "Hay identificadores duplicados, y las referencias por id pueden apuntar al elemento equivocado.",
    recommendation: "Haz únicos los identificadores del documento.",
  },
  "duplicate-id-aria": {
    explanation: "Un identificador duplicado rompe las relaciones ARIA que lo usan.",
    recommendation:
      "Haz único el identificador referenciado por aria-labelledby, aria-describedby u otros atributos ARIA.",
  },
  "aria-valid-attr-value": {
    explanation: "Un atributo ARIA tiene un valor no válido.",
    recommendation: "Corrige el valor del atributo ARIA según la especificación WAI-ARIA.",
  },
  "aria-required-attr": {
    explanation: "Un elemento con rol ARIA no tiene los atributos obligatorios para ese rol.",
    recommendation: "Añade los atributos ARIA obligatorios del rol o cambia el rol.",
  },
  "aria-allowed-attr": {
    explanation: "Un atributo ARIA no está permitido para el rol del elemento.",
    recommendation: "Elimina el atributo o usa un rol que lo admita.",
  },
  region: {
    explanation:
      "Parte del contenido no está dentro de ningún landmark, y los usuarios de lectores de pantalla no pueden saltar a él.",
    recommendation: "Agrupa el contenido en landmarks como main, nav, header o footer.",
  },
  "landmark-one-main": {
    explanation: "La página no tiene un landmark main principal.",
    recommendation: "Envuelve el contenido principal en un elemento main.",
  },
  bypass: {
    explanation: "La página no ofrece forma de saltar bloques repetidos de navegación.",
    recommendation: "Añade un enlace de salto al contenido principal o usa landmarks.",
  },
  "page-has-heading-one": {
    explanation: "La página no tiene un encabezado de nivel 1.",
    recommendation: "Añade un h1 que describa el contenido principal de la página.",
  },
  list: {
    explanation:
      "Una lista contiene elementos que no son de lista, y su estructura se pierde al leerla.",
    recommendation: "Usa solo elementos li dentro de ul u ol.",
  },
  listitem: {
    explanation: "Un elemento de lista no está dentro de una lista.",
    recommendation: "Coloca los elementos li dentro de ul u ol.",
  },
  "meta-viewport": {
    explanation: "El viewport bloquea el zoom del usuario.",
    recommendation:
      "Elimina user-scalable=no y maximum-scale bajo, para permitir el zoom al 200 %.",
  },
  "frame-title": {
    explanation:
      "Un iframe no tiene título, y quien usa un lector de pantalla no sabe qué contiene.",
    recommendation: "Añade un atributo title descriptivo al iframe.",
  },
  "select-name": {
    explanation: "Un desplegable no tiene nombre accesible.",
    recommendation: "Asocia una etiqueta al select con label, aria-label o aria-labelledby.",
  },
  "input-button-name": {
    explanation: "Un botón de tipo input no tiene texto accesible.",
    recommendation: "Añade el atributo value o aria-label al input de tipo botón.",
  },
  "role-img-alt": {
    explanation: 'Un elemento con role="img" no tiene texto alternativo.',
    recommendation: "Añade aria-label o aria-labelledby con una descripción del contenido.",
  },
  tabindex: {
    explanation: "Un tabindex mayor que 0 altera el orden natural de tabulación.",
    recommendation: 'Usa tabindex="0" o "-1", y mantén el orden del documento.',
  },
  "scrollable-region-focusable": {
    explanation: "Una región con scroll no puede recibir el foco de teclado.",
    recommendation:
      'Haz enfocable la región con tabindex="0" o asegúrate de que contiene elementos enfocables.',
  },
  "nested-interactive": {
    explanation: "Un control interactivo contiene otros controles interactivos.",
    recommendation: "Evita anidar controles interactivos; sepáralos en elementos hermanos.",
  },
};

export function explainRule(ruleId: string, fallbackHelp: string): RuleExplanation {
  return (
    RULE_CATALOG[ruleId] ?? {
      explanation: fallbackHelp,
      recommendation:
        "Revisa la regla en la documentación de axe-core y corrige el elemento indicado.",
    }
  );
}
