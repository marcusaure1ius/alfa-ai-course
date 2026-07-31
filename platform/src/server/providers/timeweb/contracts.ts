import "server-only";

export const TIMEWEB_ADAPTER_VERSION = "v1" as const;
export const TIMEWEB_READ_DTO_VERSION = "timeweb-read-v2" as const;
export const TIMEWEB_MUTATION_ADAPTER_VERSION = "timeweb-mutation-v2" as const;

export type TimewebAdapterVersion = typeof TIMEWEB_ADAPTER_VERSION;
export type TimewebReadDtoVersion = typeof TIMEWEB_READ_DTO_VERSION;
export type TimewebMutationAdapterVersion =
  typeof TIMEWEB_MUTATION_ADAPTER_VERSION;

export type TimewebResourceKind = "server" | "public_ip" | "dns_record";

export type OwnedProviderResource = Readonly<{
  externalId: string;
  kind: TimewebResourceKind;
  environmentId: string;
}>;

export type ProviderConnectionResult = Readonly<{
  ok: boolean;
  checkedAt: string;
  accountLabel?: string;
}>;

export type TimewebSupportedStatus =
  | "on"
  | "off"
  | "installing"
  | "software_install"
  | "reinstalling"
  | "turning_on"
  | "turning_off"
  | "hard_turning_off"
  | "rebooting"
  | "hard_rebooting"
  | "removing"
  | "removed"
  | "cloning"
  | "transfer"
  | "blocked"
  | "configuring"
  | "no_paid"
  | "permanent_blocked";

export type TimewebServerStatus =
  | Readonly<{ state: "supported"; value: TimewebSupportedStatus }>
  | Readonly<{ state: "unsupported"; providerValue: string }>;

export type TimewebReadCapabilities = Readonly<{
  servers: true;
  presets: true;
  operatingSystems: true;
  locations: true;
  balance: true;
  accountStatus: true;
  floatingIps: true;
  serviceCosts: true;
  projects: true;
  sshKeys: true;
  tokenPermissions: Readonly<{
    serviceScope: "manual-verification-required";
    deleteWithoutConfirmation: "manual-verification-required";
    actionLevelPermissions: "not-documented";
  }>;
}>;

export type TimewebCatalogSnapshot = Readonly<{
  version: TimewebReadDtoVersion;
  source: "fake" | "timeweb";
  checkedAt: string;
  degraded: boolean;
  account: Readonly<{
    state: "ready" | "blocked";
  }>;
  balance: Readonly<{
    amount: number;
    currency: string;
    monthlyFeeRoubles: number;
  }>;
  servers: ReadonlyArray<
    Readonly<{
      id: string;
      name: string;
      region: string;
      zone: string;
      presetId: string | null;
      status: TimewebServerStatus;
    }>
  >;
  presets: ReadonlyArray<
    Readonly<{
      id: string;
      region: string;
      tags: readonly string[];
      priceRoubles: number;
      cpu: number;
      ramMb: number;
      diskMb: number;
      diskType: string;
      bandwidthMbps: number;
    }>
  >;
  operatingSystems: ReadonlyArray<
    Readonly<{
      id: string;
      family: string;
      name: string;
      version: string;
    }>
  >;
  locations: ReadonlyArray<
    Readonly<{
      region: string;
      countryCode: string;
      zones: readonly string[];
    }>
  >;
  floatingIps: ReadonlyArray<
    Readonly<{
      id: string;
      address: string;
      zone: string;
      resourceType: string | null;
      resourceId: string | null;
    }>
  >;
  publicIpMonthlyRoubles: number | null;
  projects: ReadonlyArray<Readonly<{ id: string; name: string }>>;
  sshKeys: ReadonlyArray<Readonly<{ id: string; name: string }>>;
  capabilities: TimewebReadCapabilities;
}>;

export type TimewebConnectionCheck =
  | Readonly<{
      version: TimewebReadDtoVersion;
      ok: true;
      mode: "fake" | "timeweb";
      status: "fake" | "ready" | "degraded";
      checkedAt: string;
      catalog: TimewebCatalogSnapshot;
    }>
  | Readonly<{
      version: TimewebReadDtoVersion;
      ok: false;
      mode: "blocked" | "timeweb";
      status: "unavailable";
      checkedAt: string;
      error: Readonly<{
        code: TimewebProviderErrorCode;
        message: string;
        correlationId: string;
        retryable: boolean;
      }>;
    }>;

export type TimewebProviderErrorCode =
  | "NOT_CONFIGURED"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE"
  | "TIMEOUT"
  | "INVALID_REQUEST"
  | "INVALID_RESPONSE";

export interface TimewebReadAdapter {
  readonly version: TimewebReadDtoVersion;
  discover(): Promise<TimewebCatalogSnapshot>;
}

export type TimewebCreateServerInput = Readonly<{
  environmentId: string;
  name: string;
  deploymentMode?: "starter-kit" | "plain-vps";
  presetId: number;
  operatingSystemId: number;
  availabilityZone: string;
  projectId: number;
  sshKeyId: number;
  bandwidthMbps: number;
  publicIpv4: string;
  serverHostname?: string;
  cloudInit?: string;
}>;

export type TimewebAutoBackupSettings = Readonly<
  | { enabled: false }
  | {
      enabled: true;
      interval: "week";
      copyCount: 1;
      creationStartAt: string;
      dayOfWeek: number;
    }
>;

export type TimewebDnsRecord = OwnedProviderResource &
  Readonly<{
    kind: "dns_record";
    zone: string;
    hostname: string;
    type: "A";
    value: string;
    ttl: number;
  }>;

