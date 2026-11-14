import { useEffect, useState } from "react";

export type Route =
  | { readonly name: "home" }
  | { readonly name: "history" }
  | { readonly name: "analysis"; readonly id: string }
  | { readonly name: "compare"; readonly from: string; readonly to: string }
  | { readonly name: "notFound" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseRoute(hash: string): Route {
  // La query (?gravedad=critical) describe filtros de la vista, no cambia la ruta.
  const path = (hash.replace(/^#/, "").split("?")[0] ?? "").replace(/\/+$/, "") || "/";
  if (path === "/") {
    return { name: "home" };
  }
  if (path === "/historial") {
    return { name: "history" };
  }
  const analysis = /^\/analisis\/([^/]+)$/.exec(path);
  if (analysis?.[1] !== undefined && UUID.test(analysis[1])) {
    return { name: "analysis", id: analysis[1] };
  }
  const compare = /^\/comparar\/([^/]+)\/([^/]+)$/.exec(path);
  if (
    compare?.[1] !== undefined &&
    compare[2] !== undefined &&
    UUID.test(compare[1]) &&
    UUID.test(compare[2])
  ) {
    return { name: "compare", from: compare[1], to: compare[2] };
  }
  return { name: "notFound" };
}

export function routeHref(route: "home" | "history"): string {
  return route === "home" ? "#/" : historyHref();
}

export function historyHref(): string {
  return "#/historial";
}

export function analysisHref(id: string): string {
  return `#/analisis/${id}`;
}

export function compareHref(from: string, to: string): string {
  return `#/comparar/${from}/${to}`;
}

/** Parámetros de la query del hash, p. ej. #/analisis/<id>?gravedad=critical. */
export function hashParams(hash: string = window.location.hash): URLSearchParams {
  const index = hash.indexOf("?");
  return new URLSearchParams(index === -1 ? "" : hash.slice(index + 1));
}

/** Refleja filtros en la dirección sin añadir entradas al historial ni recargar la página. */
export function setHashParams(params: URLSearchParams): void {
  const base = window.location.hash.split("?")[0] ?? "#/";
  const query = params.toString();
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}${base}${query === "" ? "" : `?${query}`}`,
  );
}

/** Único punto de navegación programática: cambia el hash sin recargar la página. */
export function navigateTo(hash: string): void {
  window.location.hash = hash;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));

  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(window.location.hash));
    };
    window.addEventListener("hashchange", onChange);
    return () => {
      window.removeEventListener("hashchange", onChange);
    };
  }, []);

  return route;
}
