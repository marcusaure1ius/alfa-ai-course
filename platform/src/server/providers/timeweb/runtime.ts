import "server-only";

export type TimewebRuntimeGate =
  | Readonly<{
      mode: "fake";
      reason: "explicit-fake" | "non-production";
      tokenConfigured: false;
    }>
  | Readonly<{
      mode: "blocked";
      reason: "missing-production-token";
      tokenConfigured: false;
    }>
  | Readonly<{
      mode: "timeweb";
      tokenConfigured: true;
    }>;

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

export type TimewebMutationRuntimeGate =
  | Readonly<{
      mode: "fake";
      reason: "non-production" | "explicit-fake";
      tokenConfigured: false;
    }>
  | Readonly<{
      mode: "blocked";
      reason:
        | "missing-production-token"
        | "mutations-disabled"
        | "capabilities-unverified"
        | "exclusive-account-unverified";
      tokenConfigured: boolean;
    }>
  | Readonly<{
      mode: "timeweb";
      tokenConfigured: true;
    }>;

/**
 * Fail-closed production gate. It reports only token presence and never returns
 * the token itself, so callers cannot accidentally serialize it into a DTO.
 */
export function readTimewebRuntimeGate(
  environment: ServerEnvironment = process.env,
): TimewebRuntimeGate {
  if (environment.VERCEL_ENV !== "production") {
    return {
      mode: "fake",
      reason: "non-production",
      tokenConfigured: false,
    };
  }

  if (environment.PLATFORM_PROVIDER !== "timeweb") {
    return {
      mode: "fake",
      reason: "explicit-fake",
      tokenConfigured: false,
    };
  }

  if (!environment.TIMEWEB_API_TOKEN) {
    return {
      mode: "blocked",
      reason: "missing-production-token",
      tokenConfigured: false,
    };
  }

  return {
    mode: "timeweb",
    tokenConfigured: true,
  };
}

/**
 * A separate fail-closed gate keeps mutation authority stricter than read-only
 * discovery. Non-production environments never inspect or expose the token.
 */
export function readTimewebMutationRuntimeGate(
  environment: ServerEnvironment = process.env,
): TimewebMutationRuntimeGate {
  if (environment.VERCEL_ENV !== "production") {
    return {
      mode: "fake",
      reason: "non-production",
      tokenConfigured: false,
    };
  }
  if (environment.PLATFORM_PROVIDER !== "timeweb") {
    return {
      mode: "fake",
      reason: "explicit-fake",
      tokenConfigured: false,
    };
  }
  if (!environment.TIMEWEB_API_TOKEN) {
    return {
      mode: "blocked",
      reason: "missing-production-token",
      tokenConfigured: false,
    };
  }
  if (environment.TIMEWEB_MUTATIONS_ENABLED !== "true") {
    return {
      mode: "blocked",
      reason: "mutations-disabled",
      tokenConfigured: true,
    };
  }
  if (environment.TIMEWEB_CAPABILITIES_VERIFIED !== "true") {
    return {
      mode: "blocked",
      reason: "capabilities-unverified",
      tokenConfigured: true,
    };
  }
  if (environment.TIMEWEB_SMOKE_EXCLUSIVE_ACCOUNT !== "true") {
    return {
      mode: "blocked",
      reason: "exclusive-account-unverified",
      tokenConfigured: true,
    };
  }
  return { mode: "timeweb", tokenConfigured: true };
}
