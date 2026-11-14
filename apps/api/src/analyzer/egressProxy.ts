import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { connect as netConnect, type Socket } from "node:net";
import {
  DestinationBlockedError,
  normalizeHostname,
  resolvePublicAddresses,
  type Resolver,
} from "./ssrf.js";

/** Cabecera que marca las respuestas del proxy cuando bloquea un destino. */
export const BLOCKED_HEADER = "x-pink-bridge-blocked";

export interface EgressPolicy {
  readonly resolve: Resolver;
  readonly allowedPorts: readonly number[];
  /** SOLO PRUEBAS: hosts exentos del guardia SSRF. */
  readonly trustedHosts: ReadonlySet<string>;
  /** Tamaño máximo de una respuesta HTTP en claro, y presupuesto de bytes por túnel HTTPS. */
  readonly maxBytes: number;
}

export interface EgressEvents {
  readonly blockedHosts: Set<string>;
  readonly dnsFailedHosts: Set<string>;
  tooLarge: boolean;
}

export interface EgressProxy {
  readonly port: number;
  readonly events: EgressEvents;
  /** Credenciales aleatorias de un solo uso: solo el navegador del análisis las conoce. */
  readonly username: string;
  readonly password: string;
  close(): Promise<void>;
}

const TUNNEL_BUDGET_FACTOR = 4;
const CHALLENGE = 'Basic realm="pink-bridge"';

/** Compara cabeceras sin filtrar la credencial por tiempo de respuesta. */
function sameCredential(received: string | undefined, expected: string): boolean {
  if (received === undefined) {
    return false;
  }
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function portFromHostPort(value: string): { host: string; port: number } | null {
  const index = value.lastIndexOf(":");
  if (index <= 0) {
    return null;
  }
  const port = Number(value.slice(index + 1));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }
  return { host: value.slice(0, index), port };
}

/**
 * Valida un destino y devuelve direcciones públicas a las que conectar.
 * Conectar a la IP validada (y no volver a resolver el nombre) evita el DNS rebinding.
 */
async function authorize(
  hostname: string,
  port: number,
  policy: EgressPolicy,
  events: EgressEvents,
): Promise<string | null> {
  if (!policy.allowedPorts.includes(port)) {
    events.blockedHosts.add(normalizeHostname(hostname));
    return null;
  }
  try {
    const addresses = await resolvePublicAddresses(hostname, policy.resolve, policy.trustedHosts);
    const [first] = addresses;
    if (first === undefined) {
      events.dnsFailedHosts.add(normalizeHostname(hostname));
      return null;
    }
    return first;
  } catch (error) {
    if (error instanceof DestinationBlockedError && error.reason === "dns_error") {
      events.dnsFailedHosts.add(normalizeHostname(hostname));
    } else {
      events.blockedHosts.add(normalizeHostname(hostname));
    }
    return null;
  }
}

/** Responde con error. Solo marca BLOCKED_HEADER cuando la política de red bloqueó el destino. */
function rejectHttp(response: ServerResponse, status: number, blocked: boolean): void {
  const headers: Record<string, string> = { "content-type": "text/plain; charset=utf-8" };
  if (blocked) {
    headers[BLOCKED_HEADER] = "1";
  }
  response.writeHead(status, headers);
  response.end(blocked ? "Destino no permitido." : "No se pudo completar la petición.");
}

