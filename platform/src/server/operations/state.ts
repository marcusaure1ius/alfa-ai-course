import "server-only";

export type EnvironmentStatus =
  | "draft"
  | "creating"
  | "active"
  | "degraded"
  | "deleting"
  | "deleted"
  | "cleanup_required";

const transitions: Record<EnvironmentStatus, ReadonlySet<EnvironmentStatus>> = {
  draft: new Set(["creating"]),
  creating: new Set(["active", "degraded", "cleanup_required"]),
  active: new Set(["degraded", "deleting"]),
  degraded: new Set(["active", "deleting"]),
  deleting: new Set(["deleted", "cleanup_required"]),
  deleted: new Set(),
  cleanup_required: new Set(["deleting", "deleted"]),
};

export function canTransitionEnvironment(
  from: EnvironmentStatus,
  to: EnvironmentStatus,
): boolean {
  return transitions[from].has(to);
}

export type RetryClass = "transient" | "unknown_outcome" | "permanent";

export function classifyProviderError(code: string): RetryClass {
  if (code === "TIMEOUT_AFTER_MUTATION") return "unknown_outcome";
  if (code === "RATE_LIMIT" || code === "PROVIDER_UNAVAILABLE") return "transient";
  return "permanent";
}
