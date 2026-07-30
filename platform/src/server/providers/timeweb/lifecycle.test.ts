import { describe, expect, it } from "vitest";

import {
  isProductionTimewebWorkflow,
  LifecycleProviderError,
} from "./lifecycle";

describe("production Timeweb lifecycle gate", () => {
  it("fails closed instead of selecting fake after a production gate closes", () => {
    expect(() =>
      isProductionTimewebWorkflow({
        VERCEL_ENV: "production",
        PLATFORM_PROVIDER: "timeweb",
        TIMEWEB_API_TOKEN: "synthetic-test-token",
        TIMEWEB_MUTATIONS_ENABLED: "false",
        TIMEWEB_CAPABILITIES_VERIFIED: "true",
      }),
    ).toThrowError(
      expect.objectContaining<Partial<LifecycleProviderError>>({
        code: "MUTATION_GATE_CLOSED",
      }),
    );
  });
});
