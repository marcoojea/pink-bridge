/**
 * Modo demostración: la misma interfaz, pero sin API. Los datos vienen de ficheros estáticos
 * generados a partir de auditorías reales del sitio de ejemplo (scripts/make-demo-snapshot.ts).
 * Solo se activa al construir con VITE_DEMO=1; en desarrollo y en Docker no cambia nada.
 */
export const DEMO = import.meta.env.VITE_DEMO === "1";

/** Ruta de un fichero del snapshot, según la base pública de la web. */
function demoFile(file: string): string {
  return `${import.meta.env.BASE_URL}demo/${file}`;
}

/**
 * Traduce una petición de la API a un fichero estático del snapshot.
 * Devuelve null si la petición no existe en la demo (escritura o ruta desconocida).
 */
export function demoRequest(path: string, method: string): string | null {
  if (method !== "GET") {
    return null;
  }
  const url = new URL(path, "http://demo.local");
  const parts = url.pathname.split("/").filter((part) => part.length > 0);
  if (parts[0] !== "api" || parts[1] !== "analyses") {
    return null;
  }

  if (parts.length === 2) {
    return demoFile("analyses.json");
  }
  if (parts.length === 3 && parts[2] === "compare") {
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    return demoFile(`compare/${from}__${to}.json`);
  }
  const id = parts[2];
  if (id === undefined || !/^[0-9a-f-]{36}$/i.test(id)) {
    return null;
  }
  if (parts.length === 3) {
    return demoFile(`analyses/${id}.json`);
  }
  if (parts.length === 4) {
    const resource = parts[3];
    if (resource === "findings" || resource === "reviews") {
      return demoFile(`analyses/${id}/${resource}.json`);
    }
    if (resource === "agent-prompts") {
      return demoFile(`analyses/${id}/agent-prompts.md`);
    }
    if (resource === "report") {
      const format = url.searchParams.get("format") === "html" ? "html" : "json";
      return demoFile(`analyses/${id}/report.${format}`);
    }
  }
  return null;
}

/** Enlace de descarga o de visualización de un recurso de la API, válido también en la demo. */
export function apiHref(path: string): string {
  return DEMO ? (demoRequest(path, "GET") ?? path) : path;
}