async function handleHttp(
  request: IncomingMessage,
  response: ServerResponse,
  policy: EgressPolicy,
  events: EgressEvents,
  expected: string,
): Promise<void> {
  if (!sameCredential(request.headers["proxy-authorization"], expected)) {
    response.writeHead(407, { "proxy-authenticate": CHALLENGE, "content-type": "text/plain" });
    response.end("Se requiere autenticación del proxy.");
    return;
  }
  let target: URL;
  try {
    target = new URL(request.url ?? "");
  } catch {
    rejectHttp(response, 400, false);
    return;
  }
  if (target.protocol !== "http:") {
    rejectHttp(response, 403, true);
    return;
  }

  const port = target.port === "" ? 80 : Number(target.port);
  const address = await authorize(target.hostname, port, policy, events);
  if (address === null) {
    rejectHttp(response, 403, true);
    return;
  }

  const upstream = httpRequest(
    {
      host: address,
      port,
      method: request.method,
      path: `${target.pathname}${target.search}`,
      headers: { ...request.headers, host: target.host },
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      let received = 0;
      upstreamResponse.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (received > policy.maxBytes) {
          events.tooLarge = true;
          upstreamResponse.destroy();
          response.destroy();
        }
      });
      upstreamResponse.pipe(response);
    },
  );
  upstream.on("error", () => {
    if (!response.headersSent) {
      rejectHttp(response, 502, false);
    } else {
      response.destroy();
    }
  });
  let uploaded = 0;
  request.on("data", (chunk: Buffer) => {
    uploaded += chunk.length;
    if (uploaded > policy.maxBytes) {
      events.tooLarge = true;
      request.destroy();
      upstream.destroy();
    }
  });
  request.pipe(upstream);
}

async function handleConnect(
  request: IncomingMessage,
  socket: Socket,
  head: Buffer,
  policy: EgressPolicy,
  events: EgressEvents,
  expected: string,
): Promise<void> {
  if (!sameCredential(request.headers["proxy-authorization"], expected)) {
    socket.end(
      `HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: ${CHALLENGE}\r\n\r\n`,
    );
    return;
  }
  const parsed = portFromHostPort(request.url ?? "");
  if (parsed === null) {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    return;
  }

  const address = await authorize(parsed.host, parsed.port, policy, events);
  if (address === null) {
    socket.end(`HTTP/1.1 403 Forbidden\r\n${BLOCKED_HEADER}: 1\r\n\r\n`);
    return;
  }

  const budget = policy.maxBytes * TUNNEL_BUDGET_FACTOR;
  let transferred = 0;
  const upstream = netConnect({ host: address, port: parsed.port }, () => {
    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head.length > 0) {
      upstream.write(head);
    }
    upstream.pipe(socket);
    socket.pipe(upstream);
  });

  const count = (chunk: Buffer) => {
    transferred += chunk.length;
    if (transferred > budget) {
      events.tooLarge = true;
      upstream.destroy();
      socket.destroy();
    }
  };
  upstream.on("data", count);
  socket.on("data", count);

  const close = () => {
    upstream.destroy();
    socket.destroy();
  };
  upstream.on("error", close);
  socket.on("error", close);
  upstream.on("close", () => socket.destroy());
  socket.on("close", () => upstream.destroy());
}

/** Arranca un proxy HTTP/CONNECT local que aplica la política a cada conexión del navegador. */
export async function startEgressProxy(policy: EgressPolicy): Promise<EgressProxy> {
  const events: EgressEvents = {
    blockedHosts: new Set(),
    dnsFailedHosts: new Set(),
    tooLarge: false,
  };

  const username = randomBytes(8).toString("hex");
  const password = randomBytes(24).toString("hex");
  const expected = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

  // Cada nombre se resuelve una vez por sesión. Las conexiones reutilizan esa respuesta y la siguen
  // validando contra el guardia de IP, así un DNS que cambie a mitad del análisis no obtiene otro destino.
  const lookups = new Map<string, Promise<readonly string[]>>();
  const sessionPolicy: EgressPolicy = {
    ...policy,
    resolve: (hostname) => {
      const key = normalizeHostname(hostname);
      let pending = lookups.get(key);
      if (pending === undefined) {
        pending = policy.resolve(hostname);
        lookups.set(key, pending);
        // Un fallo no se guarda: la siguiente conexión vuelve a intentar la resolución.
        pending.catch(() => {
          lookups.delete(key);
        });
      }
      return pending;
    },
  };

  const server: Server = createServer((request, response) => {
    handleHttp(request, response, sessionPolicy, events, expected).catch(() => {
      rejectHttp(response, 502, false);
    });
  });
  server.on("connect", (request: IncomingMessage, socket: Socket, head: Buffer) => {
    handleConnect(request, socket, head, sessionPolicy, events, expected).catch(() =>
      socket.destroy(),
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("El proxy de salida no obtuvo un puerto válido.");
  }

  return {
    port: address.port,
    events,
    username,
    password,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
        server.closeAllConnections();
      }),
  };
}
