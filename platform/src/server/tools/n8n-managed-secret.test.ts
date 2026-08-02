import { describe, expect, it } from "vitest";

import { deriveN8nGatewayManagementSecret } from "./n8n-managed-secret";

describe("managed n8n gateway secret", () => {
  it("derives a stable domain-separated secret without exposing AUTH_SECRET", () => {
    const authSecret = "managed-example-not-a-secret-32-characters";
    const derived = deriveN8nGatewayManagementSecret(authSecret);
    expect(derived).toBe("Rtl891vGMtRYbI1CJ2xgK-Q1HKDYI61sdphk5oFufZ8");
    expect(derived).not.toContain(authSecret);
    expect(deriveN8nGatewayManagementSecret(authSecret)).toBe(derived);
    expect(
      deriveN8nGatewayManagementSecret(`${authSecret}-rotated`),
    ).not.toBe(derived);
  });
});
