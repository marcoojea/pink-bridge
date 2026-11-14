# syntax=docker/dockerfile:1

# Etapa de compilación: instala dependencias, compila y deja solo lo de producción.
FROM node:24-bookworm-slim AS build
WORKDIR /app
# Sin repositorio git dentro de la imagen, husky no debe intentar instalar sus ganchos.
ENV HUSKY=0 npm_config_fund=false npm_config_update_notifier=false
COPY package.json package-lock.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# Imagen de la API: Node 24 + Chromium de Playwright, sin privilegios de root en ejecución.
FROM node:24-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
# Fixtures del sitio de demostración: el servidor los lee desde tests/fixtures.
COPY --from=build /app/tests/fixtures ./tests/fixtures
RUN node node_modules/playwright/cli.js install-deps chromium \
 && node node_modules/playwright/cli.js install chromium \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /app/data /ms-playwright \
 && chown -R node:node /app/data \
 && chmod -R a+rX /ms-playwright
USER node
# Dentro del contenedor la API escucha en todas las interfaces, pero el compose solo publica el puerto en 127.0.0.1.
ENV HOST=0.0.0.0 \
    PORT=3001 \
    PINK_BRIDGE_ALLOW_REMOTE=1 \
    PINK_BRIDGE_DB=/app/data/pink-bridge.sqlite \
    PINK_BRIDGE_ENABLE_DEMO=1
VOLUME ["/app/data"]
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "apps/api/dist/server.js"]

# Imagen de la web: archivos estáticos servidos por nginx, que reenvía /api a la API.
FROM nginx:1.27-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
