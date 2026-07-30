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
const publicIpResource = {
  externalId: "11111111-2222-4333-8444-555555555555",
  kind: "public_ip" as const,
  environmentId,
  address: "203.0.113.10",
};

describe("TimewebMutationHttpAdapter", () => {
  it("maps typed create/update/delete/reconcile calls to fixed endpoints", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          {
            ip: {
              id: publicIpResource.externalId,
              ip: publicIpResource.address,
            },
          },
          { status: 201 },
        ),
      )
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
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        Response.json({
          ip: {
            id: publicIpResource.externalId,
            ip: publicIpResource.address,
          },
        }),
      );
    const adapter = new TimewebMutationHttpAdapter(
      "synthetic-test-token",
      fetchImpl,
    );

    await expect(
      adapter.createPublicIp({
        environmentId,
        availabilityZone: "spb-3",
      }),
    ).resolves.toEqual(publicIpResource);
    await expect(
      adapter.createServer({
        environmentId,
        name: "Основная среда",
        presetId: 101,
        operatingSystemId: 202,
        availabilityZone: "spb-3",
        publicIpAddress: publicIpResource.address,
      }),
    ).resolves.toEqual(resource);
    await adapter.updateServer({ resource, name: "Переименованная среда" });
    await adapter.deleteServer(resource);
    await expect(adapter.reconcileServer(resource)).resolves.toEqual({
      state: "present",
      resource,
    });
    await adapter.deletePublicIp(publicIpResource);
    await expect(
      adapter.reconcilePublicIp(publicIpResource),
    ).resolves.toEqual({
      state: "present",
      resource: publicIpResource,
    });

    expect(
      fetchImpl.mock.calls.map(([url, init]) => ({
        url,
        method: init?.method,
        body: init?.body,
      })),
    ).toEqual([
      {
        url: "https://api.timeweb.cloud/api/v1/floating-ips",
        method: "POST",
        body: JSON.stringify({
          availability_zone: "spb-3",
          is_ddos_guard: false,
        }),
      },
      {
        url: "https://api.timeweb.cloud/api/v1/servers",
        method: "POST",
        body: JSON.stringify({
          name: "Основная среда",
          comment: `course-platform:${environmentId}`,
          preset_id: 101,
          os_id: 202,
          availability_zone: "spb-3",
          network: { floating_ip: "203.0.113.10" },
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
      {
        url: `https://api.timeweb.cloud/api/v1/floating-ips/${publicIpResource.externalId}`,
        method: "DELETE",
        body: undefined,
      },
      {
        url: `https://api.timeweb.cloud/api/v1/floating-ips/${publicIpResource.externalId}`,
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
    await expect(
      adapter.deletePublicIp({
        ...publicIpResource,
        externalId: "../account/status",
      }),
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
