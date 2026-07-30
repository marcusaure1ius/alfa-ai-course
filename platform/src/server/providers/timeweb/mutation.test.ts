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
        new Response(JSON.stringify({ server: { id: 54321 } }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ server: { id: 54321, status: "on" } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          ips: [
            {
              id: publicIpResource.externalId,
              ip: publicIpResource.address,
              resource_type: "server",
              resource_id: 54321,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        Response.json({
          ip: {
            id: publicIpResource.externalId,
            ip: publicIpResource.address,
            availability_zone: "spb-3",
            resource_type: "server",
            resource_id: 54321,
          },
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
        availabilityZone: "spb-3",
        projectId: 303,
        sshKeyId: 404,
      }),
    ).resolves.toEqual(resource);
    await adapter.updateServer({ resource, name: "Переименованная среда" });
    await adapter.deleteServer(resource);
    await expect(adapter.reconcileServer(resource)).resolves.toEqual({
      state: "present",
      resource,
      status: { state: "supported", value: "on" },
    });
    await expect(adapter.findPublicIpByServer(resource)).resolves.toEqual(
      publicIpResource,
    );
    await adapter.deletePublicIp(publicIpResource);
    await expect(
      adapter.reconcilePublicIp(publicIpResource),
    ).resolves.toEqual({
      state: "present",
      resource: {
        ...publicIpResource,
        availabilityZone: "spb-3",
        resourceType: "server",
        resourceId: "54321",
      },
      binding: {
        resourceType: "server",
        resourceId: "54321",
      },
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
          comment: `course-platform:${environmentId}`,
          preset_id: 101,
          os_id: 202,
          availability_zone: "spb-3",
          project_id: 303,
          ssh_keys_ids: [404],
          is_root_password_required: false,
          is_local_network: false,
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
        url: "https://api.timeweb.cloud/api/v1/floating-ips",
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

  it("creates, lists and binds a floating IP through fixed allowlisted endpoints", async () => {
    const candidate = {
      id: publicIpResource.externalId,
      ip: publicIpResource.address,
      availability_zone: "spb-3",
      resource_type: null,
      resource_id: null,
    };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ ips: [candidate] }))
      .mockResolvedValueOnce(Response.json({ ip: candidate }, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const adapter = new TimewebMutationHttpAdapter(
      "synthetic-test-token",
      fetchImpl,
    );

    await expect(adapter.listPublicIps(environmentId)).resolves.toEqual([
      {
        ...publicIpResource,
        availabilityZone: "spb-3",
        resourceType: null,
        resourceId: null,
      },
    ]);
    await expect(
      adapter.createPublicIp({
        environmentId,
        availabilityZone: "spb-3",
      }),
    ).resolves.toEqual(publicIpResource);
    await adapter.bindPublicIp(publicIpResource, resource);

    expect(
      fetchImpl.mock.calls.map(([url, init]) => ({
        url,
        method: init?.method,
        body: init?.body,
      })),
    ).toEqual([
      {
        url: "https://api.timeweb.cloud/api/v1/floating-ips",
        method: "GET",
        body: undefined,
      },
      {
        url: "https://api.timeweb.cloud/api/v1/floating-ips",
        method: "POST",
        body: JSON.stringify({
          is_ddos_guard: false,
          availability_zone: "spb-3",
        }),
      },
      {
        url:
          `https://api.timeweb.cloud/api/v1/floating-ips/` +
          `${publicIpResource.externalId}/bind`,
        method: "POST",
        body: JSON.stringify({
          resource_type: "server",
          resource_id: 54321,
        }),
      },
    ]);
  });

  it("rejects an unsafe provider server ID before binding a floating IP", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const adapter = new TimewebMutationHttpAdapter(
      "synthetic-test-token",
      fetchImpl,
    );

    await expect(
      adapter.bindPublicIp(publicIpResource, {
        ...resource,
        externalId: "9999999999999999999",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      retryable: false,
    });
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

  it("preserves a non-ready provider status during reconciliation", async () => {
    const adapter = new TimewebMutationHttpAdapter(
      "synthetic-test-token",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json({ server: { id: 54321, status: "installing" } }),
        ),
    );
    await expect(adapter.reconcileServer(resource)).resolves.toEqual({
      state: "present",
      resource,
      status: { state: "supported", value: "installing" },
    });
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

  it("classifies provider validation errors as permanent", async () => {
    const adapter = new TimewebMutationHttpAdapter(
      "synthetic-test-token",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({ message: "validation details" }, { status: 400 }),
      ),
    );
    await expect(adapter.createServer({
      environmentId,
      name: "Disposable smoke",
      presetId: 101,
      operatingSystemId: 202,
      availabilityZone: "spb-3",
      projectId: 303,
      sshKeyId: 404,
    })).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      retryable: false,
    });
  });

  it("retains only a bounded provider error code for conflict diagnostics", async () => {
    const adapter = new TimewebMutationHttpAdapter(
      "synthetic-test-token",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          {
            error_code: "server_configuration_conflict",
            message: "secret provider diagnostic",
          },
          { status: 409 },
        ),
      ),
    );
    const error = await adapter
      .createServer({
        environmentId,
        name: "Disposable smoke",
        presetId: 101,
        operatingSystemId: 202,
        availabilityZone: "spb-3",
        projectId: 303,
        sshKeyId: 404,
      })
      .catch((caught) => caught);
    expect(error).toMatchObject({
      code: "INVALID_REQUEST",
      retryable: false,
    });
    expect(error.message).toContain("code server_configuration_conflict");
    expect(error.message).not.toContain("secret provider diagnostic");
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
