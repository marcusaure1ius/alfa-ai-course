import "server-only";

export const CLOUD_PROVIDER_REGISTRY = {
  timeweb: {
    credentialEnvironmentVariable: "TIMEWEB_API_TOKEN",
  },
} as const;

export type CloudProviderId = keyof typeof CLOUD_PROVIDER_REGISTRY;
type ServerEnvironment = Readonly<Record<string, string | undefined>>;

export type CloudProviderRuntime =
  | Readonly<{
      mode: "fake";
      reason: "explicit-fake" | "non-production";
      credentialConfigured: false;
    }>
  | Readonly<{
      mode: "blocked";
      reason: "missing-provider-credential" | "unsupported-provider";
      provider: string;
      credentialConfigured: false;
    }>
  | Readonly<{
      mode: "provider";
      provider: CloudProviderId;
      credentialConfigured: true;
    }>;

function isCloudProviderId(value: string): value is CloudProviderId {
  return Object.hasOwn(CLOUD_PROVIDER_REGISTRY, value);
}

/**
 * Resolves the active cloud adapter without exposing its credential. Adding a
 * provider requires one registry entry and its server-only adapter; browser
 * contracts and orchestration continue to use the generic provider mode.
 */
export function readCloudProviderRuntime(
  environment: ServerEnvironment = process.env,
): CloudProviderRuntime {
  if (environment.VERCEL_ENV !== "production") {
    return {
      mode: "fake",
      reason: "non-production",
      credentialConfigured: false,
    };
  }

  const provider = environment.PLATFORM_PROVIDER?.trim().toLowerCase() || "fake";
  if (provider === "fake") {
    return {
      mode: "fake",
      reason: "explicit-fake",
      credentialConfigured: false,
    };
  }
  if (!isCloudProviderId(provider)) {
    return {
      mode: "blocked",
      reason: "unsupported-provider",
      provider,
      credentialConfigured: false,
    };
  }

  const credentialName =
    CLOUD_PROVIDER_REGISTRY[provider].credentialEnvironmentVariable;
  if (!environment[credentialName]) {
    return {
      mode: "blocked",
      reason: "missing-provider-credential",
      provider,
      credentialConfigured: false,
    };
  }

  return {
    mode: "provider",
    provider,
    credentialConfigured: true,
  };
}

export function runtimeUsesProvider(
  runtime: CloudProviderRuntime,
  provider: CloudProviderId,
): boolean {
  return runtime.mode === "provider" && runtime.provider === provider;
}
