import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const blockedV4 = new BlockList();
const IPV4_BLOCKED_RANGES: readonly [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];
for (const [address, prefix] of IPV4_BLOCKED_RANGES) {
  blockedV4.addSubnet(address, prefix, "ipv4");
}

const blockedV6 = new BlockList();
const IPV6_BLOCKED_RANGES: readonly [string, number][] = [
  ["::", 128],
  ["::1", 128],
  ["::", 96],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
];
for (const [address, prefix] of IPV6_BLOCKED_RANGES) {
  blockedV6.addSubnet(address, prefix, "ipv6");
}

/** Convierte ::ffff:XXYY:ZZWW a dotted IPv4 cuando el formato viene en hexadecimal. */
function mappedIpv4FromHex(address: string): string | null {
  const match = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (!match?.[1] || !match[2]) {
    return null;
  }
  const high = parseInt(match[1], 16);
  const low = parseInt(match[2], 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

/** Devuelve true si la dirección no es pública o no puede clasificarse (fail closed). */
export function isBlockedIp(address: string): boolean {
  const family = isIP(address);

  if (family === 4) {
    return blockedV4.check(address, "ipv4");
  }

  if (family === 6) {
    const lower = address.toLowerCase();
    const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower)?.[1];
    if (dotted) {
      return isBlockedIp(dotted);
    }
    const fromHex = mappedIpv4FromHex(lower);
    if (fromHex) {
      return isBlockedIp(fromHex);
    }
    return blockedV6.check(lower, "ipv6");
  }

  return true;
}

export type Resolver = (hostname: string) => Promise<readonly string[]>;

export const systemResolver: Resolver = async (hostname) => {
  const records = await lookup(hostname, { all: true, order: "verbatim" });
  return records.map((record) => record.address);
};

export class DestinationBlockedError extends Error {
  constructor(
    readonly reason: "blocked_destination" | "dns_error",
    readonly hostname: string,
  ) {
    super(
      reason === "dns_error"
        ? "No se pudo resolver el nombre de host."
        : "El destino resuelve a una dirección no permitida.",
    );
    this.name = "DestinationBlockedError";
  }
}

export function normalizeHostname(hostname: string): string {
  return hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
}

/**
 * Resuelve el host y devuelve solo direcciones públicas validadas.
 * Las IP literales se validan sin consultar DNS.
 * `trustedHosts` exime hosts concretos del bloqueo; solo lo usan las pruebas.
 */
export async function resolvePublicAddresses(
  hostname: string,
  resolve: Resolver = systemResolver,
  trustedHosts: ReadonlySet<string> = new Set(),
): Promise<readonly string[]> {
  const host = normalizeHostname(hostname);
  const trusted = trustedHosts.has(host);

  if (isIP(host) !== 0) {
    if (!trusted && isBlockedIp(host)) {
      throw new DestinationBlockedError("blocked_destination", hostname);
    }
    return [host];
  }

  let addresses: readonly string[];
  try {
    addresses = await resolve(host);
  } catch {
    throw new DestinationBlockedError("dns_error", hostname);
  }

  if (addresses.length === 0) {
    throw new DestinationBlockedError("dns_error", hostname);
  }
  if (!trusted && addresses.some((address) => isBlockedIp(address))) {
    throw new DestinationBlockedError("blocked_destination", hostname);
  }
  return addresses;
}

export async function assertPublicHost(
  hostname: string,
  resolve: Resolver = systemResolver,
): Promise<void> {
  await resolvePublicAddresses(hostname, resolve);
}
