# Roadmap: ideas para implementar

Ideas anotadas para futuras fases. No están implementadas.

## 1. Exportar el informe a agentes de código (Claude Code y Codex)

Objetivo: que cada incidencia del informe pueda pasarse a un agente para corregirla.

- Entrada: el informe JSON existente (`GET /api/analyses/:id/report?format=json`).
- Por incidencia: prompt con regla, descripción, selectores, fragmento HTML saneado y recomendación.
- Salida esperada del agente: cambio en el repositorio del usuario, en rama propia.
- Verificación: volver a analizar la URL tras el cambio y comparar (`/api/analyses/compare`). Solo se marca "corregida" si la incidencia desaparece en el nuevo análisis.
- Riesgos a cubrir antes de implementar:
  - El fragmento HTML es contenido de una web externa: tratarlo como dato, nunca como instrucción para el agente.
  - Los agentes ejecutan comandos: sin acceso a red ni secretos del usuario más allá del repositorio.
  - Revisión humana del diff antes de fusionar.

## 2. Recorrido completo del sitio

Objetivo: auditar todo el sitio, no solo una URL, incluyendo formularios y varios tamaños de pantalla.

- Descubrimiento: enlaces internos desde la portada y `sitemap.xml`, con límite de páginas y profundidad.
- Tamaños: móvil, tablet y escritorio por página; las incidencias indican el tamaño en que aparecen.
- Formularios: rellenar campos con valores de prueba y enviar para ver errores de validación.
- Riesgos a cubrir antes de implementar:
  - El SSRF y el proxy de salida se mantienen para cada página descubierta.
  - Formularios: nunca enviar credenciales reales ni datos personales; no enviar formularios que parezcan destructivos (pagos, borrados, compras). Solo entornos de prueba o con permiso explícito del dueño del sitio.
  - Límites de tasa, dominio permitido fijado al de la URL inicial, y cancelación del recorrido.
  - Modelo de datos: un análisis por página o un análisis de sitio con páginas hijas.

## 3. Batería de pruebas de QA completa

Objetivo: cubrir lo que haría un ingeniero de QA, no solo accesibilidad. Cada tipo de prueba se marca como automatizada, asistida (la herramienta prepara y el humano decide) o manual.

- **Navegación y rutas:** enlaces rotos, redirecciones en cadena, 404 y 500 personalizados, enlaces a dominios externos caídos, anclas que no existen.
- **Formularios:** validación de campos obligatorios, límites de longitud, formatos (email, teléfono, fecha), mensajes de error asociados al campo, autocompletado, envío vacío, doble envío, comportamiento al recargar.
- **Responsive:** móvil, tablet y escritorio; desbordamiento horizontal, elementos solapados, texto cortado, zoom al 200 % y 400 %, orientación.
- **Rendimiento:** tiempo de carga, peso de recursos, recursos bloqueantes, imágenes sin dimensiones, LCP/CLS/INP con umbrales configurables.
- **Compatibilidad:** ejecución en varios motores (Chromium, Firefox, WebKit) cuando estén disponibles.
- **SEO y metadatos:** título, descripción, canonical, Open Graph, datos estructurados válidos, `robots.txt` y `sitemap.xml`.
- **Seguridad básica:** cabeceras HTTP (CSP, HSTS, X-Frame-Options), cookies sin flags, contenido mixto HTTP en HTTPS, formularios sin HTTPS.
- **Contenido y consistencia:** textos vacíos, "lorem ipsum", imágenes rotas, enlaces `mailto:` y `tel:` válidos, idioma declarado frente al contenido.
- **Estados de error y vacíos:** comportamiento sin conexión, con respuesta lenta, con datos vacíos.
- **Accesibilidad más allá de axe:** orden de tabulación, foco visible, trampas de foco, lectores de pantalla (asistida), movimiento reducido.

Restricciones que se mantienen:

- Solo entornos de prueba o con permiso explícito del dueño del sitio.
- Sin envíos destructivos ni credenciales reales; datos de prueba generados.
- Dominio fijado al de la URL inicial, límites de tasa y de páginas, cancelación en cualquier momento.
- El SSRF y el proxy de salida se aplican a cada petición de cada prueba.
- Un resultado de "no ejecutado" nunca se presenta como "superado".
