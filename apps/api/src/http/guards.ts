import { timingSafeEqual } from "node:crypto";

export interface FixedWindowLimiter {
  /** Cuenta una petición para la clave dada. Devuelve false si ya se alcanzó el máximo. */
  take(key: string): boolean;
}

interface Window {
  start: number;
  count: number;
}

/** Límite de ventana fija por clave (p. ej. IP). Sin dependencias: la API es de uso local o interno. */
export function createFixedWindowLimiter(
  max: number,
  windowMs: number,
  now: () => number = Date.now,
): FixedWindowLimiter {
  const windows = new Map<string, Window>();
  return {
    take(key) {
      const current = now();
      if (windows.size > 10_000) {
        for (const [name, window] of windows) {
          if (current - window.start >= windowMs) {
            windows.delete(name);
          }
        }
      }
      let window = windows.get(key);
      if (window === undefined || current - window.start >= windowMs) {
        window = { start: current, count: 0 };
        windows.set(key, window);
      }
      if (window.count >= max) {
        return false;
      }
      window.count += 1;
      return true;
    },
  };
}

/** Comprueba `Authorization: Bearer <token>` en tiempo constante. */
export function hasBearerToken(header: string | undefined, token: string): boolean {
  if (!header?.startsWith("Bearer ")) {
    return false;
  }
  const received = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(token);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
