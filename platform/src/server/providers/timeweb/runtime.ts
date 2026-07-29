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
