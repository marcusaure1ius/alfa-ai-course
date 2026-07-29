import { describe, expect, it, vi } from "vitest";

import {
  createProductionTimewebMutationAdapter,
  TimewebMutationHttpAdapter,
} from "./mutation";
import { TimewebProviderError } from "./read-only";

const environmentId = "11111111-1111-4111-8111-111111111111";
const resource = {
  externalId: "54321",
  kind: "server" as const,
  environmentId,
};

describe("TimewebMutationHttpAdapter", () => {
  it("maps typed create/update/delete/reconcile calls to fixed endpoints", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ server: { id: 54321 } }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ server: { id: 54321 } }), {
          status: 200,
        }),
      );
    const adapter = new TimewebMutationHttpAdapter(
      "synthetic-test-token",
      fetchImpl,
    );

    await expect(
      adapter.createServer({
        environmentId,
        name: "Основная среда",
        presetId: 101,
        operatingSystemId: 202,
      }),
    ).resolves.toEqual(resource);
    await adapter.updateServer({ resource, name: "Переименованная среда" });
    await adapter.deleteServer(resource);
    await expect(adapter.reconcileServer(resource)).resolves.toEqual({
      state: "present",
      resource,
    });

    expect(
      fetchImpl.mock.calls.map(([url, init]) => ({
        url,
        method: init?.method,
        body: init?.body,
      })),
    ).toEqual([
      {
        url: "https://api.timeweb.cloud/api/v1/servers",
        method: "POST",
        body: JSON.stringify({
          name: "Основная среда",
          preset_id: 101,
          os_id: 202,
        }),
      },
      {
        url: "https://api.timeweb.cloud/api/v1/servers/54321",
        method: "PATCH",
        body: JSON.stringify({ name: "Переименованная среда" }),
      },
      {
        url: "https://api.timeweb.cloud/api/v1/servers/54321",
        method: "DELETE",
        body: undefined,
      },
      {
        url: "https://api.timeweb.cloud/api/v1/servers/54321",
        method: "GET",
        body: undefined,
      },
    ]);
  });

  it("rejects attacker-controlled provider IDs before fetch", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const adapter = new TimewebMutationHttpAdapter(
      "synthetic-test-token",
      fetchImpl,
    );
    await expect(
      adapter.deleteServer({ ...resource, externalId: "../account/status" }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("treats only a provider 404 as an absent reconciliation result", async () => {
    const absentAdapter = new TimewebMutationHttpAdapter(
      "synthetic-test-token",
      vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 })),
    );
    await expect(absentAdapter.reconcileServer(resource)).resolves.toEqual({
      state: "absent",
    });

    const unavailableAdapter = new TimewebMutationHttpAdapter(
      "synthetic-test-token",
      vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 })),
    );
    await expect(
      unavailableAdapter.reconcileServer(resource),
    ).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE", retryable: true });
  });

  it("redacts provider bodies and tokens from typed errors", async () => {
    const adapter = new TimewebMutationHttpAdapter(
      "synthetic-test-token",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: "secret provider diagnostic",
            token: "leaked-token",
          }),
          { status: 403 },
        ),
      ),
    );
    const error = await adapter.deleteServer(resource).catch((caught) => caught);
    expect(error).toBeInstanceOf(TimewebProviderError);
    expect(JSON.stringify(error)).not.toMatch(
      /synthetic-test-token|secret provider diagnostic|leaked-token/,
    );
  });
});

describe("createProductionTimewebMutationAdapter", () => {
  it("does not construct or call a real adapter in test, preview or development", () => {
    const fetchImpl = vi.fn<typeof fetch>();
    for (const vercelEnvironment of ["test", "preview", "development"]) {
      expect(
        createProductionTimewebMutationAdapter(
          {
            VERCEL_ENV: vercelEnvironment,
            PLATFORM_PROVIDER: "timeweb",
            TIMEWEB_API_TOKEN: "synthetic-test-token",
            TIMEWEB_MUTATIONS_ENABLED: "true",
            TIMEWEB_CAPABILITIES_VERIFIED: "true",
          },
          fetchImpl,
        ),
      ).toBeNull();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
