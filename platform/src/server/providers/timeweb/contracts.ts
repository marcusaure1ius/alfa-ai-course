import "server-only";

export const TIMEWEB_ADAPTER_VERSION = "v1" as const;
export const TIMEWEB_READ_DTO_VERSION = "timeweb-read-v1" as const;
export const TIMEWEB_MUTATION_ADAPTER_VERSION = "timeweb-mutation-v1" as const;

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
  | "reinstalling"
  | "starting"
  | "stopping"
  | "rebooting"
  | "shutting_down"
  | "hard_rebooting"
  | "hard_shutting_down"
  | "blocked";

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
      priceRoubles: number;
      cpu: number;
      ramMb: number;
      diskMb: number;
      diskType: string;
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
  | "INVALID_RESPONSE";

export interface TimewebReadAdapter {
  readonly version: TimewebReadDtoVersion;
  discover(): Promise<TimewebCatalogSnapshot>;
}

export type TimewebCreateServerInput = Readonly<{
  environmentId: string;
  name: string;
  presetId: number;
  operatingSystemId: number;
  availabilityZone: string;
  publicIpAddress: string;
}>;

export type TimewebCreatePublicIpInput = Readonly<{
  environmentId: string;
  availabilityZone: string;
}>;

export type TimewebPublicIpResource = OwnedProviderResource &
  Readonly<{
    kind: "public_ip";
    address: string;
  }>;

export type TimewebUpdateServerInput = Readonly<{
  resource: OwnedProviderResource & Readonly<{ kind: "server" }>;
  name: string;
}>;

export type TimewebServerReconciliation =
  | Readonly<{ state: "absent" }>
  | Readonly<{
      state: "present";
      resource: OwnedProviderResource & Readonly<{ kind: "server" }>;
    }>;

export type TimewebPublicIpReconciliation =
  | Readonly<{ state: "absent" }>
  | Readonly<{
      state: "present";
      resource: TimewebPublicIpResource;
    }>;

/**
 * Production mutation contract. Every operation maps to a fixed Timeweb
 * method/path/body; callers cannot supply an arbitrary URL, method or payload.
 */
export interface TimewebMutationAdapter {
  readonly version: TimewebMutationAdapterVersion;
  createPublicIp(input: TimewebCreatePublicIpInput): Promise<TimewebPublicIpResource>;
  createServer(
    input: TimewebCreateServerInput,
  ): Promise<OwnedProviderResource & Readonly<{ kind: "server" }>>;
  updateServer(input: TimewebUpdateServerInput): Promise<void>;
  deleteServer(
    resource: OwnedProviderResource & Readonly<{ kind: "server" }>,
  ): Promise<void>;
  reconcileServer(
    resource: OwnedProviderResource & Readonly<{ kind: "server" }>,
  ): Promise<TimewebServerReconciliation>;
  findServerByEnvironmentId(
    environmentId: string,
  ): Promise<(OwnedProviderResource & Readonly<{ kind: "server" }>) | null>;
  deletePublicIp(
    resource: OwnedProviderResource & Readonly<{ kind: "public_ip" }>,
  ): Promise<void>;
  reconcilePublicIp(
    resource: TimewebPublicIpResource,
  ): Promise<TimewebPublicIpReconciliation>;
  findNewPublicIp(
    environmentId: string,
    availabilityZone: string,
    excludedIds: readonly string[],
  ): Promise<TimewebPublicIpResource | null>;
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
