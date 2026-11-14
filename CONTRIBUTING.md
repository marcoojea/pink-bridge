# Cómo contribuir

Gracias por el interés. Pink Bridge es un proyecto pequeño y cuidado: las contribuciones
pequeñas, con pruebas y con un mensaje de commit claro, son las que mejor encajan.

## Puesta en marcha

Requiere Node 24 (`.nvmrc`).

```bash
npm ci
npx playwright install chromium
```

En dos terminales:

```bash
PINK_BRIDGE_ENABLE_DEMO=1 npm run dev:api   # API en http://127.0.0.1:3001
npm run dev:web                             # Interfaz en http://127.0.0.1:5173
```

## Antes de abrir una pull request

Ejecuta estas comprobaciones. Son las mismas que corre el CI:

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
npm run build
```

Si cambias el comportamiento del CLI o de la línea base, prueba también:

```bash
npm run cli -- audit --demo-site --baseline .github/a11y/baseline-demo.json --fail-on-new
```

Los umbrales de cobertura (líneas y sentencias 90 %, funciones 90 %, ramas 80 %) fallan el
comando si no se cumplen. No bajes un umbral para que pase un cambio.

## Estilo y convenciones

- TypeScript estricto. Sin `any` ni aserciones innecesarias; el lint lo vigila.
- Mensajes de commit en formato convencional: `feat`, `fix`, `test`, `docs`, `ci`, `refactor`, `chore`.
- Un commit por cambio lógico, con su prueba.
- Textos de la interfaz y del informe en español. Los nombres técnicos del código, en inglés.
- Nada de dependencias nuevas sin una línea que justifique por qué.

## Seguridad

Los cambios en el guardia de destinos, el proxy de salida, la validación de URL o el
sandbox del navegador necesitan una prueba que demuestre el rechazo. Ver [SECURITY.md](SECURITY.md)
para reportar vulnerabilidades en privado.

## Alcance

Antes de proponer una función grande, abre una incidencia para hablarla. Las fuera de alcance
por ahora están listadas en la sección de limitaciones del README y en `docs/roadmap.md`.
