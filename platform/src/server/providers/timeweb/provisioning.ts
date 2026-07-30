import "server-only";

import type { TimewebCatalogSnapshot } from "./contracts";
import { createTimewebReadAdapter } from "./read-service";

const REGION_POLICY = [
  {
    id: "ru-3",
    label: "Москва",
    availabilityZone: "msk-1",
    presetTag: "msk_nvme",
  },
  {
    id: "nl-1",
    label: "Амстердам",
    availabilityZone: "ams-1",
    presetTag: "nl_base",
  },
  {
    id: "de-1",
    label: "Франкфурт",
    availabilityZone: "fra-1",
    presetTag: "fra_nvme",
  },
] as const;

const PREMIUM_NVME_SHAPES = new Set([
  "2:2048:40960",
  "2:4096:51200",
  "4:8192:81920",
  "8:12288:102400",
  "8:16384:163840",
]);

export type TimewebDeploySelection = Readonly<{
  region: string;
  presetId: number;
  operatingSystemId: number;
  backupsEnabled: boolean;
  publicIpv4: true;
}>;

export type TimewebProvisioningPlan = Readonly<{
  version: "timeweb-provisioning-v3";
  deploymentMode: "plain-vps";
  checkedAt: string;
  presetId: number;
  operatingSystemId: number;
  operatingSystemLabel: string;
  region: string;
  regionLabel: string;
  availabilityZone: string;
  monthlyServerRoubles: number;
  hourlyServerRoubles: number;
  cpu: number;
  ramMb: number;
  diskMb: number;
  diskType: string;
  bandwidthMbps: number;
  backupsEnabled: boolean;
  backupInterval: "week";
  backupCopyCount: 1;
  publicIpv4: true;
  monthlyPublicIpRoubles: number;
  monthlyTotalRoubles: number;
  projectId: number;
  sshKeyId: number;
}>;

export type TimewebProvisioningCatalog = Readonly<{
  checkedAt: string;
  regions: ReadonlyArray<
    Readonly<{
      id: string;
      label: string;
      availabilityZone: string;
      presets: ReadonlyArray<
        Readonly<{
          id: number;
          cpu: number;
          ramMb: number;
          diskMb: number;
          diskType: string;
          bandwidthMbps: number;
          monthlyRoubles: number;
          hourlyRoubles: number;
        }>
      >;
    }>
  >;
  operatingSystems: ReadonlyArray<
    Readonly<{ id: number; label: string; version: string }>
  >;
  publicIpv4: Readonly<{
    included: true;
    monthlyRoubles: number;
  }>;
  backups: Readonly<{
    interval: "week";
    copyCount: 1;
    priceRoublesPerGbPerCopy: 6;
  }>;
  defaultSelection: TimewebDeploySelection;
}>;

export type TimewebProvisioningPreview =
  | Readonly<{
      ok: true;
      mode: "fake" | "timeweb";
      catalog: TimewebProvisioningCatalog;
      plan: TimewebProvisioningPlan;
    }>
  | Readonly<{
      ok: false;
      code:
        | "MUTATION_GATE_CLOSED"
        | "ACCOUNT_BLOCKED"
        | "CATALOG_DEGRADED"
        | "ACTIVE_SERVER_LIMIT"
        | "UBUNTU_2604_UNAVAILABLE"
        | "PRESET_UNAVAILABLE"
        | "INVALID_SELECTION"
        | "PUBLIC_IP_PRICE_NOT_CONFIGURED"
        | "PUBLIC_IP_OWNERSHIP_INVALID"
        | "PROVIDER_PROJECT_UNAVAILABLE"
        | "PROVIDER_SSH_KEY_UNAVAILABLE";
      message: string;
    }>;

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

function positiveInteger(value: string): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function lowestNumericId(
  resources: ReadonlyArray<Readonly<{ id: string }>>,
): number | null {
  const ids = resources
    .map((resource) => Number(resource.id))
    .filter((id) => Number.isSafeInteger(id) && id > 0)
    .sort((left, right) => left - right);
  return ids[0] ?? null;
}

function hourlyRoubles(monthlyRoubles: number): number {
  return Math.round((monthlyRoubles / 730) * 100) / 100;
}

function shapeKey(candidate: {
  cpu: number;
  ramMb: number;
  diskMb: number;
}): string {
  return `${candidate.cpu}:${candidate.ramMb}:${candidate.diskMb}`;
}

