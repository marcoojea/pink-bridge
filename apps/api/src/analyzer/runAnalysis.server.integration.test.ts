import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AnalysisRunError, runAnalysis } from "./runAnalysis.js";

/**
 * Servidor local en 127.0.0.1. El host se marca como trusted solo en estas pruebas,
 * para verificar el camino de éxito, las redirecciones revalidadas y los límites.
 */
let server: Server;
let port: number;
const requested: string[] = [];

const LARGE_BODY = `<!doctype html><html lang="es"><head><title>Grande</title></head><body><main><h1>Grande</h1><p>${"x".repeat(4096)}</p></main></body></html>`;

beforeAll(async () => {
  server = createServer((request, response) => {
    const path = request.url ?? "/";
    requested.push(path);

    switch (path) {
      case "/":
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(
          '<!doctype html><html lang="es"><head><title>Inicio local</title></head><body><main><h1>Inicio</h1><img src="/pixel.png" alt="pixel de prueba"></main></body></html>',
        );
        return;
      case "/final":
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(
          '<!doctype html><html lang="es"><head><title>Destino final</title></head><body><main><h1>Final</h1></main></body></html>',
        );
        return;
      case "/redirect":
        response.writeHead(302, { location: "/final" });
        response.end();
        return;
      case "/to-private":
        response.writeHead(302, { location: "http://10.0.0.1/recurso" });
        response.end();
        return;
      case "/pixel.png":
        response.writeHead(200, { "content-type": "image/png" });
        response.end(Buffer.from("iVBORw0KGgo=", "base64"));
        return;
      case "/big":
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(LARGE_BODY);
        return;
      case "/json":
        response.writeHead(200, { "content-type": "application/json" });
        response.end('{"ok":true}');
        return;
      case "/slow":
        // Respuesta retrasada: fuerza los caminos de timeout de navegación y de tiempo total.
        setTimeout(() => {
          if (!response.headersSent) {
            response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          }
          response.end(
            '<!doctype html><html lang="es"><head><title>Lenta</title></head><body></body></html>',
          );
        }, 6_000).unref();
        return;
      default:
        response.writeHead(404, { "content-type": "text/html; charset=utf-8" });
        response.end(
          '<!doctype html><html lang="es"><head><title>No encontrado</title></head><body></body></html>',
        );
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve();
    });
  });
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
});

function options(path: string, extra: Partial<Parameters<typeof runAnalysis>[0]> = {}) {
  return {
    source: { kind: "url" as const, url: new URL(`http://127.0.0.1:${String(port)}${path}`) },
    allowedPorts: [port],
    testOnlyTrustedHosts: ["127.0.0.1"],
    limits: { totalMs: 60_000, navigationMs: 15_000 },
    ...extra,
  };
}

async function errorOf(promise: Promise<unknown>): Promise<AnalysisRunError | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof AnalysisRunError ? error : undefined;
  }
}

describe("runAnalysis (servidor local, ruta de éxito y límites)", () => {
  it("audita una página local y descarga sus subrecursos a través del guardia", async () => {
    requested.length = 0;
    const result = await runAnalysis(options("/"));

    expect(result.finalUrl).toBe(`http://127.0.0.1:${String(port)}/`);
    expect(result.raw.testEngine.version).toBe("4.14.0");
    expect(requested).toContain("/pixel.png");
  }, 90_000);

  it("sigue redirecciones y revalida el destino final", async () => {
    const result = await runAnalysis(options("/redirect"));
    expect(result.finalUrl).toBe(`http://127.0.0.1:${String(port)}/final`);
  }, 90_000);

  it("bloquea una redirección hacia una IP privada aunque el origen inicial sea válido", async () => {
    const error = await errorOf(runAnalysis(options("/to-private")));
    expect(error?.code).toBe("blocked_destination");
  }, 90_000);

  it("aplica el límite de tamaño de respuesta", async () => {
    const error = await errorOf(
      runAnalysis(
        options("/big", {
          limits: { totalMs: 60_000, navigationMs: 15_000, maxResponseBytes: 1024 },
        }),
      ),
    );
    expect(error?.code).toBe("response_too_large");
  }, 90_000);

  it("rechaza un recurso que no es HTML", async () => {
    const error = await errorOf(runAnalysis(options("/json")));
    expect(error?.code).toBe("non_html_content");
  }, 90_000);

  it("informa de timeout de navegación cuando la página tarda más que navigationMs", async () => {
    const error = await errorOf(
      runAnalysis(options("/slow", { limits: { totalMs: 60_000, navigationMs: 1_000 } })),
    );
    expect(error?.code).toBe("navigation_timeout");
  }, 90_000);

  it("informa de timeout total y cierra el navegador aunque la auditoría siga en curso", async () => {
    const started = Date.now();
    const error = await errorOf(
      runAnalysis(options("/slow", { limits: { totalMs: 2_000, navigationMs: 15_000 } })),
    );
    expect(error?.code).toBe("analysis_timeout");
    expect(Date.now() - started).toBeLessThan(15_000);
  }, 90_000);

  it("informa de una respuesta HTTP de error", async () => {
    const error = await errorOf(runAnalysis(options("/inexistente")));
    expect(error?.code).toBe("http_error");
  }, 90_000);
});
