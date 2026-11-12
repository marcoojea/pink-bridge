# Catálogo del fixture de demostración

Fixture: `tests/fixtures/demo/index.html`. Página intencionadamente defectuosa, usada solo para probar el motor y la interfaz. No forma parte de la aplicación.

Resultados medidos con **axe-core 4.14.0** y Chromium (Playwright 1.65), sin ajustes manuales. Si cambia el fixture o la versión de axe, hay que volver a medir.

## Detectados automáticamente por axe

| ID       | Defecto                                             | Regla axe        | Impacto  | WCAG                               |
| -------- | --------------------------------------------------- | ---------------- | -------- | ---------------------------------- |
| DEMO-001 | Imagen sin `alt`                                    | `image-alt`      | critical | 1.1.1                              |
| DEMO-002 | Botón sin nombre accesible (solo SVG `aria-hidden`) | `button-name`    | critical | 4.1.2                              |
| DEMO-004 | Contraste insuficiente (`#9aa0a6` sobre `#ffffff`)  | `color-contrast` | serious  | 1.4.3                              |
| DEMO-005 | Encabezados saltados (`h1` → `h4`)                  | `heading-order`  | moderate | sin criterio WCAG (buena práctica) |
| DEMO-006 | Enlace vacío                                        | `link-name`      | serious  | 2.4.4, 4.1.2                       |

## No detectados por axe (falsos negativos conocidos)

| ID       | Defecto                                                             | Motivo                                                                 | Cómo se revisa                                                |
| -------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| DEMO-003 | Campo sin `label` asociado, solo `placeholder`                      | axe acepta `placeholder` como nombre accesible                         | Revisión manual del nombre accesible (árbol de accesibilidad) |
| DEMO-007 | Error de validación solo en color, sin asociación ni `aria-invalid` | Requiere evaluar el comportamiento del formulario                      | Revisión manual con lector de pantalla y prueba de envío      |
| DEMO-008 | `div` con `onclick` no enfocable ni accionable con teclado          | axe no detecta la falta de interacción por teclado en un `div` sin rol | Revisión manual con Tab / Enter / Espacio                     |

## Revisión manual adicional

El fixture incluye un párrafo de recordatorio. Estas comprobaciones no pueden automatizarse con fiabilidad en el MVP:

- Orden de tabulación y foco visible.
- Reflow y zoom al 200 %.
- Lectura con lector de pantalla.

## Reglas de uso

- El motor debe detectar las 5 incidencias automáticas. Si una desaparece, es una regresión del motor o de axe, y debe investigarse antes de aceptarla.
- Las incidencias de la tabla "No detectados" nunca se presentan como superadas. La aplicación las mostrará como revisión manual, no como aprobadas.
- Los IDs `DEMO-###` son estables y se usan en tests y en esta documentación.