function buildCatalog(
  catalog: TimewebCatalogSnapshot,
): TimewebProvisioningCatalog | TimewebProvisioningPreview {
  const monthlyPublicIpRoubles = catalog.publicIpMonthlyRoubles;
  if (catalog.source === "timeweb" && monthlyPublicIpRoubles == null) {
    return {
      ok: false,
      code: "PUBLIC_IP_PRICE_NOT_CONFIGURED",
      message:
        "Timeweb API не вернул актуальную стоимость floating IP; создание запрещено.",
    };
  }

  const regions = REGION_POLICY.map((region) => {
    const location = catalog.locations.find(
      (candidate) =>
        candidate.region === region.id &&
        candidate.zones.includes(region.availabilityZone),
    );
    const presets = catalog.presets
      .filter(
        (preset) =>
          location &&
          preset.region === region.id &&
          preset.tags.includes("site") &&
          preset.tags.includes("cp") &&
          preset.tags.includes(region.presetTag) &&
          PREMIUM_NVME_SHAPES.has(shapeKey(preset)),
      )
      .map((preset) => {
        const id = positiveInteger(preset.id);
        return id
          ? {
              id,
              cpu: preset.cpu,
              ramMb: preset.ramMb,
              diskMb: preset.diskMb,
              diskType: preset.diskType,
              bandwidthMbps: preset.bandwidthMbps,
              monthlyRoubles: preset.priceRoubles,
              hourlyRoubles: hourlyRoubles(preset.priceRoubles),
            }
          : null;
      })
      .filter((preset): preset is NonNullable<typeof preset> => Boolean(preset))
      .sort(
        (left, right) =>
          left.ramMb - right.ramMb || left.monthlyRoubles - right.monthlyRoubles,
      );
    return {
      id: region.id,
      label: region.label,
      availabilityZone: region.availabilityZone,
      presets,
    };
  });

  if (regions.some((region) => region.presets.length === 0)) {
    return {
      ok: false,
      code: "PRESET_UNAVAILABLE",
      message:
        "В одном из поддерживаемых регионов нет актуальных Premium NVMe тарифов.",
    };
  }

  const operatingSystems = catalog.operatingSystems
    .filter(
      (candidate) =>
        candidate.family.toLowerCase() === "linux" &&
        candidate.name.trim().toLowerCase() === "ubuntu",
    )
    .map((candidate) => {
      const id = positiveInteger(candidate.id);
      return id
        ? {
            id,
            label: `Ubuntu ${candidate.version} x86_64`,
            version: candidate.version,
          }
        : null;
    })
    .filter(
      (candidate): candidate is NonNullable<typeof candidate> =>
        Boolean(candidate),
    )
    .sort((left, right) =>
      right.version.localeCompare(left.version, undefined, { numeric: true }),
    );
  const defaultOperatingSystem = operatingSystems.find((candidate) =>
    candidate.version.startsWith("26.04"),
  );
  if (!defaultOperatingSystem) {
    return {
      ok: false,
      code: "UBUNTU_2604_UNAVAILABLE",
      message: "В актуальном Timeweb catalog нет Ubuntu 26.04 x86_64.",
    };
  }
  const defaultRegion = regions[0]!;
  const defaultPreset =
    defaultRegion.presets.find(
      (preset) =>
        preset.cpu === 2 &&
        preset.ramMb === 4_096 &&
        preset.diskMb === 51_200,
    ) ?? defaultRegion.presets[0]!;

  return {
    checkedAt: catalog.checkedAt,
    regions,
    operatingSystems,
    publicIpv4: {
      included: true,
      monthlyRoubles: monthlyPublicIpRoubles ?? 0,
    },
    backups: {
      interval: "week",
      copyCount: 1,
      priceRoublesPerGbPerCopy: 6,
    },
    defaultSelection: {
      region: defaultRegion.id,
      presetId: defaultPreset.id,
      operatingSystemId: defaultOperatingSystem.id,
      backupsEnabled: false,
      publicIpv4: true,
    },
  };
}

