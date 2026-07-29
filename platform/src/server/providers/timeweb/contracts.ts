import "server-only";

export const TIMEWEB_ADAPTER_VERSION = "v1" as const;

export type TimewebAdapterVersion = typeof TIMEWEB_ADAPTER_VERSION;

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