export type TimewebPublicIpResource = OwnedProviderResource &
  Readonly<{
    kind: "public_ip";
    address: string;
  }>;

export type TimewebPublicIpCandidate = TimewebPublicIpResource &
  Readonly<{
    availabilityZone: string;
    resourceType: string | null;
    resourceId: string | null;
  }>;

export type TimewebUpdateServerInput = Readonly<{
  resource: OwnedProviderResource & Readonly<{ kind: "server" }>;
  name: string;
}>;

export type TimewebInstallServerInput = Readonly<{
  resource: OwnedProviderResource & Readonly<{ kind: "server" }>;
  operatingSystemId: number;
  sshKeyId: number;
  cloudInit: string;
}>;

export type TimewebInstallationReconciliation =
  | Readonly<{ state: "absent" }>
  | Readonly<{
      state: "present";
      resource: OwnedProviderResource & Readonly<{ kind: "server" }>;
      status: TimewebServerStatus;
      operatingSystemId: number | null;
    }>;

export type TimewebServerReconciliation =
  | Readonly<{ state: "absent" }>
  | Readonly<{
      state: "present";
      resource: OwnedProviderResource & Readonly<{ kind: "server" }>;
      status: TimewebServerStatus;
    }>;

export type TimewebPublicIpReconciliation =
  | Readonly<{ state: "absent" }>
  | Readonly<{
      state: "present";
      resource: TimewebPublicIpResource;
      binding: Readonly<{
        resourceType: string | null;
        resourceId: string | null;
      }>;
    }>;

/**
 * Production mutation contract. Every operation maps to a fixed Timeweb
 * method/path/body; callers cannot supply an arbitrary URL, method or payload.
 */
export interface TimewebMutationAdapter {
  readonly version: TimewebMutationAdapterVersion;
  createServer(
    input: TimewebCreateServerInput,
  ): Promise<OwnedProviderResource & Readonly<{ kind: "server" }>>;
  configureServerAutoBackups(
    resource: OwnedProviderResource & Readonly<{ kind: "server" }>,
    settings: TimewebAutoBackupSettings,
  ): Promise<void>;
  updateServer(input: TimewebUpdateServerInput): Promise<void>;
  installServer(input: TimewebInstallServerInput): Promise<void>;
  ensureServerSshKey(
    resource: OwnedProviderResource & Readonly<{ kind: "server" }>,
    sshKeyId: number,
  ): Promise<void>;
  reconcileInstallation(
    resource: OwnedProviderResource & Readonly<{ kind: "server" }>,
  ): Promise<TimewebInstallationReconciliation>;
  rebootServer(
    resource: OwnedProviderResource & Readonly<{ kind: "server" }>,
  ): Promise<void>;
  deleteServer(
    resource: OwnedProviderResource & Readonly<{ kind: "server" }>,
  ): Promise<void>;
  reconcileServer(
    resource: OwnedProviderResource & Readonly<{ kind: "server" }>,
  ): Promise<TimewebServerReconciliation>;
  findServerByEnvironmentId(
    environmentId: string,
  ): Promise<(OwnedProviderResource & Readonly<{ kind: "server" }>) | null>;
  findPublicIpByServer(
    resource: OwnedProviderResource & Readonly<{ kind: "server" }>,
  ): Promise<TimewebPublicIpResource | null>;
  listPublicIps(environmentId: string): Promise<TimewebPublicIpCandidate[]>;
  createPublicIp(input: Readonly<{
    environmentId: string;
    availabilityZone: string;
  }>): Promise<TimewebPublicIpResource>;
  bindPublicIp(
    resource: TimewebPublicIpResource,
    server: OwnedProviderResource & Readonly<{ kind: "server" }>,
  ): Promise<void>;
  deletePublicIp(
    resource: OwnedProviderResource & Readonly<{ kind: "public_ip" }>,
  ): Promise<void>;
  reconcilePublicIp(
    resource: TimewebPublicIpResource,
  ): Promise<TimewebPublicIpReconciliation>;
  listDnsRecords(input: Readonly<{
    environmentId: string;
    zone: string;
    hostname: string;
  }>): Promise<TimewebDnsRecord[]>;
  listDnsConflictingHostnames(input: Readonly<{
    environmentId: string;
    zone: string;
    hostname: string;
  }>): Promise<string[]>;
  createDnsARecord(input: Readonly<{
    environmentId: string;
    zone: string;
    hostname: string;
    value: string;
    ttl: number;
  }>): Promise<TimewebDnsRecord>;
  deleteDnsRecord(resource: TimewebDnsRecord): Promise<void>;
  reconcileDnsRecord(
    resource: TimewebDnsRecord,
  ): Promise<Readonly<{ state: "absent" | "present" }>>;
}

/**
 * Internal server contract only. It intentionally exposes concrete operations
 * instead of an arbitrary URL/method/payload proxy.
 */
export interface TimewebAdapter {
  readonly version: TimewebAdapterVersion;
  checkConnection(): Promise<ProviderConnectionResult>;
  listCatalog(): Promise<unknown>;
  listOwnedResources(environmentId: string): Promise<OwnedProviderResource[]>;
  createOwnedServer(
    input: Readonly<{ environmentId: string }>,
  ): Promise<OwnedProviderResource>;
  upsertOwnedDnsRecord(
    input: Readonly<{ environmentId: string; fqdn: string; address: string }>,
  ): Promise<OwnedProviderResource>;
  deleteOwnedResource(resource: OwnedProviderResource): Promise<void>;
}