function selectPlan(
  providerCatalog: TimewebCatalogSnapshot,
  projectId: number | null,
  sshKeyId: number | null,
  selection: Partial<TimewebDeploySelection> | undefined,
  approvedOwnedPublicIp:
    | {
        externalId: string;
        address: string;
      }
    | undefined,
): TimewebProvisioningPreview {
  if (providerCatalog.account.state !== "ready") {
    return {
      ok: false,
      code: "ACCOUNT_BLOCKED",
      message: "Timeweb account заблокирован для создания ресурсов.",
    };
  }
  if (providerCatalog.degraded) {
    return {
      ok: false,
      code: "CATALOG_DEGRADED",
      message: "Provider catalog устарел или содержит неизвестные состояния.",
    };
  }
  if (providerCatalog.servers.length > 0) {
    return {
      ok: false,
      code: "ACTIVE_SERVER_LIMIT",
      message: "В Timeweb account уже есть VPS; hard limit равен одному.",
    };
  }

  const normalizedCatalog = buildCatalog(providerCatalog);
  if ("ok" in normalizedCatalog) return normalizedCatalog;
  const effectiveSelection: TimewebDeploySelection = {
    ...normalizedCatalog.defaultSelection,
    ...selection,
    publicIpv4: true,
  };
  const region = normalizedCatalog.regions.find(
    (candidate) => candidate.id === effectiveSelection.region,
  );
  const preset = region?.presets.find(
    (candidate) => candidate.id === effectiveSelection.presetId,
  );
  const operatingSystem = normalizedCatalog.operatingSystems.find(
    (candidate) => candidate.id === effectiveSelection.operatingSystemId,
  );
  if (!region || !preset || !operatingSystem) {
    return {
      ok: false,
      code: "INVALID_SELECTION",
      message: "Выбранная конфигурация отсутствует в актуальном Timeweb catalog.",
    };
  }

  if (approvedOwnedPublicIp) {
    const matches = providerCatalog.floatingIps.filter(
      (candidate) => candidate.id === approvedOwnedPublicIp.externalId,
    );
    const exact = matches[0];
    if (
      matches.length !== 1 ||
      !exact ||
      exact.address !== approvedOwnedPublicIp.address ||
      exact.zone !== region.availabilityZone ||
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
  }

  if (providerCatalog.source === "timeweb" && projectId == null) {
    return {
      ok: false,
      code: "PROVIDER_PROJECT_UNAVAILABLE",
      message: "Провайдер не вернул доступный проект для нового сервера.",
    };
  }
  if (
    projectId != null &&
    !providerCatalog.projects.some((project) => project.id === String(projectId))
  ) {
    return {
      ok: false,
      code: "PROVIDER_PROJECT_UNAVAILABLE",
      message: "Project ID не найден в актуальном Timeweb API catalog.",
    };
  }
  if (providerCatalog.source === "timeweb" && sshKeyId == null) {
    return {
      ok: false,
      code: "PROVIDER_SSH_KEY_UNAVAILABLE",
      message: "Провайдер не вернул SSH-ключ для passwordless root access.",
    };
  }
  if (
    sshKeyId != null &&
    !providerCatalog.sshKeys.some((key) => key.id === String(sshKeyId))
  ) {
    return {
      ok: false,
      code: "PROVIDER_SSH_KEY_UNAVAILABLE",
      message: "SSH key ID не найден в актуальном Timeweb API catalog.",
    };
  }

  const monthlyPublicIpRoubles =
    normalizedCatalog.publicIpv4.monthlyRoubles;
  return {
    ok: true,
    mode: providerCatalog.source,
    catalog: normalizedCatalog,
    plan: {
      version: "timeweb-provisioning-v3",
      deploymentMode: "plain-vps",
      checkedAt: providerCatalog.checkedAt,
      presetId: preset.id,
      operatingSystemId: operatingSystem.id,
      operatingSystemLabel: operatingSystem.label,
      region: region.id,
      regionLabel: region.label,
      availabilityZone: region.availabilityZone,
      monthlyServerRoubles: preset.monthlyRoubles,
      hourlyServerRoubles: preset.hourlyRoubles,
      cpu: preset.cpu,
      ramMb: preset.ramMb,
      diskMb: preset.diskMb,
      diskType: preset.diskType,
      bandwidthMbps: preset.bandwidthMbps,
      backupsEnabled: effectiveSelection.backupsEnabled,
      backupInterval: "week",
      backupCopyCount: 1,
      publicIpv4: true,
      monthlyPublicIpRoubles,
      monthlyTotalRoubles: preset.monthlyRoubles + monthlyPublicIpRoubles,
      projectId: projectId ?? 1,
      sshKeyId: sshKeyId ?? 1,
    },
  };
}

export async function getTimewebProvisioningPreview(
  environment: ServerEnvironment = process.env,
  fetchImpl: typeof fetch = fetch,
  options: Readonly<{
    selection?: Partial<TimewebDeploySelection>;
    approvedOwnedPublicIp?: {
      externalId: string;
      address: string;
    };
  }> = {},
): Promise<TimewebProvisioningPreview> {
  const { runtime, adapter } = createTimewebReadAdapter(environment, fetchImpl);
  if (!adapter) {
    return {
      ok: false,
      code: "MUTATION_GATE_CLOSED",
      message: "Каталог серверов временно недоступен.",
    };
  }
  const catalog = await adapter.discover();
  const projectId =
    runtime.mode === "fake" ? 1 : lowestNumericId(catalog.projects);
  const sshKeyId =
    runtime.mode === "fake" ? 1 : lowestNumericId(catalog.sshKeys);
  return selectPlan(
    catalog,
    projectId,
    sshKeyId,
    options.selection,
    options.approvedOwnedPublicIp,
  );
}
