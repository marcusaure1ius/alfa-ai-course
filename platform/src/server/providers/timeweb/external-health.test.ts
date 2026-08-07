import { describe, expect, it, vi } from "vitest";

import { COURSE_HOSTNAME } from "./bootstrap-profile";
import { ExternalEnvironmentVerifier } from "./external-health";

const address = "203.0.113.10";

function verifier(overrides: Partial<ConstructorParameters<typeof ExternalEnvironmentVerifier>[0]> = {}) {
  return new ExternalEnvironmentVerifier({
    resolveIpv4: async () => [address],
    isPortOpen: async (_address, port) => port === 80 || port === 443,
    tlsFingerprint: async () => "AA:BB",
    // ADR-0016: редактор отвечает публично, а закрытым обязан оставаться
    // только управляющий API.
    fetchImpl: vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const pathname = new URL(String(input)).pathname;
      if (pathname === "/healthz") return new Response("ok", { status: 200 });
      if (pathname === "/") return new Response("editor", { status: 200 });
      return new Response(null, { status: 401 });
    }),
    ...overrides,
  });
}

describe("ExternalEnvironmentVerifier", () => {
  it("accepts exact DNS, valid TLS, public 80/443 and private service ports", async () => {
    const health = verifier();
    await expect(health.verifyBootstrapReachable(address)).resolves.toBeUndefined();
    await expect(health.verifyDns(address)).resolves.toBeUndefined();
    await expect(health.verifyTlsAndPorts(address)).resolves.toBe("AA:BB");
    await expect(health.verifyN8nHealth()).resolves.toBeUndefined();
  });

  it("rejects a DNS answer that is not the owned public IP", async () => {
    await expect(
      verifier({ resolveIpv4: async (hostname) => {
        expect(hostname).toBe(COURSE_HOSTNAME);
        return ["203.0.113.11"];
      } }).verifyDns(address),
    ).rejects.toMatchObject({
      code: "DNS_NOT_READY",
      retryable: true,
    });
  });

  it("fails permanently if n8n or PostgreSQL is public", async () => {
    await expect(
      verifier({
        isPortOpen: async (_address, port) =>
          port === 80 || port === 443 || port === 5_678,
      }).verifyTlsAndPorts(address),
    ).rejects.toMatchObject({
      code: "UNSAFE_PUBLIC_PORT",
      retryable: false,
    });
  });

  // ADR-0016: публично доступная форма входа n8n — требуемое состояние, а не
  // ошибка. Прежние кейсы закрепляли отменённую модель и давали ложное зелёное.
  it("принимает публично доступный редактор", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockResolvedValueOnce(new Response("editor", { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(
      verifier({ fetchImpl }).verifyN8nHealth(),
    ).resolves.toBeUndefined();
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      `https://${COURSE_HOSTNAME}/healthz`,
      `https://${COURSE_HOSTNAME}/`,
      `https://${COURSE_HOSTNAME}/api/v1/users`,
    ]);
  });

  it("принимает редирект редиректа на страницу входа", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: "/signin" } }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(
      verifier({ fetchImpl }).verifyN8nHealth(),
    ).resolves.toBeUndefined();
  });

  it("отклоняет неотвечающий редактор", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockResolvedValueOnce(new Response("boom", { status: 502 }));
    await expect(
      verifier({ fetchImpl }).verifyN8nHealth(),
    ).rejects.toMatchObject({ code: "HEALTH_NOT_READY", retryable: true });
  });

  it("отклоняет открытый управляющий API как невосстановимую ошибку", async () => {
    // Открытый /api/v1 означает полный доступ к инструменту без учётных данных.
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockResolvedValueOnce(new Response("editor", { status: 200 }))
      .mockResolvedValueOnce(new Response("[]", { status: 200 }));
    await expect(
      verifier({ fetchImpl }).verifyN8nHealth(),
    ).rejects.toMatchObject({
      code: "MANAGEMENT_API_NOT_SECURED",
      retryable: false,
    });
  });
});
