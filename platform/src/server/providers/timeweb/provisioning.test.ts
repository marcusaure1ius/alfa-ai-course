import { describe, expect, it, vi } from "vitest";

import { getTimewebProvisioningPreview } from "./provisioning";

const SHAPES = [
  [2, 2_048, 40_960, 800],
  [2, 4_096, 51_200, 1_000],
  [4, 8_192, 81_920, 1_800],
  [8, 12_288, 102_400, 2_900],
  [8, 16_384, 163_840, 4_300],
] as const;

function presetsFor(
  location: string,
  tag: string,
  startId: number,
  multiplier = 1,
) {
  return SHAPES.map(([cpu, ram, disk, price], index) => ({
    id: startId + index,
    location,
    tags: ["site", "cp", tag],
    price: price * multiplier,
    cpu,
    ram,
    disk,
    disk_type: "nvme",
    bandwidth: location === "de-1" ? 200 : 1_000,
  }));
}

function providerPayload(url: string): unknown {
  if (url.endsWith("/account/status")) return { status: { is_blocked: false } };
  if (url.endsWith("/account/finances")) {
    return { finances: { balance: 1, currency: "RUB", monthly_fee: 181 } };
  }
  if (url.endsWith("/api/v1/servers")) return { servers: [] };
  if (url.endsWith("/presets/servers")) {
    return {
      server_presets: [
        ...presetsFor("ru-3", "msk_nvme", 4_799),
        ...presetsFor("nl-1", "nl_base", 3_344, 2),
        ...presetsFor("de-1", "fra_nvme", 6_063, 4),
        {
          id: 3_011,
          location: "ru-3",
          tags: ["site", "cp", "nsk_base"],
          price: 207,
          cpu: 1,
          ram: 1_024,
          disk: 15_360,
          disk_type: "nvme",
          bandwidth: 100,
        },
      ],
    };
  }
  if (url.endsWith("/os/servers")) {
    return {
      servers_os: [
        { id: 99, family: "linux", name: "Ubuntu", version: "24.04" },
        { id: 145, family: "linux", name: "Ubuntu", version: "26.04" },
      ],
    };
  }
  if (url.endsWith("/api/v2/locations")) {
    return {
      locations: [
        {
          location: "ru-3",
          location_code: "RU",
          availability_zones: ["msk-1"],
        },
        {
          location: "nl-1",
          location_code: "NL",
          availability_zones: ["ams-1"],
        },
        {
          location: "de-1",
          location_code: "DE",
          availability_zones: ["fra-1"],
        },
      ],
    };
  }
  if (url.endsWith("/floating-ips")) return { ips: [] };
  if (url.endsWith("/account/services/cost")) {
    return { services_costs: [{ type: "floating_ip", cost: 180 }] };
  }
  if (url.endsWith("/api/v1/projects")) {
    return { projects: [{ id: 303, name: "Course platform" }] };
  }
  if (url.endsWith("/api/v1/ssh-keys")) {
    return { ssh_keys: [{ id: 404, name: "Course key" }] };
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

function providerFetch() {
  return vi.fn<typeof fetch>(async (input) =>
    Response.json(providerPayload(String(input))),
  );
}

describe("getTimewebProvisioningPreview", () => {
  it("uses Ubuntu 26.04 and Moscow recommended Premium NVMe by default", async () => {
    const fetchImpl = providerFetch();
    const preview = await getTimewebProvisioningPreview(
      productionEnvironment,
      fetchImpl,
    );

    expect(preview).toMatchObject({
      ok: true,
      mode: "timeweb",
      catalog: {
        regions: [
          { id: "ru-3", label: "Москва", availabilityZone: "msk-1" },
          { id: "nl-1", label: "Амстердам", availabilityZone: "ams-1" },
          { id: "de-1", label: "Франкфурт", availabilityZone: "fra-1" },
        ],
        defaultSelection: {
          region: "ru-3",
          operatingSystemId: 145,
          backupsEnabled: false,
          publicIpv4: true,
        },
      },
      plan: {
        version: "timeweb-provisioning-v3",
        deploymentMode: "plain-vps",
        presetId: 4_800,
        operatingSystemId: 145,
        operatingSystemLabel: "Ubuntu 26.04 x86_64",
        region: "ru-3",
        availabilityZone: "msk-1",
        monthlyServerRoubles: 1_000,
        hourlyServerRoubles: 1.37,
        monthlyPublicIpRoubles: 180,
        monthlyTotalRoubles: 1_180,
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(10);
    if (!preview.ok) throw new Error("Expected successful preview");
    expect(preview.catalog.regions[0]!.presets).toHaveLength(5);
    expect(
      preview.catalog.regions[0]!.presets.some(
        (preset) => preset.id === 3_011,
      ),
    ).toBe(false);
  });

  it("keeps balance informational and does not use it as a deploy limit", async () => {
    await expect(
      getTimewebProvisioningPreview(productionEnvironment, providerFetch()),
    ).resolves.toMatchObject({ ok: true, mode: "timeweb" });
  });

  it("selects Frankfurt, Ubuntu 24.04 and enabled backups explicitly", async () => {
    const preview = await getTimewebProvisioningPreview(
      productionEnvironment,
      providerFetch(),
      {
        selection: {
          region: "de-1",
          presetId: 6_064,
          operatingSystemId: 99,
          backupsEnabled: true,
          publicIpv4: true,
        },
      },
    );
    expect(preview).toMatchObject({
      ok: true,
      plan: {
        regionLabel: "Франкфурт",
        availabilityZone: "fra-1",
        operatingSystemLabel: "Ubuntu 24.04 x86_64",
        backupsEnabled: true,
        backupInterval: "week",
        backupCopyCount: 1,
      },
    });
  });

  it("rejects a preset that does not belong to the selected region", async () => {
    await expect(
      getTimewebProvisioningPreview(
        productionEnvironment,
        providerFetch(),
        {
          selection: {
            region: "nl-1",
            presetId: 4_800,
            operatingSystemId: 145,
            backupsEnabled: false,
            publicIpv4: true,
          },
        },
      ),
    ).resolves.toMatchObject({ ok: false, code: "INVALID_SELECTION" });
  });

  it("fails closed when Timeweb has no current public IPv4 price", async () => {
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

  it("validates an already reserved IP against the selected zone", async () => {
    const ownedIp = {
      externalId: "11111111-2222-4333-8444-555555555555",
      address: "203.0.113.10",
    };
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith("/floating-ips")) {
        return Response.json({
          ips: [
            {
              id: ownedIp.externalId,
              ip: ownedIp.address,
              availability_zone: "msk-1",
              resource_type: null,
              resource_id: null,
            },
          ],
        });
      }
      return Response.json(providerPayload(String(input)));
    });
    await expect(
      getTimewebProvisioningPreview(
        productionEnvironment,
        fetchImpl,
        { approvedOwnedPublicIp: ownedIp },
      ),
    ).resolves.toMatchObject({ ok: true });
  });

  it("keeps fake development aligned with the same public contract", async () => {
    const preview = await getTimewebProvisioningPreview({
      VERCEL_ENV: "preview",
      PLATFORM_PROVIDER: "timeweb",
    });
    expect(preview).toMatchObject({
      ok: true,
      mode: "fake",
      plan: {
        operatingSystemLabel: "Ubuntu 26.04 x86_64",
        region: "ru-3",
      },
    });
  });
});
