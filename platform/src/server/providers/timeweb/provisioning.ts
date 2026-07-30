import "server-only";

import type { TimewebCatalogSnapshot } from "./contracts";
import { createTimewebReadAdapter } from "./read-service";
import { readTimewebMutationRuntimeGate } from "./runtime";

const PUBLIC_IPV4_MONTHLY_ROUBLES = 180;

export type TimewebProvisioningPlan = Readonly<{
  version: "timeweb-provisioning-v1";
  checkedAt: string;
  presetId: number;
  operatingSystemId: number;
  operatingSystemLabel: string;
  region: string;
  availabilityZone: string;
  monthlyServerRoubles: number;
  cpu: number;
  ramMb: number;
  diskMb: number;
  diskType: string;
  monthlyPublicIpRoubles: number;
  monthlyTotalRoubles: number;
  balanceRoubles: number;
  floatingIpIdsBefore: readonly string[];
}>;

export type TimewebProvisioningPreview =
  | Readonly<{
      ok: true;
      mode: "fake" | "timeweb";
      plan: TimewebProvisioningPlan;
    }>
  | Readonly<{
      ok: false;
      code:
        | "MUTATION_GATE_CLOSED"
        | "ACCOUNT_BLOCKED"
        | "CATALOG_DEGRADED"
        | "ACTIVE_SERVER_LIMIT"
        | "UBUNTU_2404_UNAVAILABLE"
        | "PRESET_UNAVAILABLE"
        | "BUDGET_NOT_CONFIGURED"
        | "BUDGET_EXCEEDED"
        | "INSUFFICIENT_FUNDS";
      message: string;
    }>;

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

function positiveInteger(value: string): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function selectPlan(
  catalog: TimewebCatalogSnapshot,
  budgetRoubles: number | null,
): TimewebProvisioningPreview {
  if (catalog.account.state !== "ready") {
    return {
      ok: false,
      code: "ACCOUNT_BLOCKED",
      message: "Timeweb account заблокирован для создания ресурсов.",
    };
  }
  if (catalog.degraded) {
    return {
      ok: false,
      code: "CATALOG_DEGRADED",
      message: "Provider catalog устарел или содержит неизвестные состояния.",
    };
  }
  if (catalog.servers.length > 0) {
    return {
      ok: false,
      code: "ACTIVE_SERVER_LIMIT",
      message: "В Timeweb account уже есть VPS; hard limit smoke равен одному.",
    };
  }

  const operatingSystem = catalog.operatingSystems.find(
    (candidate) =>
      candidate.family.toLowerCase() === "ubuntu" &&
      candidate.version.trim().startsWith("24.04"),
  );
  const operatingSystemId = operatingSystem
    ? positiveInteger(operatingSystem.id)
    : null;
  if (!operatingSystem || !operatingSystemId) {
    return {
      ok: false,
      code: "UBUNTU_2404_UNAVAILABLE",
      message: "В актуальном каталоге нет Ubuntu 24.04 x86_64.",
    };
  }

  const options = catalog.presets
    .map((preset) => {
      const location = catalog.locations.find(
        (candidate) =>
          candidate.region === preset.region && candidate.zones.length > 0,
      );
      const presetId = positiveInteger(preset.id);
      return location && presetId
        ? { preset, presetId, zone: location.zones[0]! }
        : null;
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value))
    .sort(
      (left, right) =>
        left.preset.priceRoubles - right.preset.priceRoubles ||
        left.presetId - right.presetId,
    );
  const selected = options[0];
  if (!selected) {
    return {
      ok: false,
      code: "PRESET_UNAVAILABLE",
      message: "Нет совместимого тарифа и зоны для disposable smoke.",
    };
  }

  const monthlyTotalRoubles =
    selected.preset.priceRoubles + PUBLIC_IPV4_MONTHLY_ROUBLES;
  if (catalog.source === "timeweb" && budgetRoubles == null) {
    return {
      ok: false,
      code: "BUDGET_NOT_CONFIGURED",
      message: "Не задан owner-approved TIMEWEB_SMOKE_BUDGET_RUB.",
    };
  }
  if (budgetRoubles != null && monthlyTotalRoubles > budgetRoubles) {
    return {
      ok: false,
      code: "BUDGET_EXCEEDED",
      message: "Актуальная месячная оценка превышает smoke budget.",
    };
  }
  if (catalog.balance.amount < monthlyTotalRoubles) {
    return {
      ok: false,
      code: "INSUFFICIENT_FUNDS",
      message: "Баланса недостаточно для месячной оценки VPS и IPv4.",
    };
  }

  return {
    ok: true,
    mode: catalog.source,
    plan: {
      version: "timeweb-provisioning-v1",
      checkedAt: catalog.checkedAt,
      presetId: selected.presetId,
      operatingSystemId,
      operatingSystemLabel: `${operatingSystem.name} ${operatingSystem.version} x86_64`,
      region: selected.preset.region,
      availabilityZone: selected.zone,
      monthlyServerRoubles: selected.preset.priceRoubles,
      cpu: selected.preset.cpu,
      ramMb: selected.preset.ramMb,
      diskMb: selected.preset.diskMb,
      diskType: selected.preset.diskType,
      monthlyPublicIpRoubles: PUBLIC_IPV4_MONTHLY_ROUBLES,
      monthlyTotalRoubles,
      balanceRoubles: catalog.balance.amount,
      floatingIpIdsBefore: catalog.floatingIps.map((ip) => ip.id),
    },
  };
}

export async function getTimewebProvisioningPreview(
  environment: ServerEnvironment = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<TimewebProvisioningPreview> {
  const { gate, adapter } = createTimewebReadAdapter(environment, fetchImpl);
  if (!adapter) {
    return {
      ok: false,
      code: "MUTATION_GATE_CLOSED",
      message: "Production Timeweb token не настроен.",
    };
  }
  if (
    environment.VERCEL_ENV === "production" &&
    readTimewebMutationRuntimeGate(environment).mode !== "timeweb"
  ) {
    return {
      ok: false,
      code: "MUTATION_GATE_CLOSED",
      message: "Production mutation gates закрыты.",
    };
  }
  const catalog = await adapter.discover();
  const budget =
    gate.mode === "timeweb"
      ? positiveInteger(environment.TIMEWEB_SMOKE_BUDGET_RUB ?? "")
      : 10_000;
  return selectPlan(catalog, budget);
}
