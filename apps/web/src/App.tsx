import { useEffect, useState } from "react";
import { healthResponseSchema } from "@pink-bridge/shared";

export type ApiStatus = { kind: "loading" } | { kind: "ok"; version: string } | { kind: "error" };

export async function fetchApiStatus(signal: AbortSignal): Promise<ApiStatus> {
  try {
    const response = await fetch("/api/health", { signal });
    if (!response.ok) {
      return { kind: "error" };
    }
    const parsed = healthResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return { kind: "error" };
    }
    return { kind: "ok", version: parsed.data.version };
  } catch {
    if (signal.aborted) {
      return { kind: "loading" };
    }
    return { kind: "error" };
  }
}

function describeStatus(status: ApiStatus): string {
  switch (status.kind) {
    case "loading":
      return "Comprobando la API…";
    case "ok":
      return `API disponible (versión ${status.version}).`;
    case "error":
      return "No se pudo conectar con la API.";
  }
}

export function App() {
  const [status, setStatus] = useState<ApiStatus>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    void fetchApiStatus(controller.signal).then((result) => {
      if (!controller.signal.aborted) {
        setStatus(result);
      }
    });
    return () => {
      controller.abort();
    };
  }, []);

  return (
    <>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <header className="site-header">
        <h1>Pink Bridge</h1>
        <p>Auditoría de accesibilidad web e informes QA.</p>
      </header>
      <main id="contenido" tabIndex={-1}>
        <section aria-labelledby="estado-api">
          <h2 id="estado-api">Estado de la API</h2>
          <p role="status" aria-live="polite">
            {describeStatus(status)}
          </p>
        </section>
      </main>
    </>
  );
}
