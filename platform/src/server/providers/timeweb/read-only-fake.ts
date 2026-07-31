import "server-only";

import {
  TIMEWEB_READ_DTO_VERSION,
  type TimewebCatalogSnapshot,
  type TimewebReadAdapter,
} from "./contracts";

const FAKE_PRESET_SHAPES = [
  { cpu: 2, ramMb: 2_048, diskMb: 40_960, priceRoubles: 800 },
  { cpu: 2, ramMb: 4_096, diskMb: 51_200, priceRoubles: 1_000 },
  { cpu: 4, ramMb: 8_192, diskMb: 81_920, priceRoubles: 1_800 },
  { cpu: 8, ramMb: 12_288, diskMb: 102_400, priceRoubles: 2_900 },
  { cpu: 8, ramMb: 16_384, diskMb: 163_840, priceRoubles: 4_300 },
] as const;

function fakePresets() {
  return [
    { region: "ru-3", tag: "msk_nvme", startId: 4_799, multiplier: 1 },
    { region: "nl-1", tag: "nl_base", startId: 3_344, multiplier: 2.1 },
    { region: "de-1", tag: "fra_nvme", startId: 6_063, multiplier: 4.03 },
  ].flatMap((region) =>
    FAKE_PRESET_SHAPES.map((shape, index) => ({
      id: String(region.startId + index),
      region: region.region,
      tags: ["site", "cp", region.tag],
      priceRoubles: Math.round(shape.priceRoubles * region.multiplier),
      cpu: shape.cpu,
      ramMb: shape.ramMb,
      diskMb: shape.diskMb,
      diskType: "nvme",
      bandwidthMbps: region.region === "de-1" ? 200 : 1_000,
    })),
  );
}

export class FakeTimewebReadAdapter implements TimewebReadAdapter {
  readonly version = TIMEWEB_READ_DTO_VERSION;

  async discover(): Promise<TimewebCatalogSnapshot> {
    return {
      version: this.version,
      source: "fake",
      checkedAt: new Date().toISOString(),
      degraded: false,
      account: { state: "ready" },
      balance: { amount: 2_500, currency: "RUB", monthlyFeeRoubles: 0 },
      servers: [],
      presets: fakePresets(),
      operatingSystems: [
        {
          id: "202",
          family: "linux",
          name: "Ubuntu",
          version: "26.04",
        },
        {
          id: "201",
          family: "linux",
          name: "Ubuntu",
          version: "24.04",
        },
      ],
      locations: [
        {
          region: "ru-3",
          countryCode: "ru",
          zones: ["msk-1"],
        },
        {
          region: "nl-1",
          countryCode: "nl",
          zones: ["ams-1"],
        },
        {
          region: "de-1",
          countryCode: "de",
          zones: ["fra-1"],
        },
      ],
      floatingIps: [],
      publicIpMonthlyRoubles: 180,
      projects: [{ id: "1", name: "Fake disposable project" }],
      sshKeys: [{ id: "1", name: "Fake smoke SSH key" }],
      capabilities: {
        servers: true,
        presets: true,
        operatingSystems: true,
        locations: true,
        balance: true,
        accountStatus: true,
        floatingIps: true,
        serviceCosts: true,
        projects: true,
        sshKeys: true,
        tokenPermissions: {
          serviceScope: "manual-verification-required",
          deleteWithoutConfirmation: "manual-verification-required",
          actionLevelPermissions: "not-documented",
        },
      },
    };
  }
}
