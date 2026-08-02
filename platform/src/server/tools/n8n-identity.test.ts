import { afterEach, describe, expect, it, vi } from "vitest";

import { N8nIdentityError, resolveN8nMemberIdentity } from "./n8n-identity";

const managementSecret = "gateway-management-secret-at-least-32-bytes";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("resolveN8nMemberIdentity", () => {
  it("accepts only the exact invited Member identity", async () => {
    vi.stubEnv("N8N_MANAGEMENT_API_KEY", "owner-api-key");
    vi.stubEnv("N8N_GATE_MANAGEMENT_SECRET", managementSecret);
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        id: "n8n-user-1",
        email: "student@example.test",
        isPending: true,
        role: "global:member",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      resolveN8nMemberIdentity(
        "https://n8n.example.test",
        " Student@Example.Test ",
      ),
    ).resolves.toEqual({
      id: "n8n-user-1",
      email: "student@example.test",
      pending: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://n8n.example.test/api/v1/users/student%40example.test?includeRole=true",
      expect.objectContaining({
        cache: "no-store",
        headers: {
          "x-n8n-api-key": "owner-api-key",
          "x-neurokurs-management": managementSecret,
        },
      }),
    );
  });

  it.each([
    [404, "IDENTITY_NOT_FOUND"],
    [500, "PROVIDER_UNAVAILABLE"],
  ] as const)("fails closed for provider status %s", async (status, code) => {
    vi.stubEnv("N8N_MANAGEMENT_API_KEY", "owner-api-key");
    vi.stubEnv("N8N_GATE_MANAGEMENT_SECRET", managementSecret);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
    await expect(
      resolveN8nMemberIdentity("https://n8n.example.test", "student@example.test"),
    ).rejects.toMatchObject({ code });
  });

  it("rejects owner/admin identities and missing server configuration", async () => {
    await expect(
      resolveN8nMemberIdentity("https://n8n.example.test", "student@example.test"),
    ).rejects.toBeInstanceOf(N8nIdentityError);

    vi.stubEnv("N8N_MANAGEMENT_API_KEY", "owner-api-key");
    vi.stubEnv("N8N_GATE_MANAGEMENT_SECRET", managementSecret);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          id: "owner",
          email: "student@example.test",
          role: "global:owner",
        }),
      ),
    );
    await expect(
      resolveN8nMemberIdentity("https://n8n.example.test", "student@example.test"),
    ).rejects.toMatchObject({ code: "IDENTITY_NOT_MEMBER" });
  });
});
