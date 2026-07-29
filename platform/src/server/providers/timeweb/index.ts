import "server-only";

export {
  TIMEWEB_ADAPTER_VERSION,
  TIMEWEB_READ_DTO_VERSION,
  type OwnedProviderResource,
  type ProviderConnectionResult,
  type TimewebCatalogSnapshot,
  type TimewebConnectionCheck,
  type TimewebAdapter,
  type TimewebAdapterVersion,
  type TimewebProviderErrorCode,
  type TimewebReadAdapter,
  type TimewebReadDtoVersion,
  type TimewebResourceKind,
  type TimewebServerStatus,
} from "./contracts";
export { readTimewebRuntimeGate, type TimewebRuntimeGate } from "./runtime";
export { FakeProviderError, FakeTimewebAdapter } from "./fake";
export { FakeTimewebReadAdapter } from "./read-only-fake";
export {
  TimewebProviderError,
  TimewebReadOnlyAdapter,
} from "./read-only";
export {
  checkTimewebConnection,
  createTimewebReadAdapter,
} from "./read-service";
