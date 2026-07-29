import { describe, expect, it } from "vitest";

import { readTimewebRuntimeGate } from "./runtime";

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
