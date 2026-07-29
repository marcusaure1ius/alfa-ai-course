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
      balance: { amount: 2_500, currency: "RUB" },
      servers: [
        {
          id: "fake-server-primary",
          name: "Учебная среда",
          region: "ru-1",
          zone: "spb-3",
          presetId: "fake-preset-small",
          status: { state: "supported", value: "on" },
        },
      ],
      presets: [
        {
          id: "fake-preset-small",
          region: "ru-1",
          priceRoubles: 990,
          cpu: 2,
          ramMb: 4_096,
          diskMb: 40_960,
          diskType: "nvme",
        },
      ],
      operatingSystems: [
        {
          id: "fake-ubuntu-24-04",
          family: "ubuntu",
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
      capabilities: {
        servers: true,
        presets: true,
        operatingSystems: true,
        locations: true,
        balance: true,
        accountStatus: true,
        tokenPermissions: {
          serviceScope: "manual-verification-required",
          deleteWithoutConfirmation: "manual-verification-required",
          actionLevelPermissions: "not-documented",
        },
      },
    };
  }
}
