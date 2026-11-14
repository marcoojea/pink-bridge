# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Pink Bridge aún no tiene versiones publicadas.

## Sin publicar

### Añadido

- CLI `npm run cli -- audit` para CI: línea base versionable, `--fail-on-new` por gravedad y códigos de salida estables.
- Workflows de GitHub Actions: `a11y-demo.yml` (funcionando con el sitio de demostración) y `a11y-audit.example.yml` como plantilla.
- Recorrido de sitio con un solo navegador, dos páginas a la vez y pausa configurable entre lotes.
- Token opcional para la API (`PINK_BRIDGE_TOKEN`) y límite de creación por IP (`PINK_BRIDGE_CREATE_PER_MINUTE`).
- Paginación de incidencias en la API y tope de elementos guardados por incidencia.
- Filtros de incidencias en la dirección y borrador de la URL en la sesión.

### Cambiado

- Interfaz redactada en lenguaje llano; «análisis» pasa a «revisión» en la interfaz (la API conserva el nombre).
- Evidencias con lista permitida de atributos; el resto se sustituye por `[omitido]`.
- Los análisis en cola se reanudan tras un reinicio; los que estaban en curso siguen marcándose como interrumpidos.

### Corregido

- Casilla de recorrido de sitio centrada en la interfaz.
- Etiqueta de accesibilidad de los botones «Repetir revisión» y «Ver cómo arreglarlo».
