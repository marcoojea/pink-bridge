import { describe, expect, it } from "vitest";
import { assertPublicHost, DestinationBlockedError, isBlockedIp } from "./ssrf.js";

describe("isBlockedIp", () => {
  it.each([
    "127.0.0.1",
    "127.255.255.254",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "240.0.0.1",
    "198.18.0.1",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "ff02::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.5",
    "::ffff:7f00:1",
    "::ffff:a9fe:a9fe",
    "64:ff9b::7f00:1",
  ])("bloquea %s", (address) => {
    expect(isBlockedIp(address)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111", "2001:4860:4860::8888"])(
    "permite la dirección pública %s",
    (address) => {
      expect(isBlockedIp(address)).toBe(false);
    },
  );

  it("bloquea cadenas que no son direcciones (fail closed)", () => {
    expect(isBlockedIp("no-es-ip")).toBe(true);
  });
});

describe("assertPublicHost", () => {
  it("acepta un host cuyas direcciones son todas públicas", async () => {
    await expect(
      assertPublicHost("example.com", () => Promise.resolve(["93.184.216.34", "1.1.1.1"])),
    ).resolves.toBeUndefined();
  });

  it("bloquea un host que resuelve a loopback (rebinding simulado)", async () => {
    await expect(
      assertPublicHost("evil.example", () => Promise.resolve(["127.0.0.1"])),
    ).rejects.toMatchObject({ reason: "blocked_destination" });
  });

  it("bloquea si una sola de las direcciones es privada", async () => {
    await expect(
      assertPublicHost("mixto.example", () => Promise.resolve(["93.184.216.34", "10.0.0.7"])),
    ).rejects.toBeInstanceOf(DestinationBlockedError);
  });

  it("trata una resolución vacía como error de DNS", async () => {
    await expect(
      assertPublicHost("vacio.example", () => Promise.resolve([])),
    ).rejects.toMatchObject({
      reason: "dns_error",
    });
  });

  it("trata un fallo del resolver como error de DNS", async () => {
    await expect(
      assertPublicHost("roto.example", () => Promise.reject(new Error("ENOTFOUND"))),
    ).rejects.toMatchObject({ reason: "dns_error" });
  });

  it("valida IPs literales sin consultar DNS", async () => {
    let consulted = false;
    const resolver = () => {
      consulted = true;
      return Promise.resolve(["93.184.216.34"]);
    };

    await expect(assertPublicHost("169.254.169.254", resolver)).rejects.toMatchObject({
      reason: "blocked_destination",
    });
    await expect(assertPublicHost("[::1]", resolver)).rejects.toMatchObject({
      reason: "blocked_destination",
    });
    expect(consulted).toBe(false);
  });

  it("acepta una IP literal pública", async () => {
    await expect(assertPublicHost("8.8.8.8", () => Promise.resolve([]))).resolves.toBeUndefined();
  });
});
