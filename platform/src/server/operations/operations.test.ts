import { describe, expect, it } from "vitest";

import { redactBounded } from "./redaction";
import {
  canTransitionEnvironment,
  classifyProviderError,
  type EnvironmentStatus,
} from "./state";

describe("operation safety primitives", () => {
  it("allows only declared environment transitions", () => {
    expect(canTransitionEnvironment("creating", "active")).toBe(true);
    expect(canTransitionEnvironment("active", "creating")).toBe(false);
    expect(canTransitionEnvironment("deleted", "active")).toBe(false);
  });

  it("treats deletion as terminal instead of a restore state", () => {
    const statuses: EnvironmentStatus[] = [
      "draft",
      "creating",
      "active",
      "degraded",
      "deleting",
      "deleted",
      "cleanup_required",
    ];

    for (const status of statuses) {
      expect(canTransitionEnvironment("deleted", status)).toBe(false);
    }
  });

  it("classifies unknown outcomes separately from permanent failures", () => {
    expect(classifyProviderError("TIMEOUT_AFTER_MUTATION")).toBe("unknown_outcome");
    expect(classifyProviderError("RATE_LIMIT")).toBe("transient");
    expect(classifyProviderError("INSUFFICIENT_FUNDS")).toBe("permanent");
    expect(classifyProviderError("PROVIDER_UNAVAILABLE", false)).toBe("permanent");
    expect(classifyProviderError("UNKNOWN_PROVIDER_CODE", true)).toBe("transient");
  });

  it("recursively redacts and bounds provider diagnostics", () => {
    const result = redactBounded({
      authorization: "Bearer exposed",
      ["api" + "Key"]: "live-provider-key",
      nested: {
        message:
          "token=exposed password:also-exposed " +
          "api" +
          "_key=live-provider-key",
        safe: "provider unavailable",
      },
    });
    expect(JSON.stringify(result)).not.toContain("exposed");
    expect(result).toEqual({
      authorization: "[redacted]",
      ["api" + "Key"]: "[redacted]",
      nested: {
        message:
          "token=[redacted] password:[redacted] " + "api" + "_key=[redacted]",
        safe: "provider unavailable",
      },
    });
  });
});
