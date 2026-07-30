import { describe, expect, it, vi } from "vitest";

import {
  createProductionTimewebMutationAdapter,
  TimewebMutationHttpAdapter,
} from "./mutation";
import {
  buildStarterKitCloudInit,
  COURSE_HOSTNAME,
  COURSE_SERVER_HOSTNAME,
} from "./bootstrap-profile";
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
const createServerInput = {
  environmentId,
  name: "Основная среда",
  presetId: 101,
  operatingSystemId: 202,
  availabilityZone: "spb-3",
  projectId: 303,
  sshKeyId: 404,
  bandwidthMbps: 200,
  publicIpv4: publicIpResource.address,
  serverHostname: COURSE_SERVER_HOSTNAME,
  cloudInit: buildStarterKitCloudInit(),
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
      adapter.createServer(createServerInput),
    ).resolves.toEqual(resource);
    await adapter.updateServer({ resource, name: "Переименованная среда" });
    await adapter.rebootServer(resource);
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
          bandwidth: 200,
          network: { floating_ip: publicIpResource.address },
          cloud_init: buildStarterKitCloudInit(),
          hostname: COURSE_SERVER_HOSTNAME,
        }),
      },
      {
        url: "https://api.timeweb.cloud/api/v1/servers/54321",
        method: "PATCH",
        body: JSON.stringify({ name: "Переименованная среда" }),
      },
      {
        url: "https://api.timeweb.cloud/api/v1/servers/54321/reboot",
        method: "POST",
        body: undefined,
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

  it("creates a plain VPS without starter-kit cloud-init", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({ server: { id: 54321 } }, { status: 201 }),
    );
    const adapter = new TimewebMutationHttpAdapter(
      "synthetic-test-token",
      fetchImpl,
    );

    await expect(
      adapter.createServer({
        ...createServerInput,
        deploymentMode: "plain-vps",
        serverHostname: undefined,
        cloudInit: undefined,
      }),
    ).resolves.toEqual(resource);
    const body = JSON.parse(
      String(fetchImpl.mock.calls[0]?.[1]?.body),
    ) as Record<string, unknown>;
    expect(body).not.toHaveProperty("cloud_init");
    expect(body).not.toHaveProperty("hostname");
    expect(body).toMatchObject({
      preset_id: 101,
      os_id: 202,
      availability_zone: "spb-3",
      network: { floating_ip: publicIpResource.address },
    });
  });

  it("configures weekly auto-backups on the system disk only", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          server_disks: [
            {
              id: 777,
              is_system: true,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(Response.json({ auto_backups_settings: {} }));
    const adapter = new TimewebMutationHttpAdapter(
      "synthetic-test-token",
      fetchImpl,
    );

    await adapter.configureServerAutoBackups(resource, {
      enabled: true,
      interval: "week",
      copyCount: 1,
      creationStartAt: "2026-07-31T00:00:00.000Z",
      dayOfWeek: 5,
    });

    expect(fetchImpl.mock.calls).toEqual([
      [
        "https://api.timeweb.cloud/api/v1/servers/54321/disks",
        expect.objectContaining({ method: "GET" }),
      ],
      [
        "https://api.timeweb.cloud/api/v1/servers/54321/disks/777/auto-backups",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            is_enabled: true,
            interval: "week",
            copy_count: 1,
            creation_start_at: "2026-07-31T00:00:00.000Z",
            day_of_week: 5,
          }),
        }),
      ],
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
    await expect(
      adapter.deleteDnsRecord({
        externalId: "../account/status",
        kind: "dns_record",
        environmentId,
        zone: "neurokurs.ru",
        hostname: COURSE_HOSTNAME,
        type: "A",
        value: publicIpResource.address,
        ttl: 600,
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

  it("creates, lists, reconciles and deletes only a typed DNS A record", async () => {
    const record = {
      externalId: "77",
      kind: "dns_record" as const,
      environmentId,
      zone: "neurokurs.ru",
      hostname: COURSE_HOSTNAME,
      type: "A" as const,
      value: publicIpResource.address,
      ttl: 600,
    };
    const providerRecord = {
      id: 77,
      type: "A",
      data: { subdomain: "n8n", value: publicIpResource.address },
      ttl: 600,
    };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          meta: { total: 2 },
          dns_records: [
            providerRecord,
            {
              id: 79,
              type: "TXT",
              data: { subdomain: "n8n", value: "verification-token" },
              ttl: 600,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          meta: { total: 2 },
          dns_records: [
            providerRecord,
            {
              id: 79,
              type: "TXT",
              data: { subdomain: "n8n", value: "verification-token" },
              ttl: 600,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ dns_record: { id: 77 } }, { status: 201 }),
      )
      .mockResolvedValueOnce(
        Response.json({
          meta: { total: 1 },
          dns_records: [providerRecord],
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const adapter = new TimewebMutationHttpAdapter(
      "synthetic-test-token",
      fetchImpl,
    );

    await expect(
      adapter.listDnsRecords({
        environmentId,
        zone: "neurokurs.ru",
        hostname: COURSE_HOSTNAME,
      }),
    ).resolves.toEqual([record]);
    await expect(
      adapter.listDnsConflictingHostnames({
        environmentId,
        zone: "neurokurs.ru",
        hostname: COURSE_HOSTNAME,
      }),
    ).resolves.toEqual([COURSE_HOSTNAME]);
    await expect(
      adapter.createDnsARecord({
        environmentId,
        zone: "neurokurs.ru",
        hostname: COURSE_HOSTNAME,
        value: publicIpResource.address,
        ttl: 600,
      }),
    ).resolves.toEqual(record);
    await expect(adapter.reconcileDnsRecord(record)).resolves.toEqual({
      state: "present",
    });
    await adapter.deleteDnsRecord(record);

    expect(
      fetchImpl.mock.calls.map(([url, init]) => ({
        url,
        method: init?.method,
        body: init?.body,
      })),
    ).toEqual([
      {
        url:
          "https://api.timeweb.cloud/api/v1/domains/n8n.neurokurs.ru/" +
          "dns-records?limit=100&offset=0",
        method: "GET",
        body: undefined,
      },
      {
        url:
          "https://api.timeweb.cloud/api/v1/domains/n8n.neurokurs.ru/" +
          "dns-records?limit=100&offset=0",
        method: "GET",
        body: undefined,
      },
      {
        url:
          "https://api.timeweb.cloud/api/v2/domains/" +
          "n8n.neurokurs.ru/dns-records",
        method: "POST",
        body: JSON.stringify({
          type: "A",
          value: publicIpResource.address,
          ttl: 600,
        }),
      },
      {
        url:
          "https://api.timeweb.cloud/api/v1/domains/n8n.neurokurs.ru/" +
          "dns-records?limit=100&offset=0",
        method: "GET",
        body: undefined,
      },
      {
        url:
          "https://api.timeweb.cloud/api/v2/domains/" +
          "n8n.neurokurs.ru/dns-records/77",
        method: "DELETE",
        body: undefined,
      },
    ]);
  });

  it("reads every exact-FQDN DNS page and rejects changing totals", async () => {
    const page = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      type: "A",
      data: {
        subdomain: "n8n",
        value: `203.0.113.${(index % 200) + 1}`,
      },
      ttl: 600,
    }));
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ meta: { total: 101 }, dns_records: page }),
      )
      .mockResolvedValueOnce(
        Response.json({
          meta: { total: 101 },
          dns_records: [
            {
              id: 101,
              type: "A",
              data: { subdomain: "n8n", value: "203.0.113.201" },
              ttl: 600,
            },
          ],
        }),
      );
    const adapter = new TimewebMutationHttpAdapter(
      "synthetic-test-token",
      fetchImpl,
    );

    await expect(
      adapter.listDnsRecords({
        environmentId,
        zone: "neurokurs.ru",
        hostname: COURSE_HOSTNAME,
      }),
    ).resolves.toHaveLength(101);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      "https://api.timeweb.cloud/api/v1/domains/n8n.neurokurs.ru/" +
        "dns-records?limit=100&offset=0",
      "https://api.timeweb.cloud/api/v1/domains/n8n.neurokurs.ru/" +
        "dns-records?limit=100&offset=100",
    ]);

    const changingTotalAdapter = new TimewebMutationHttpAdapter(
      "synthetic-test-token",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          Response.json({ meta: { total: 101 }, dns_records: page }),
        )
        .mockResolvedValueOnce(
          Response.json({ meta: { total: 102 }, dns_records: [] }),
        ),
    );
    await expect(
      changingTotalAdapter.listDnsRecords({
        environmentId,
        zone: "neurokurs.ru",
        hostname: COURSE_HOSTNAME,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      retryable: false,
    });

    for (const payload of [
      { dns_records: [] },
      { meta: { total: 1_001 }, dns_records: [] },
    ]) {
      const invalidMetaAdapter = new TimewebMutationHttpAdapter(
        "synthetic-test-token",
        vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload)),
      );
      await expect(
        invalidMetaAdapter.listDnsRecords({
          environmentId,
          zone: "neurokurs.ru",
          hostname: COURSE_HOSTNAME,
        }),
      ).rejects.toMatchObject({
        code: "INVALID_RESPONSE",
        retryable: false,
      });
    }
  });

  it("reads every documented server page when recovering an owned marker", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      comment: `unowned-${index + 1}`,
    }));
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ meta: { total: 101 }, servers: firstPage }),
      )
      .mockResolvedValueOnce(
        Response.json({
          meta: { total: 101 },
          servers: [
            {
              id: 54321,
              comment: `course-platform:${environmentId}`,
            },
          ],
        }),
      );
    const adapter = new TimewebMutationHttpAdapter(
      "synthetic-test-token",
      fetchImpl,
    );

    await expect(
      adapter.findServerByEnvironmentId(environmentId),
    ).resolves.toEqual(resource);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      "https://api.timeweb.cloud/api/v1/servers?limit=100&offset=0",
      "https://api.timeweb.cloud/api/v1/servers?limit=100&offset=100",
    ]);
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

    const softwareInstallAdapter = new TimewebMutationHttpAdapter(
      "synthetic-test-token",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json({
            server: { id: 54321, status: "software_install" },
          }),
        ),
    );
    await expect(
      softwareInstallAdapter.reconcileServer(resource),
    ).resolves.toEqual({
      state: "present",
      resource,
      status: { state: "supported", value: "software_install" },
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

  it("treats documented delete-confirmation HTTP 423 as a permanent gate", async () => {
    const adapter = new TimewebMutationHttpAdapter(
      "synthetic-test-token",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 423 })),
    );

    await expect(adapter.deleteServer(resource)).rejects.toMatchObject({
      code: "FORBIDDEN",
      retryable: false,
    });
  });

  it("classifies provider validation errors as permanent", async () => {
    const adapter = new TimewebMutationHttpAdapter(
      "synthetic-test-token",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({ message: "validation details" }, { status: 400 }),
      ),
    );
    await expect(
      adapter.createServer({ ...createServerInput, name: "Disposable smoke" }),
    ).rejects.toMatchObject({
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
      .createServer({ ...createServerInput, name: "Disposable smoke" })
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
          },
          fetchImpl,
        ),
      ).toBeNull();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
