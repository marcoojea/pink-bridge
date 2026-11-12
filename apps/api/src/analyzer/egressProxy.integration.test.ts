import { createServer as createNetServer, type Server as NetServer } from "node:net";
import type { AddressInfo, Socket } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AnalysisRunError, runAnalysis } from "./runAnalysis.js";

/**
 * Servidor TCP que acepta conexiones pero no habla TLS.
 * Sirve para comprobar que el túnel CONNECT se establece hacia un destino permitido en pruebas.
 */
let tcpServer: NetServer;
let tcpPort: number;
let tcpConnections = 0;
const openSockets = new Set<Socket>();

beforeAll(async () => {
  tcpServer = createNetServer((socket) => {
    tcpConnections += 1;
    openSockets.add(socket);
    socket.on("error", () => undefined);
    socket.on("close", () => openSockets.delete(socket));
    socket.end("no es TLS\r\n");
  });
  await new Promise<void>((resolve) => {
    tcpServer.listen(0, "127.0.0.1", () => {
      resolve();
    });
  });
  tcpPort = (tcpServer.address() as AddressInfo).port;
});

afterAll(async () => {
  for (const socket of openSockets) {
    socket.destroy();
  }
  await new Promise<void>((resolve) => {
    tcpServer.close(() => {
      resolve();
    });
  });
});

describe("proxy de salida (CONNECT y HTTPS)", () => {
  it("bloquea un túnel HTTPS hacia una IP privada antes de conectar", async () => {
    const error = await runAnalysis({
      source: { kind: "url", url: new URL("https://10.0.0.1/") },
      limits: { totalMs: 60_000, navigationMs: 15_000 },
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AnalysisRunError);
    expect((error as AnalysisRunError).code).toBe("blocked_destination");
  }, 90_000);

  it("responde de forma controlada cuando el destino permitido no acepta conexiones", async () => {
    const closed = createNetServer();
    await new Promise<void>((resolve) =>
      closed.listen(0, "127.0.0.1", () => {
        resolve();
      }),
    );
    const closedPort = (closed.address() as AddressInfo).port;
    await new Promise<void>((resolve) =>
      closed.close(() => {
        resolve();
      }),
    );

    const error = await runAnalysis({
      source: { kind: "url", url: new URL(`http://127.0.0.1:${String(closedPort)}/`) },
      allowedPorts: [closedPort],
      testOnlyTrustedHosts: ["127.0.0.1"],
      limits: { totalMs: 60_000, navigationMs: 15_000 },
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AnalysisRunError);
    expect(["http_error", "navigation_failed"]).toContain((error as AnalysisRunError).code);
  }, 90_000);

  it("establece el túnel hacia un destino permitido y falla de forma controlada si no hay TLS", async () => {
    const before = tcpConnections;
    const error = await runAnalysis({
      source: { kind: "url", url: new URL(`https://127.0.0.1:${String(tcpPort)}/`) },
      allowedPorts: [tcpPort],
      testOnlyTrustedHosts: ["127.0.0.1"],
      limits: { totalMs: 60_000, navigationMs: 15_000 },
    }).catch((caught: unknown) => caught);

    expect(tcpConnections).toBeGreaterThan(before);
    expect(error).toBeInstanceOf(AnalysisRunError);
    expect(["navigation_failed", "certificate_error", "navigation_timeout"]).toContain(
      (error as AnalysisRunError).code,
    );
  }, 90_000);
});
