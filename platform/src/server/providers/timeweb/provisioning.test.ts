import { describe, expect, it, vi } from "vitest";

import { getTimewebProvisioningPreview } from "./provisioning";

function providerPayload(url: string): unknown {
  if (url.endsWith("/account/status")) return { status: { is_blocked: false } };
  if (url.endsWith("/account/finances")) {
    return {
      finances: { balance: 2_000, currency: "RUB", monthly_fee: 181 },
    };
  }
  if (url.endsWith("/api/v1/servers")) return { servers: [] };
  if (url.endsWith("/presets/servers")) {
    return {
      server_presets: [
        {
          id: 42,
          location: "ru-1",
          price: 700,
          cpu: 2,
          ram: 2048,
          disk: 30720,
          disk_type: "nvme",
          bandwidth: 200,
        },
        {
          id: 99,
          location: "ru-1",
          price: 1_100,
          cpu: 4,
          ram: 4096,
          disk: 51200,
          disk_type: "nvme",
          bandwidth: 300,
        },
        {
          id: 77,
          location: "ru-2",
          price: 750,
          cpu: 2,
          ram: 2048,
          disk: 30720,
          disk_type: "nvme",
          bandwidth: 200,
        },
      ],
    };
  }
  if (url.endsWith("/os/servers")) {
    return {
      servers_os: [
        { id: 24, family: "linux", name: "Ubuntu", version: "24.04 LTS" },
      ],
    };
  }
  if (url.endsWith("/api/v2/locations")) {
    return {
      locations: [
        {
          location: "ru-1",
          location_code: "RU",
          availability_zones: ["spb-3"],
        },
        {
          location: "ru-2",
          location_code: "RU",
          availability_zones: ["nsk-1"],
        },
      ],
    };
  }
  if (url.endsWith("/floating-ips")) return { ips: [] };
  if (url.endsWith("/account/services/cost")) {
    return { services_costs: [{ type: "floating_ip", cost: 180 }] };
  }
  if (url.endsWith("/api/v1/projects")) {
    return { projects: [{ id: 303, name: "Disposable smoke" }] };
  }
  if (url.endsWith("/api/v1/ssh-keys")) {
    return { ssh_keys: [{ id: 404, name: "Smoke key" }] };
  }
  if (url.includes("/domains/n8n.neurokurs.ru/dns-records?")) {
    return { meta: { total: 0 }, dns_records: [] };
  }
  throw new Error(`Unexpected URL ${url}`);
}

const productionEnvironment = {
  VERCEL_ENV: "production",
  PLATFORM_PROVIDER: "timeweb",
  TIMEWEB_API_TOKEN: "synthetic-test-token",
  TIMEWEB_MUTATIONS_ENABLED: "true",
  TIMEWEB_CAPABILITIES_VERIFIED: "true",
  TIMEWEB_SMOKE_EXCLUSIVE_ACCOUNT: "true",
  TIMEWEB_SMOKE_EXCLUSIVE_DNS_HOSTNAME: "true",
  TIMEWEB_SMOKE_PROJECT_ID: "303",
  TIMEWEB_SMOKE_SSH_KEY_ID: "404",
};

