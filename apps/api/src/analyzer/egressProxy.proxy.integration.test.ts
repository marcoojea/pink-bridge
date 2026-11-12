import { connect as netConnect, createServer as createNetServer, type AddressInfo } from "node:net";
import { createServer as createHttpServer, request as httpRequest, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BLOCKED_HEADER, startEgressProxy, type EgressProxy } from "./egressProxy.js";

/** Envía una petición cruda al proxy y devuelve la línea de estado y las cabeceras. */
function rawExchange(proxyPort: number, payload: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = netConnect({ host: "127.0.0.1", port: proxyPort }, () => {
      socket.write(payload);
    });
    let data = "";
    socket.on("data", (chunk: Buffer) => {
      data += chunk.toString("utf8");
    });
    socket.on("close", () => {
      resolve(data);
    });
    socket.on("error", reject);
    setTimeout(() => socket.destroy(), 3_000).unref();
  });
}

let proxy: EgressProxy;
let upstream: Server;
let upstreamPort: number;

beforeAll(async () => {
  upstream = createHttpServer((request, response) => {
    if (request.url === "/grande") {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("x".repeat(4096));
      return;
    }
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("hola desde el destino permitido");
  });
  await new Promise<void>((resolve) =>
    upstream.listen(0, "127.0.0.1", () => {
      resolve();
    }),
  );
  upstreamPort = (upstream.address() as AddressInfo).port;

  proxy = await startEgressProxy({
    resolve: () => Promise.resolve(["127.0.0.1"]),
    allowedPorts: [80, 443, upstreamPort],
    // SOLO PRUEBAS: los nombres de prueba resuelven a loopback y deben quedar exentos del guardia.
    trustedHosts: new Set(["permitido.example", "grande.example"]),
    maxBytes: 1024,
  });
});

afterAll(async () => {
  await proxy.close();
  upstream.closeAllConnections();
  await new Promise<void>((resolve) =>
    upstream.close(() => {
      resolve();
    }),
  );
});

describe("proxy de salida (protocolo y rechazos)", () => {
  it("reenvía una petición HTTP permitida al destino validado", async () => {
    const body = await new Promise<string>((resolve, reject) => {
      const request = httpRequest(
        {
          host: "127.0.0.1",
          port: proxy.port,
          method: "GET",
          path: `http://permitido.example:${String(upstreamPort)}/`,
          headers: { host: `permitido.example:${String(upstreamPort)}` },
        },
        (response) => {
          let text = "";
          response.on("data", (chunk: Buffer) => {
            text += chunk.toString("utf8");
          });
          response.on("end", () => {
            resolve(text);
          });
        },
      );
      request.on("error", reject);
      request.end();
    });
    expect(body).toBe("hola desde el destino permitido");
  });

  it("corta una respuesta HTTP que supera el límite de bytes", async () => {
    await new Promise<void>((resolve) => {
      const request = httpRequest(
        {
          host: "127.0.0.1",
          port: proxy.port,
          method: "GET",
          path: `http://grande.example:${String(upstreamPort)}/grande`,
          headers: { host: `grande.example:${String(upstreamPort)}` },
        },
        (response) => {
          response.on("data", () => undefined);
          response.on("close", () => {
            resolve();
          });
          response.on("end", () => {
            resolve();
          });
          response.on("error", () => {
            resolve();
          });
        },
      );
      request.on("error", () => {
        resolve();
      });
      request.end();
    });
    expect(proxy.events.tooLarge).toBe(true);
  });

  it("rechaza un esquema distinto de http en petición absoluta", async () => {
    const reply = await rawExchange(
      proxy.port,
      "GET https://no-http.example/ HTTP/1.1\r\nHost: no-http.example\r\nConnection: close\r\n\r\n",
    );
    expect(reply).toContain("403");
    expect(reply).toContain(`${BLOCKED_HEADER}: 1`);
  });

  it("rechaza una URL no absoluta con 400 sin marcarla como bloqueada", async () => {
    const reply = await rawExchange(
      proxy.port,
      "GET /ruta-relativa HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n",
    );
    expect(reply).toContain("400");
    expect(reply).not.toContain(BLOCKED_HEADER);
  });

  it("rechaza un CONNECT con destino mal formado", async () => {
    const reply = await rawExchange(
      proxy.port,
      "CONNECT sin-puerto HTTP/1.1\r\nHost: sin-puerto\r\n\r\n",
    );
    expect(reply).toContain("400");
  });

  it("rechaza un CONNECT a un puerto no permitido y lo registra", async () => {
    const reply = await rawExchange(
      proxy.port,
      "CONNECT puerto-raro.example:22 HTTP/1.1\r\nHost: x\r\n\r\n",
    );
    expect(reply).toContain("403");
    expect(proxy.events.blockedHosts.has("puerto-raro.example")).toBe(true);
  });

  it("establece un CONNECT permitido y reenvía bytes en ambos sentidos", async () => {
    const tcp = createNetServer((socket) => {
      socket.on("data", (chunk: Buffer) => socket.write(`eco:${chunk.toString("utf8")}`));
    });
    await new Promise<void>((resolve) =>
      tcp.listen(0, "127.0.0.1", () => {
        resolve();
      }),
    );
    const tcpPort = (tcp.address() as AddressInfo).port;

    const proxyWithTcp = await startEgressProxy({
      resolve: () => Promise.resolve(["127.0.0.1"]),
      allowedPorts: [tcpPort],
      trustedHosts: new Set(["eco.example"]),
      maxBytes: 1024,
    });

    try {
      const echoed = await new Promise<string>((resolve, reject) => {
        const socket = netConnect({ host: "127.0.0.1", port: proxyWithTcp.port }, () => {
          socket.write(
            `CONNECT eco.example:${String(tcpPort)} HTTP/1.1\r\nHost: eco.example\r\n\r\n`,
          );
        });
        let buffer = "";
        socket.on("data", (chunk: Buffer) => {
          buffer += chunk.toString("utf8");
          if (buffer.includes("200 Connection Established\r\n\r\n") && !buffer.includes("eco:")) {
            socket.write("hola");
          }
          if (buffer.includes("eco:hola")) {
            socket.destroy();
            resolve(buffer);
          }
        });
        socket.on("error", reject);
        setTimeout(() => {
          socket.destroy();
          reject(new Error("El túnel no respondió a tiempo."));
        }, 3_000).unref();
      });
      expect(echoed).toContain("eco:hola");
    } finally {
      await proxyWithTcp.close();
      await new Promise<void>((resolve) =>
        tcp.close(() => {
          resolve();
        }),
      );
    }
  });
});
