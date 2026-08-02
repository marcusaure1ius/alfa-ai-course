import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveN8nMemberIdentity } from "./n8n-identity";
import { deriveN8nGatewayManagementSecret } from "./n8n-managed-secret";

const authSecret = "identity-example-not-a-secret-32-characters";
const managementSecret = deriveN8nGatewayManagementSecret(authSecret);

function configure(): void {
  vi.stubEnv("AUTH_SECRET", authSecret);
  vi.stubEnv("N8N_MANAGEMENT_API_KEY", "owner-api-key");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("resolveN8nMemberIdentity", () => {
  it("accepts an existing exact Member identity", async () => {
    configure();
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        id: "n8n-user-1",
        email: "student@example.test",
        isPending: false,
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
      pending: false,
      invitePath: null,
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

  it("automatically invites a missing student as Member", async () => {
    configure();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        Response.json(
          [
            {
              user: {
                id: "n8n-user-2",
                email: "student@example.test",
                role: "global:member",
                emailSent: false,
                inviteAcceptUrl:
                  "https://n8n.example.test/signup?token=one-time-invite",
              },
              error: "",
            },
          ],
          { status: 201 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      resolveN8nMemberIdentity("https://n8n.example.test", "student@example.test"),
    ).resolves.toEqual({
      id: "n8n-user-2",
      email: "student@example.test",
      pending: true,
      invitePath: "/signup?token=one-time-invite",
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://n8n.example.test/api/v1/users",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify([
          { email: "student@example.test", role: "global:member" },
        ]),
      }),
    );
  });

  it("fails closed for provider failure, owner identity, and missing API key", async () => {
    vi.stubEnv("AUTH_SECRET", authSecret);
    await expect(
      resolveN8nMemberIdentity("https://n8n.example.test", "student@example.test"),
    ).rejects.toMatchObject({ code: "CONFIGURATION_MISSING" });

    configure();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    await expect(
      resolveN8nMemberIdentity("https://n8n.example.test", "student@example.test"),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });

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

  it("fails closed when an invite response contains a non-string error", async () => {
    configure();
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(new Response(null, { status: 404 }))
        .mockResolvedValueOnce(
          Response.json(
            [
              {
                user: {
                  id: "n8n-user-3",
                  email: "student@example.test",
                  role: "global:member",
                  emailSent: true,
                },
                error: { code: "AMBIGUOUS_PROVIDER_RESULT" },
              },
            ],
            { status: 201 },
          ),
        ),
    );
    await expect(
      resolveN8nMemberIdentity("https://n8n.example.test", "student@example.test"),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });
});
