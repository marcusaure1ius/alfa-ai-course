import "server-only";

import type { TimewebCatalogSnapshot } from "./contracts";
import {
  COURSE_DNS_ZONE,
  COURSE_HOSTNAME,
} from "./bootstrap-profile";
import { createProductionTimewebMutationAdapter } from "./mutation";
import { TimewebProviderError } from "./read-only";
import { createTimewebReadAdapter } from "./read-service";
import { readTimewebMutationRuntimeGate } from "./runtime";

export type TimewebProvisioningPlan = Readonly<{
  version: "timeweb-provisioning-v2";
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
  bandwidthMbps: number;
  monthlyPublicIpRoubles: number;
  monthlyTotalRoubles: number;
  requiredBalanceRoubles: number;
  balanceRoubles: number;
  projectId: number;
  sshKeyId: number;
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
        | "PUBLIC_IP_PRICE_NOT_CONFIGURED"
        | "PUBLIC_IP_OWNERSHIP_INVALID"
        | "SMOKE_REGION_UNAVAILABLE"
        | "SMOKE_PROJECT_NOT_CONFIGURED"
        | "SMOKE_PROJECT_UNAVAILABLE"
        | "SMOKE_SSH_KEY_NOT_CONFIGURED"
        | "SMOKE_SSH_KEY_UNAVAILABLE"
        | "DNS_ZONE_UNAVAILABLE"
        | "DNS_HOSTNAME_CONFLICT";
      message: string;
    }>;

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

function positiveInteger(value: string): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function selectPlan(
  catalog: TimewebCatalogSnapshot,
  projectId: number | null,
  sshKeyId: number | null,
  preferredRegion: string | null,
  approvedOwnedPublicIp:
    | {
        externalId: string;
        address: string;
      }
    | undefined,
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
      candidate.family.toLowerCase() === "linux" &&
      candidate.name.trim().toLowerCase() === "ubuntu" &&
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
    .filter(
      (preset) =>
        preferredRegion === null || preset.region === preferredRegion,
    )
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
      code:
        preferredRegion === null
          ? "PRESET_UNAVAILABLE"
          : "SMOKE_REGION_UNAVAILABLE",
      message:
        preferredRegion === null
          ? "Нет совместимого тарифа и зоны для disposable smoke."
          : "В выбранном smoke region нет совместимого тарифа и зоны.",
    };
  }
  let ownedPublicIpAlreadyBilled = false;
  if (approvedOwnedPublicIp) {
    const matches = catalog.floatingIps.filter(
      (candidate) => candidate.id === approvedOwnedPublicIp.externalId,
    );
    const exact = matches[0];
    if (
      matches.length !== 1 ||
      !exact ||
      exact.address !== approvedOwnedPublicIp.address ||
      exact.zone !== selected.zone ||
      exact.resourceType !== null ||
      exact.resourceId !== null
    ) {
      return {
        ok: false,
        code: "PUBLIC_IP_OWNERSHIP_INVALID",
        message:
          "Owned floating IP отсутствует, перемещён или уже привязан к другому ресурсу.",
      };
    }
    ownedPublicIpAlreadyBilled = true;
  }

  if (catalog.source === "timeweb" && catalog.publicIpMonthlyRoubles == null) {
    return {
      ok: false,
      code: "PUBLIC_IP_PRICE_NOT_CONFIGURED",
      message:
        "Timeweb API не вернул актуальную стоимость floating IP; mutation запрещена.",
    };
  }
  if (catalog.source === "timeweb" && projectId == null) {
    return {
      ok: false,
      code: "SMOKE_PROJECT_NOT_CONFIGURED",
      message: "Не задан disposable TIMEWEB_SMOKE_PROJECT_ID.",
    };
  }
  if (
    projectId != null &&
    !catalog.projects.some((project) => project.id === String(projectId))
  ) {
    return {
      ok: false,
      code: "SMOKE_PROJECT_UNAVAILABLE",
      message: "Disposable project ID не найден в актуальном Timeweb API catalog.",
    };
  }
  if (catalog.source === "timeweb" && sshKeyId == null) {
    return {
      ok: false,
      code: "SMOKE_SSH_KEY_NOT_CONFIGURED",
      message: "Не задан TIMEWEB_SMOKE_SSH_KEY_ID для passwordless root access.",
    };
  }
  if (
    sshKeyId != null &&
    !catalog.sshKeys.some((key) => key.id === String(sshKeyId))
  ) {
    return {
      ok: false,
      code: "SMOKE_SSH_KEY_UNAVAILABLE",
      message: "Smoke SSH key ID не найден в актуальном Timeweb API catalog.",
    };
  }
  const monthlyPublicIpRoubles = catalog.publicIpMonthlyRoubles ?? 0;
  const monthlyTotalRoubles =
    selected.preset.priceRoubles + monthlyPublicIpRoubles;
  const requiredBalanceRoubles =
    catalog.balance.monthlyFeeRoubles +
    selected.preset.priceRoubles +
    (ownedPublicIpAlreadyBilled ? 0 : monthlyPublicIpRoubles);
  return {
    ok: true,
    mode: catalog.source,
    plan: {
      version: "timeweb-provisioning-v2",
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
      bandwidthMbps: selected.preset.bandwidthMbps,
      monthlyPublicIpRoubles,
      monthlyTotalRoubles,
      requiredBalanceRoubles,
      balanceRoubles: catalog.balance.amount,
      projectId: projectId ?? 1,
      sshKeyId: sshKeyId ?? 1,
    },
  };
}

