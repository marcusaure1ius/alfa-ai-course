import "server-only";

import {
  TIMEWEB_READ_DTO_VERSION,
  type TimewebCatalogSnapshot,
  type TimewebReadAdapter,
} from "./contracts";

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
      presets: [
        {
          id: "101",
          region: "ru-1",
          priceRoubles: 990,
          cpu: 2,
          ramMb: 4_096,
          diskMb: 40_960,
          diskType: "nvme",
          bandwidthMbps: 200,
        },
      ],
      operatingSystems: [
        {
          id: "202",
          family: "linux",
          name: "Ubuntu",
          version: "24.04",
        },
      ],
      locations: [
        {
          region: "ru-1",
          countryCode: "ru",
          zones: ["spb-3", "spb-4"],
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
