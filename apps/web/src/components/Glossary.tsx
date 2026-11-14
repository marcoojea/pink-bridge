const TERMS: readonly (readonly [string, string])[] = [
  [
    "Revisión",
    "Una comprobación de una página en un momento concreto. En la API se llama «análisis».",
  ],
  [
    "Problema automático",
    "Un fallo que la herramienta puede comprobar sola, como una imagen sin descripción.",
  ],
  [
    "Para revisar a mano",
    "Algo que la herramienta no puede decidir. Una persona debe mirarlo para saber si la página cumple.",
  ],
  [
    "Gravedad",
    "Cuánto impide usar la página. Crítico impide usar esa parte; grave la dificulta mucho; moderado la molesta; menor es un detalle.",
  ],
  [
    "Lector de pantalla",
    "Programa que lee la página en voz alta. Lo usan personas ciegas o con baja visión.",
  ],
  ["WCAG", "Normas internacionales de accesibilidad web. El nivel AA es el objetivo habitual."],
  [
    "Elemento",
    "Una parte concreta de la página donde se ha encontrado el problema, como un botón o una imagen.",
  ],
  [
    "Selector",
    "Ruta técnica que localiza el elemento en el código de la página. Sirve para desarrolladores.",
  ],
  ["Regla técnica", "Nombre interno de la comprobación de axe-core, por ejemplo image-alt."],
  [
    "Tamaños de pantalla",
    "Móvil (390 píxeles), tablet (768) y escritorio (1280). Cada tamaño puede mostrar problemas distintos.",
  ],
];

/** Explicación plegable de las palabras que usa la herramienta. Se abre con un clic o con Intro. */
export function Glossary() {
  return (
    <details className="glossary">
      <summary>¿Qué significan estas palabras?</summary>
      <dl>
        {TERMS.map(([term, meaning]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{meaning}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
