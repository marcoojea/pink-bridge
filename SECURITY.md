# Política de seguridad

## Versiones con soporte

Solo la rama `main` recibe correcciones de seguridad. Pink Bridge aún no tiene versiones publicadas.

## Cómo reportar una vulnerabilidad

No abras una incidencia pública para un fallo de seguridad. Usa el reporte privado de GitHub:
**Security → Report a vulnerability** en este repositorio.

Incluye, si puedes:

- qué componente afecta (API, motor, proxy de salida, CLI, interfaz);
- los pasos para reproducirlo y la versión o commit;
- el impacto que tú ves.

Intentaremos confirmar la recepción en una semana. No hay programa de recompensas.

## Qué tratamos como vulnerabilidad

Especialmente relevantes en esta herramienta, porque analiza URLs que no controla:

- **SSRF y evasión del guardia de destinos**: alcanzar IP privadas, loopback, metadatos cloud o puertos no permitidos a través de la API, el proxy de salida o el CLI.
- **Credenciales y tokens**: fugas por logs, informes, evidencias o líneas base; acceso a la API sin token cuando está configurado.
- **Inyección en informes HTML**: contenido de una web analizada que ejecute código en el informe o en la interfaz.
- **Denegación de servicio** por entradas sin límite (páginas, nodos, tamaños).

## Fuera de alcance

- La exposición de la API a internet sin control de acceso delante. El arranque ya rechaza `HOST` no local salvo que se active `PINK_BRIDGE_ALLOW_REMOTE=1`, y la documentación lo advierte.
- Resultados de accesibilidad incorrectos: son fallos funcionales. Repórtalos como incidencia normal.

## Medidas actuales

Guardia SSRF con resolución y validación de todas las direcciones, proxy de salida con credenciales de un solo uso, navegador aislado sin cookies ni permisos, límites de tamaño y de tiempo, token opcional y límite de creación por IP, auditoría de dependencias en CI (`npm audit`, umbral `high`).