describe("getTimewebProvisioningPreview", () => {
  it("keeps the non-production fake preview aligned with the live OS contract", async () => {
    const preview = await getTimewebProvisioningPreview({
      VERCEL_ENV: "preview",
      PLATFORM_PROVIDER: "timeweb",
    });

    expect(preview).toMatchObject({
      ok: true,
      mode: "fake",
      plan: {
        operatingSystemId: 202,
        operatingSystemLabel: "Ubuntu 24.04 x86_64",
      },
    });
  });

  it("selects current Ubuntu 24.04, the cheapest compatible preset and live price", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) =>
      Response.json(providerPayload(String(input))),
    );
    const preview = await getTimewebProvisioningPreview(
      productionEnvironment,
      fetchImpl,
    );

    expect(preview).toEqual({
      ok: true,
      mode: "timeweb",
      plan: expect.objectContaining({
        presetId: 42,
        operatingSystemId: 24,
        operatingSystemLabel: "Ubuntu 24.04 LTS x86_64",
        availabilityZone: "spb-3",
        monthlyServerRoubles: 700,
        cpu: 2,
        ramMb: 2048,
        diskMb: 30720,
        diskType: "nvme",
        bandwidthMbps: 200,
        monthlyPublicIpRoubles: 180,
        monthlyTotalRoubles: 880,
        requiredBalanceRoubles: 1_061,
        balanceRoubles: 2_000,
        projectId: 303,
        sshKeyId: 404,
      }),
    });
    expect(fetchImpl).toHaveBeenCalledTimes(11);
  });

  it("keeps provider pricing and balance informational instead of blocking mutation", async () => {
    const preview = await getTimewebProvisioningPreview(
      productionEnvironment,
      vi.fn<typeof fetch>(async (input) => {
        if (String(input).endsWith("/account/finances")) {
          return Response.json({
            finances: {
              balance: 1_000,
              currency: "RUB",
              monthly_fee: 181,
            },
          });
        }
        return Response.json(providerPayload(String(input)));
      }),
    );

    expect(preview).toMatchObject({
      ok: true,
      mode: "timeweb",
      plan: {
        balanceRoubles: 1_000,
        requiredBalanceRoubles: 1_061,
      },
    });
  });

  it("does not count an exact already-billed owned IP twice on repeated preflight", async () => {
    const ownedIp = {
      externalId: "11111111-2222-4333-8444-555555555555",
      address: "203.0.113.10",
    };
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/account/finances")) {
        return Response.json({
          finances: {
            balance: 1_100,
            currency: "RUB",
            monthly_fee: 361,
          },
        });
      }
      if (url.endsWith("/floating-ips")) {
        return Response.json({
          ips: [
            {
              id: ownedIp.externalId,
              ip: ownedIp.address,
              availability_zone: "spb-3",
              resource_type: null,
              resource_id: null,
            },
          ],
        });
      }
      return Response.json(providerPayload(url));
    });

    await expect(
      getTimewebProvisioningPreview(
        productionEnvironment,
        fetchImpl,
        { approvedOwnedPublicIp: ownedIp },
      ),
    ).resolves.toMatchObject({
      ok: true,
      mode: "timeweb",
      plan: { requiredBalanceRoubles: 1_061 },
    });
    await expect(
      getTimewebProvisioningPreview(productionEnvironment, fetchImpl),
    ).resolves.toMatchObject({
      ok: true,
      mode: "timeweb",
      plan: { requiredBalanceRoubles: 1_241 },
    });
  });

  it("fails repeated preflight for an absent, bound or wrong-zone durable IP", async () => {
    const ownedIp = {
      externalId: "11111111-2222-4333-8444-555555555555",
      address: "203.0.113.10",
    };
    const candidates = [
      [],
      [
        {
          id: ownedIp.externalId,
          ip: ownedIp.address,
          availability_zone: "spb-4",
          resource_type: null,
          resource_id: null,
        },
      ],
      [
        {
          id: ownedIp.externalId,
          ip: ownedIp.address,
          availability_zone: "spb-3",
          resource_type: "server",
          resource_id: 999,
        },
      ],
    ];

    for (const ips of candidates) {
      const preview = await getTimewebProvisioningPreview(
        productionEnvironment,
        vi.fn<typeof fetch>(async (input) => {
          if (String(input).endsWith("/floating-ips")) {
            return Response.json({ ips });
          }
          return Response.json(providerPayload(String(input)));
        }),
        { approvedOwnedPublicIp: ownedIp },
      );
      expect(preview).toEqual({
        ok: false,
        code: "PUBLIC_IP_OWNERSHIP_INVALID",
        message:
          "Owned floating IP отсутствует, перемещён или уже привязан к другому ресурсу.",
      });
    }
  });

  it("selects the cheapest live preset in an owner-selected region", async () => {
    const preview = await getTimewebProvisioningPreview(
      { ...productionEnvironment, TIMEWEB_SMOKE_REGION: "ru-2" },
      vi.fn<typeof fetch>(async (input) =>
        Response.json(providerPayload(String(input))),
      ),
    );
    expect(preview).toMatchObject({
      ok: true,
      mode: "timeweb",
      plan: {
        presetId: 77,
        region: "ru-2",
        availabilityZone: "nsk-1",
        monthlyTotalRoubles: 930,
      },
    });
  });

  it("fails closed for an invalid configured region", async () => {
    const preview = await getTimewebProvisioningPreview(
      { ...productionEnvironment, TIMEWEB_SMOKE_REGION: "ru_2" },
      vi.fn<typeof fetch>(async (input) =>
        Response.json(providerPayload(String(input))),
      ),
    );
    expect(preview).toEqual({
      ok: false,
      code: "SMOKE_REGION_UNAVAILABLE",
      message: "Настроенный smoke region имеет недопустимый формат.",
    });
  });

  it("fails closed when Timeweb API has no current public IPv4 price", async () => {
    const preview = await getTimewebProvisioningPreview(
      productionEnvironment,
      vi.fn<typeof fetch>(async (input) => {
        if (String(input).endsWith("/account/services/cost")) {
          return Response.json({ services_costs: [] });
        }
        return Response.json(providerPayload(String(input)));
      }),
    );
    expect(preview).toMatchObject({
      ok: false,
      code: "PUBLIC_IP_PRICE_NOT_CONFIGURED",
    });
  });

  it("fails closed when the approved hostname already has an A record", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      if (
        String(input).includes(
          "/domains/n8n.neurokurs.ru/dns-records?",
        )
      ) {
        return Response.json({
          meta: { total: 1 },
          dns_records: [
            {
              id: 77,
              type: "A",
              data: { subdomain: "n8n", value: "203.0.113.10" },
              ttl: 600,
            },
          ],
        });
      }
      return Response.json(providerPayload(String(input)));
    });
    const preview = await getTimewebProvisioningPreview(
      productionEnvironment,
      fetchImpl,
    );
    expect(preview).toEqual({
      ok: false,
      code: "DNS_HOSTNAME_CONFLICT",
      message: "Approved hostname уже содержит DNS A record.",
    });
    await expect(
      getTimewebProvisioningPreview(
        productionEnvironment,
        fetchImpl,
        {
          approvedOwnedDns: {
            environmentId: "11111111-1111-4111-8111-111111111111",
            externalId: "77",
            address: "203.0.113.10",
          },
        },
      ),
    ).resolves.toMatchObject({ ok: true, mode: "timeweb" });

    const approvedOwnedDns = {
      environmentId: "11111111-1111-4111-8111-111111111111",
      externalId: "77",
      address: "203.0.113.10",
    };
    await expect(
      getTimewebProvisioningPreview(
        productionEnvironment,
        vi.fn<typeof fetch>(async (input) =>
          Response.json(providerPayload(String(input))),
        ),
        { approvedOwnedDns },
      ),
    ).resolves.toMatchObject({
      ok: false,
      code: "DNS_HOSTNAME_CONFLICT",
    });
    await expect(
      getTimewebProvisioningPreview(
        productionEnvironment,
        fetchImpl,
        {
          approvedOwnedDns: {
            ...approvedOwnedDns,
            externalId: "78",
          },
        },
      ),
    ).resolves.toMatchObject({
      ok: false,
      code: "DNS_HOSTNAME_CONFLICT",
    });
    const duplicateFetch = vi.fn<typeof fetch>(async (input) => {
      if (
        String(input).includes(
          "/domains/n8n.neurokurs.ru/dns-records?",
        )
      ) {
        return Response.json({
          meta: { total: 2 },
          dns_records: [
            {
              id: 77,
              type: "A",
              data: { subdomain: "n8n", value: "203.0.113.10" },
              ttl: 600,
            },
            {
              id: 78,
              type: "A",
              data: { subdomain: "n8n", value: "203.0.113.11" },
              ttl: 600,
            },
          ],
        });
      }
      return Response.json(providerPayload(String(input)));
    });
    await expect(
      getTimewebProvisioningPreview(
        productionEnvironment,
        duplicateFetch,
        { approvedOwnedDns },
      ),
    ).resolves.toMatchObject({
      ok: false,
      code: "DNS_HOSTNAME_CONFLICT",
    });
  });
});
