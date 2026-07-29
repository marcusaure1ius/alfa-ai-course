import { describe, expect, it } from "vitest";

import {
  readTimewebMutationRuntimeGate,
  readTimewebRuntimeGate,
} from "./runtime";

describe("readTimewebRuntimeGate", () => {
  it("forces fake mode outside production even if a token exists", () => {
    expect(
      readTimewebRuntimeGate({
        VERCEL_ENV: "preview",
        PLATFORM_PROVIDER: "timeweb",
        TIMEWEB_API_TOKEN: "synthetic-test-token",
      }),
    ).toEqual({
      mode: "fake",
      reason: "non-production",
      tokenConfigured: false,
    });
  });

  it("fails closed when production Timeweb mode has no token", () => {
    expect(
      readTimewebRuntimeGate({
        VERCEL_ENV: "production",
        PLATFORM_PROVIDER: "timeweb",
      }),
    ).toEqual({
      mode: "blocked",
      reason: "missing-production-token",
      tokenConfigured: false,
    });
  });

  it("returns only safe token metadata when production is configured", () => {
    const result = readTimewebRuntimeGate({
      VERCEL_ENV: "production",
      PLATFORM_PROVIDER: "timeweb",
      TIMEWEB_API_TOKEN: "synthetic-test-token",
    });

    expect(result).toEqual({
      mode: "timeweb",
      tokenConfigured: true,
    });
    expect(JSON.stringify(result)).not.toContain("synthetic-test-token");
  });
});

describe("readTimewebMutationRuntimeGate", () => {
  it("ignores a configured token outside production", () => {
    expect(
      readTimewebMutationRuntimeGate({
        VERCEL_ENV: "preview",
        PLATFORM_PROVIDER: "timeweb",
        TIMEWEB_API_TOKEN: "synthetic-test-token",
        TIMEWEB_MUTATIONS_ENABLED: "true",
        TIMEWEB_CAPABILITIES_VERIFIED: "true",
      }),
    ).toEqual({
      mode: "fake",
      reason: "non-production",
      tokenConfigured: false,
    });
  });

  it("requires both independent production kill-switches", () => {
    expect(
      readTimewebMutationRuntimeGate({
        VERCEL_ENV: "production",
        PLATFORM_PROVIDER: "timeweb",
        TIMEWEB_API_TOKEN: "synthetic-test-token",
      }),
    ).toEqual({
      mode: "blocked",
      reason: "mutations-disabled",
      tokenConfigured: true,
    });
    expect(
      readTimewebMutationRuntimeGate({
        VERCEL_ENV: "production",
        PLATFORM_PROVIDER: "timeweb",
        TIMEWEB_API_TOKEN: "synthetic-test-token",
        TIMEWEB_MUTATIONS_ENABLED: "true",
      }),
    ).toEqual({
      mode: "blocked",
      reason: "capabilities-unverified",
      tokenConfigured: true,
    });
  });

  it("returns only safe metadata after every production gate passes", () => {
    const result = readTimewebMutationRuntimeGate({
      VERCEL_ENV: "production",
      PLATFORM_PROVIDER: "timeweb",
      TIMEWEB_API_TOKEN: "synthetic-test-token",
      TIMEWEB_MUTATIONS_ENABLED: "true",
      TIMEWEB_CAPABILITIES_VERIFIED: "true",
    });
    expect(result).toEqual({ mode: "timeweb", tokenConfigured: true });
    expect(JSON.stringify(result)).not.toContain("synthetic-test-token");
  });
});