export async function getTimewebProvisioningPreview(
  environment: ServerEnvironment = process.env,
  fetchImpl: typeof fetch = fetch,
  options: Readonly<{
    approvedOwnedDns?: {
      environmentId: string;
      externalId: string;
      address: string;
    };
    approvedOwnedPublicIp?: {
      externalId: string;
      address: string;
    };
  }> = {},
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
  const projectId =
    gate.mode === "timeweb"
      ? positiveInteger(environment.TIMEWEB_SMOKE_PROJECT_ID ?? "")
      : 1;
  const sshKeyId =
    gate.mode === "timeweb"
      ? positiveInteger(environment.TIMEWEB_SMOKE_SSH_KEY_ID ?? "")
      : 1;
  const configuredRegion =
    gate.mode === "timeweb"
      ? environment.TIMEWEB_SMOKE_REGION?.trim() ?? ""
      : "";
  if (
    configuredRegion &&
    !/^[a-z]{2}-[1-9][0-9]*$/.test(configuredRegion)
  ) {
    return {
      ok: false,
      code: "SMOKE_REGION_UNAVAILABLE",
      message: "Настроенный smoke region имеет недопустимый формат.",
    };
  }
  const preferredRegion = configuredRegion || null;
  const preview = selectPlan(
    catalog,
    projectId,
    sshKeyId,
    preferredRegion,
    options.approvedOwnedPublicIp,
  );
  if (!preview.ok || preview.mode !== "timeweb") return preview;

  const mutationAdapter = createProductionTimewebMutationAdapter(
    environment,
    fetchImpl,
  );
  if (!mutationAdapter) {
    return {
      ok: false,
      code: "MUTATION_GATE_CLOSED",
      message: "Production mutation gates закрылись во время DNS preflight.",
    };
  }
  try {
    const environmentId =
      options.approvedOwnedDns?.environmentId ??
      "00000000-0000-4000-8000-000000000057";
    const dnsInput = {
      environmentId,
      zone: COURSE_DNS_ZONE,
      hostname: COURSE_HOSTNAME,
    };
    const [hostnames, records] = await Promise.all([
      mutationAdapter.listDnsConflictingHostnames(dnsInput),
      options.approvedOwnedDns
        ? mutationAdapter.listDnsRecords(dnsInput)
        : Promise.resolve([]),
    ]);
    const approvedOwnedDns = options.approvedOwnedDns;
    const exactOwnedDns =
      approvedOwnedDns &&
      hostnames.length === 1 &&
      hostnames[0] === COURSE_HOSTNAME &&
      records.length === 1 &&
      records[0]?.externalId === approvedOwnedDns.externalId &&
      records[0]?.value === approvedOwnedDns.address;
    const conflict = approvedOwnedDns
      ? !exactOwnedDns
      : hostnames.includes(COURSE_HOSTNAME);
    if (conflict) {
      return {
        ok: false,
        code: "DNS_HOSTNAME_CONFLICT",
        message: "Approved hostname уже содержит DNS A record.",
      };
    }
  } catch (error) {
    return {
      ok: false,
      code: "DNS_ZONE_UNAVAILABLE",
      message:
        error instanceof TimewebProviderError
          ? error.message
          : "Timeweb DNS zone недоступна для preflight.",
    };
  }
  return preview;
}
