# Pink Bridge

> **EN:** Web accessibility audit and QA reporting tool. It analyzes a URL in an isolated Chromium with axe-core, separates automatic findings from checks that need manual review, stores each run, and lets you review, export and compare results. Built with TypeScript, React, Fastify and SQLite. Intended for local or internal use; see the limitations section.

Plataforma de auditoría de accesibilidad web y generación de informes QA. Analiza una URL en un navegador aislado con axe-core, separa las incidencias automáticas de las comprobaciones que requieren revisión manual, guarda cada ejecución y permite revisar, exportar y comparar.

> **Alcance actual:** una URL o un sitio acotado por `maxPages` en el mismo dominio. Sin autenticación ni cuotas: es una herramienta de uso local o interno. Ver [Limitaciones](#limitaciones-y-riesgos-residuales).

## Funcionalidades

- Validación de la URL (http/https, sin credenciales, puertos permitidos, sin tokens en la query).
- Análisis con Chromium y axe-core con progreso por etapas reales.
- Resultados con resumen, filtros combinables (tipo, gravedad, regla) y detalle con selectores y fragmentos HTML saneados.
- Estados de revisión humana (pendiente, revisada, aceptada, corregida) guardados aparte de los resultados.
- Informes descargables en JSON y HTML, generados desde el mismo modelo.
- Histórico persistente en SQLite. Repetir un análisis crea otro nuevo y no sobrescribe el anterior.
- Comparación de dos análisis completados de la misma URL: nuevas, resueltas y persistentes.
- Recorrido de sitio: hasta 10 páginas del mismo dominio, cada una en móvil (390), tablet (768) y escritorio (1280). Cada incidencia indica página y tamaño.
- Pruebas QA además de axe: errores de consola y de página, recursos con error HTTP, contenido mixto, enlaces rotos entre las páginas visitadas, y formularios probados con envío vacío y con datos de prueba (los envíos no-GET se interceptan y nunca salen a la red).
- Prompt exportable (Markdown) para Claude Code o Codex, con los fragmentos HTML delimitados como datos.
- Demostración con un fixture de defectos documentados (ver [catálogo](docs/fixture-catalog.md)); demo de sitio multipágina con `target: "demo-site"`.

## Stack

| Capa                | Tecnología                                                                         |
| ------------------- | ---------------------------------------------------------------------------------- |
| Lenguaje            | TypeScript estricto (`tsconfig.base.json`)                                         |
| Interfaz            | React 19 + Vite 8, enrutado por hash                                               |
| API                 | Node.js 24 + Fastify 5                                                             |
| Motor               | Playwright (Chromium) + axe-core 4.14                                              |
| Contrato compartido | Zod 4 (`packages/shared`)                                                          |
| Persistencia        | SQLite con better-sqlite3 y migraciones numeradas                                  |
| Tests               | Vitest, React Testing Library, Playwright Test, `@axe-core/playwright`             |
| Calidad             | ESLint 9 (typescript-eslint, react-hooks, jsx-a11y), Prettier, Husky + lint-staged |
| CI                  | GitHub Actions; Dependabot semanal                                                 |

Node se fija en `.nvmrc` (24) y en `engines`; `engine-strict` impide instalar con otra versión.

## Instalación

```bash
npm ci
npx playwright install chromium
```

## Ejecución local

En dos terminales:

```bash
PINK_BRIDGE_ENABLE_DEMO=1 npm run dev:api   # API en http://127.0.0.1:3001
npm run dev:web                             # Interfaz en http://127.0.0.1:5173 (proxy /api → 3001)
```

`PINK_BRIDGE_ENABLE_DEMO=1` habilita la demostración. Sin esa variable, `target: "demo"` responde 404.

## Variables de entorno

| Variable                        | Por defecto               | Uso                                                                                                       |
| ------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------- |
| `PORT`                          | `3001`                    | Puerto de la API                                                                                          |
| `HOST`                          | `127.0.0.1`               | Interfaz de escucha de la API                                                                             |
| `PINK_BRIDGE_DB`                | `data/pink-bridge.sqlite` | Fichero de la base de datos (carpeta `data/` ignorada por git)                                            |
| `PINK_BRIDGE_ENABLE_DEMO`       | desactivada               | Habilita el fixture de demostración                                                                       |
| `PINK_BRIDGE_ALLOW_REMOTE`      | desactivada               | Permite `HOST` distinto de loopback. Sin control de acceso delante, no usar                               |
| `PINK_BRIDGE_TOKEN`             | desactivada               | Si se define (16 caracteres o más), toda la API salvo `/api/health` exige `Authorization: Bearer <token>` |
| `PINK_BRIDGE_CREATE_PER_MINUTE` | `10`                      | Creaciones de análisis permitidas por IP y minuto; después responde `429 rate_limited`                    |

## Comandos

| Comando                    | Qué hace                                                            |
| -------------------------- | ------------------------------------------------------------------- |
| `npm run lint`             | ESLint sobre todo el repositorio                                    |
| `npm run format:check`     | Prettier en modo comprobación                                       |
| `npm run typecheck`        | `tsc` en shared, API, interfaz y configs de Playwright              |
| `npm run test:unit`        | Vitest: `@pink-bridge/shared`, lógica pura de la API y la interfaz  |
| `npm run test:integration` | Vitest con cobertura: API, motor con Chromium, proxy y persistencia |
| `npm run test:e2e`         | Playwright en escritorio y móvil, con servidores automáticos        |
| `npm run audit`            | `npm audit` con umbral `high`                                       |
| `npm run build`            | Compila shared, API (`dist/`) e interfaz (`dist/`)                  |

Umbrales de cobertura (fallan el comando si no se cumplen): líneas y sentencias 90 %, funciones 90 %, ramas 80 %.

## API

| Método y ruta                                       | Descripción                                                                                                                                                                         |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                                   | Estado del servicio                                                                                                                                                                 |
| `POST /api/analyses`                                | Crea un análisis: `url` o `target` (`"demo"` o `"demo-site"`), `submissionToken` UUID y, para recorrer el sitio, `maxPages` (1–10). `202` si es nuevo, `200` si el token ya existía |
| `GET /api/analyses?limit&offset`                    | Histórico paginado                                                                                                                                                                  |
| `GET /api/analyses/:id`                             | Estado, etapa, resumen y errores de un análisis                                                                                                                                     |
| `GET /api/analyses/:id/findings?kind&impact&ruleId` | Incidencias con filtros y paginación (`limit` 1–1000, `offset`)                                                                                                                     |
| `GET /api/analyses/:id/reviews`                     | Estados de revisión del análisis                                                                                                                                                    |
| `GET /api/analyses/:id/agent-prompts`               | Markdown con las incidencias pendientes para un agente de código (solo análisis completados)                                                                                        |
| `PATCH /api/findings/:id/review`                    | Guarda estado y nota de revisión                                                                                                                                                    |
| `GET /api/analyses/:id/report?format=json\|html`    | Informe descargable (solo análisis completados)                                                                                                                                     |
| `GET /api/analyses/compare?from&to`                 | Comparación de dos análisis completados de la misma URL                                                                                                                             |

Los errores siguen el formato `{ "error": { "code", "message" } }`. Un análisis fallido responde con su `errorCode`; nunca se presenta como ausencia de incidencias.

## Estructura

```text
apps/
  api/
    src/analyzer/      Validación de URL, guardia SSRF, proxy de salida, motor axe, normalización
    src/analysis/      Servicio, cola de un trabajo, almacén, comparación
    src/reports/       Modelo de informe y renderizados JSON y HTML
    src/persistence/   SQLite, migraciones y triggers de inmutabilidad
    src/routes/        Rutas HTTP
  web/
    src/views/         Inicio, análisis (progreso y resultados), histórico, comparación
    src/components/    Incidencias, editor de revisión, resumen, formulario de comparación
packages/
  shared/              Esquemas Zod y tipos del contrato HTTP
tests/
  e2e/                 Flujos de usuario en Chromium (escritorio y móvil)
  fixtures/            Páginas de prueba: demo con defectos y subrecursos hostiles
docs/
  fixture-catalog.md   Qué detecta axe en el fixture y qué queda para revisión manual
```

## Seguridad

- **Validación de URL:** solo http y https; sin credenciales embebidas; puertos 80 y 443; rechaza parámetros de query con nombres de token o credencial.
- **Guardia SSRF:** rangos privados, loopback, link-local, metadatos cloud y mapeos IPv4 en IPv6 bloqueados. Un host se valida resolviendo todas sus direcciones.
- **Proxy de salida:** Chromium no sale a la red directamente. Cada conexión (documento, redirección, subrecurso, túnel HTTPS) pasa por un proxy local que valida el destino y conecta a la IP validada, sin volver a resolver el nombre.
- **Aislamiento del navegador:** contexto nuevo por análisis, sin cookies ni almacenamiento, sin permisos, sin descargas, service workers bloqueados, sandbox activo.
- **Límites:** timeout de navegación, timeout total, tamaño máximo por respuesta y presupuesto de bytes por túnel.
- **Evidencias:** solo fragmentos HTML truncados; valores de campos y atributos sensibles redactados; sin HTML completo ni capturas.
- **Informes HTML:** todo texto escapado y política `default-src 'none'`.
- **Acceso opcional:** `PINK_BRIDGE_TOKEN` exige un token Bearer comparado en tiempo constante.
- **Límite de creación:** ventana fija de un minuto por IP en `POST /api/analyses`.
- **Proxy con credenciales:** cada sesión de navegador usa usuario y contraseña aleatorios; sin ellos el proxy responde 407.

## Limitaciones y riesgos residuales

- **Automatización parcial.** axe-core no detecta todo: el fixture documenta tres defectos que no detecta (ver catálogo). Las pruebas no sustituyen la navegación con teclado, los lectores de pantalla, el zoom ni el reflow, ni las pruebas con personas usuarias.
- **Estado de la página.** Solo se evalúa el DOM tras la carga. No se cubren flujos interactivos ni contenido que aparece después.
- **HTTPS tunelizado.** El proxy no puede inspeccionar el contenido de los túneles HTTPS. Los límites de tamaño de esas conexiones son un presupuesto de bytes por túnel, no por respuesta.
- **Resolución por conexión.** Cada conexión resuelve y valida el nombre en el momento y conecta a esa IP, sin volver a resolver. No hay fijación de DNS entre conexiones distintas del mismo host: cada una se valida por separado. Como defensa en profundidad, el despliegue debería limitar la salida de red del proceso de la API.
- **Comparación aproximada.** Las coincidencias aproximadas comparan regla y fragmento HTML, no selector; pueden no ser el mismo elemento. Una incidencia "resuelta" no está verificada como corregida.
- **Revisiones por análisis.** Los estados de revisión son de cada análisis: una nueva ejecución empieza con las incidencias sin revisar.
- **Acceso y cuotas.** Sin `PINK_BRIDGE_TOKEN` la API no pide autorización. El límite por IP (`PINK_BRIDGE_CREATE_PER_MINUTE`) solo cubre la creación de análisis, y la cola admite 20 pendientes (`429 queue_full`). La interfaz web no envía el token: con token activo, sirve la API tras un proxy que lo añada. No exponer en internet sin control de acceso delante. El arranque rechaza `HOST` no loopback salvo `PINK_BRIDGE_ALLOW_REMOTE=1`.
- **Proxy de salida.** Exige credenciales aleatorias de un solo uso que solo conoce el navegador de cada sesión. El guardia SSRF sigue aplicando: solo alcanza destinos públicos.
- **Tamaño de hallazgos.** Se guardan como mucho 50 elementos por incidencia; `affectedNodeCount` indica el total real. La API pagina las incidencias.
- **Evidencias.** Solo se conservan atributos de una lista permitida; el resto se sustituye por `[omitido]` y la query de las URL se oculta.
- **Recorrido de sitio.** Acotado por `maxPages` y mismo origen. Un solo Chromium sirve a todo el recorrido y se auditan 2 páginas a la vez; un sitio grande aun así tarda minutos. No sigue enlaces de otros dominios ni sitemaps.
- **Cola.** Tras un reinicio, los análisis en cola se reanudan. Los que estaban en curso se marcan como interrumpidos y no se reintentan.
- **Formularios.** Solo se prueban los 3 primeros de cada página, con datos de prueba fijos. Las peticiones no-GET se interceptan; las GET pueden navegar dentro del mismo origen.
- **Enlaces rotos.** Solo se detectan entre las páginas visitadas por el recorrido.
- **Pruebas de CI.** El workflow de GitHub Actions ha pasado en verde en GitHub en `d93d42b`; los mismos comandos se han ejecutado en local.

## Documentación

- [Catálogo del fixture de demostración](docs/fixture-catalog.md)
