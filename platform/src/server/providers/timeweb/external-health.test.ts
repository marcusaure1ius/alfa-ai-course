import { describe, expect, it, vi } from "vitest";

import { COURSE_HOSTNAME } from "./bootstrap-profile";
import { ExternalEnvironmentVerifier } from "./external-health";

const address = "203.0.113.10";

function verifier(overrides: Partial<ConstructorParameters<typeof ExternalEnvironmentVerifier>[0]> = {}) {
  return new ExternalEnvironmentVerifier({
    resolveIpv4: async () => [address],
    isPortOpen: async (_address, port) => port === 80 || port === 443,
    tlsFingerprint: async () => "AA:BB",
    fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: { userManagement: { showSetupOnFirstLoad: true } },
      }),
    ),
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

  it("requires both healthz and the editor to return 200 without redirects", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockResolvedValueOnce(new Response("starting", { status: 503 }));
    await expect(
      verifier({ fetchImpl }).verifyN8nHealth(),
    ).rejects.toMatchObject({
      code: "EDITOR_NOT_READY",
    });
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      `https://${COURSE_HOSTNAME}/healthz`,
      `https://${COURSE_HOSTNAME}/`,
    ]);
  });

  it("rejects an automatically configured instance owner", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockResolvedValueOnce(new Response("editor", { status: 200 }))
      .mockResolvedValueOnce(
        Response.json({
          data: { userManagement: { showSetupOnFirstLoad: false } },
        }),
      );
    await expect(
      verifier({ fetchImpl }).verifyN8nHealth(),
    ).rejects.toMatchObject({
      code: "OWNER_BYPASS_DETECTED",
      retryable: false,
    });
  });
});
