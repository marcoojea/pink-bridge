/**
 * Token de acceso a la API, cuando el servidor lo exige (PINK_BRIDGE_TOKEN).
 * Vive solo en sessionStorage: se borra al cerrar la pestaña y nunca va en la URL.
 */
const KEY = "pink-bridge:token";

export function getToken(): string | null {
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(value: string): void {
  try {
    if (value.trim() === "") {
      window.sessionStorage.removeItem(KEY);
    } else {
      window.sessionStorage.setItem(KEY, value.trim());
    }
  } catch {
    // Sin almacenamiento disponible el token no se guarda y la API responderá 401.
  }
}

/** Cabeceras de autorización si hay token guardado; vacío en otro caso. */
export function authorizationHeaders(): Record<string, string> {
  const token = getToken();
  return token === null ? {} : { authorization: `Bearer ${token}` };
}

/** Descarga un recurso de la API con la cabecera de autorización. Lanza si la respuesta no es correcta. */
export async function downloadWithToken(href: string, filename: string): Promise<void> {
  const response = await fetch(href, { headers: authorizationHeaders() });
  if (!response.ok) {
    throw new Error("No se pudo descargar el archivo. Comprueba el token de acceso.");
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
