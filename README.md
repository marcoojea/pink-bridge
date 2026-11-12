# Pink Bridge

Plataforma de auditoría de accesibilidad web y generación de informes QA.

> **Estado: Fase 1 (base del proyecto).** Solo existen el monorepo, el contrato compartido, la API con health check y una página de estado. Todavía no hay auditorías: el análisis con Playwright y axe-core llega en fases posteriores.

## Stack

| Capa                | Tecnología                                                      |
| ------------------- | --------------------------------------------------------------- |
| Lenguaje            | TypeScript estricto (`tsconfig.base.json`)                      |
| Frontend            | React 19 + Vite 8                                               |
| Backend             | Node.js 24 + Fastify 5                                          |
| Contrato compartido | Zod 4 (`packages/shared`)                                       |
| Unit / integración  | Vitest 5, React Testing Library, jsdom                          |
| E2E y accesibilidad | Playwright Test, `@axe-core/playwright`                         |
| Calidad             | ESLint 9 (typescript-eslint, react-hooks, jsx-a11y), Prettier 3 |
| CI                  | GitHub Actions                                                  |

Node se fija en `.nvmrc` (24) y en `engines`. Usa npm con `package-lock.json`.

## Requisitos

- Node 24 (`nvm use` lee `.nvmrc`).
- npm 11 o superior.

## Instalación

```bash
npm ci
npx playwright install chromium
```

## Ejecución local

En dos terminales:

```bash
npm run dev:api   # API en http://127.0.0.1:3001
npm run dev:web   # Interfaz en http://127.0.0.1:5173 (proxy /api → 3001)
```

## Comandos

| Comando                    | Qué hace                                                     |
| -------------------------- | ------------------------------------------------------------ |
| `npm run lint`             | ESLint sobre todo el repositorio                             |
| `npm run format:check`     | Prettier en modo comprobación                                |
| `npm run typecheck`        | `tsc` en shared, api, web y configs de Playwright            |
| `npm run test:unit`        | Vitest con cobertura: `@pink-bridge/shared` y la interfaz    |
| `npm run test:integration` | Vitest con cobertura: API con `app.inject` (sin puertos)     |
| `npm run test:e2e`         | Playwright en escritorio y móvil, con servidores automáticos |
| `npm run audit`            | `npm audit` con umbral `high` (producción y desarrollo)      |
| `npm run build`            | Compila shared, API (`dist/`) e interfaz (`dist/`)           |

Los comandos que dependen de `@pink-bridge/shared` construyen antes su `dist/`.

Umbrales de cobertura (fallan el comando si no se cumplen): líneas y sentencias 90 %, funciones 90 %, ramas 80 %.

## Calidad y mantenimiento

- **Pre-commit (Husky + lint-staged):** en cada `git commit` construye shared y aplica Prettier y ESLint a los archivos en staged.
- **`engine-strict`:** `npm ci` falla si Node no es 24.
- **Dependabot:** PRs semanales de npm y GitHub Actions, agrupados en dev y runtime.
- **CI:** lint, formato, typecheck, unit con cobertura, integración con cobertura, auditoría, E2E, build.

Para producción local:

```bash
npm run build
node apps/api/dist/server.js
```

## Endpoints actuales

- `GET /api/health` → `{"status":"ok","service":"pink-bridge-api","version":"0.1.0"}`
- Rutas inexistentes → `404` con `{"error":{"code":"not_found","message":"..."}}`
- Cuerpos JSON malformados → `400` con `error.code: "bad_request"`
- Cuerpos por encima de 16 KiB → `413`
- Cabeceras: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`

## Estructura

```text
apps/
  api/        Fastify: buildApp (app.ts), arranque (server.ts), tests de integración
  web/        React + Vite: App, estado de la API, estilos, tests de componentes
packages/
  shared/     Esquemas Zod y tipos del contrato HTTP
tests/
  e2e/        Playwright: portada, teclado, axe WCAG 2.2 AA, proxy de la API
.github/workflows/ci.yml
```

## Limitaciones actuales

- No hay análisis de accesibilidad todavía.
- Sin persistencia, autenticación ni cola de trabajos.
- La API solo escucha en `127.0.0.1` por defecto.
- Los tests E2E comprueban la portada, no una auditoría.
- El workflow de CI no se ha ejecutado en GitHub Actions; solo se ha reproducido localmente con los mismos comandos.
