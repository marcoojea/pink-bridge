import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAgentPromptText } from "./client.js";
import { authorizationHeaders, downloadWithToken, getToken, setToken } from "./token.js";

const ID = "0f8fad5b-d9cb-469f-a165-8c0a6a9b2d3e";

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("token de acceso", () => {
  it("guarda el token recortado y lo borra cuando se deja vacío", () => {
    setToken("  secreto-de-prueba-123  ");
    expect(getToken()).toBe("secreto-de-prueba-123");
    setToken("   ");
    expect(getToken()).toBeNull();
  });

  it("solo genera la cabecera Authorization cuando hay token", () => {
    expect(authorizationHeaders()).toEqual({});
    setToken("secreto-de-prueba-123");
    expect(authorizationHeaders()).toEqual({ authorization: "Bearer secreto-de-prueba-123" });
  });

  it("envía el token al pedir el prompt para asistentes", async () => {
    const mock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(new Response("# Prompt", { status: 200 })),
    );
    vi.stubGlobal("fetch", mock);

    setToken("secreto-de-prueba-123");
    await getAgentPromptText(ID);

    const init = mock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secreto-de-prueba-123");
  });

  it("no envía cabecera Authorization sin token", async () => {
    const mock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(new Response("# Prompt", { status: 200 })),
    );
    vi.stubGlobal("fetch", mock);

    await getAgentPromptText(ID);

    const init = mock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
  });

  it("descarga con la cabecera y lanza un error si la API rechaza el token", async () => {
    const mock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(new Response("{}", { status: 401 })),
    );
    vi.stubGlobal("fetch", mock);
    setToken("token-incorrecto-123");

    await expect(downloadWithToken("/api/x", "x.json")).rejects.toThrow("token de acceso");
    const init = mock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer token-incorrecto-123");
  });

  it("entrega el archivo descargado con el nombre pedido", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(() =>
        Promise.resolve(new Response("contenido", { status: 200 })),
      ),
    );
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:prueba");
    const revokeObjectURL = vi.fn<(url: string) => void>();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    await downloadWithToken("/api/x", "informe.html");

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:prueba");
  });
});
