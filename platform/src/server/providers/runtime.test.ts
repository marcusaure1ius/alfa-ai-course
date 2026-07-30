import { describe, expect, it } from "vitest";

import { readCloudProviderRuntime } from "./runtime";

describe("readCloudProviderRuntime", () => {
  it("forces fake mode outside production without inspecting credentials", () => {
    expect(
      readCloudProviderRuntime({
        VERCEL_ENV: "preview",
        PLATFORM_PROVIDER: "timeweb",
        TIMEWEB_API_TOKEN: "synthetic-test-token",
      }),
    ).toEqual({
      mode: "fake",
      reason: "non-production",
      credentialConfigured: false,
    });
  });

  it("fails closed for an unsupported production provider", () => {
    expect(
      readCloudProviderRuntime({
        VERCEL_ENV: "production",
        PLATFORM_PROVIDER: "selectel",
      }),
    ).toEqual({
      mode: "blocked",
      reason: "unsupported-provider",
      provider: "selectel",
      credentialConfigured: false,
    });
  });

  it("requires only the registered provider credential in production", () => {
    expect(
      readCloudProviderRuntime({
        VERCEL_ENV: "production",
        PLATFORM_PROVIDER: "timeweb",
      }),
    ).toEqual({
      mode: "blocked",
      reason: "missing-provider-credential",
      provider: "timeweb",
      credentialConfigured: false,
    });

    const result = readCloudProviderRuntime({
      VERCEL_ENV: "production",
      PLATFORM_PROVIDER: "timeweb",
      TIMEWEB_API_TOKEN: "synthetic-test-token",
    });
    expect(result).toEqual({
      mode: "provider",
      provider: "timeweb",
      credentialConfigured: true,
    });
    expect(JSON.stringify(result)).not.toContain("synthetic-test-token");
  });
});
