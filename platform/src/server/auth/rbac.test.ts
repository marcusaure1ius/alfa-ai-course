import { describe, expect, it } from "vitest";

import {
  hasFreshReauthentication,
  hasPermission,
  requiresProductionMfa,
} from "./rbac";

describe("RBAC", () => {
  it("denies unknown roles and student admin access by default", () => {
    expect(hasPermission("student", "admin:access")).toBe(false);
    expect(hasPermission("owner", "admin:access")).toBe(false);
    expect(hasPermission("", "student:home")).toBe(false);
  });

  it("allows only declared permissions", () => {
    expect(hasPermission("admin", "infrastructure:manage")).toBe(true);
    expect(hasPermission("student", "user:self")).toBe(true);
    expect(hasPermission("student", "audit:read")).toBe(false);
  });

  it("enforces MFA in production only after the admin enrolled a factor", () => {
    expect(requiresProductionMfa("admin", "production", false)).toBe(false);
    expect(requiresProductionMfa("admin", "production", true)).toBe(true);
    expect(requiresProductionMfa("admin", "production", true, true)).toBe(false);
    expect(requiresProductionMfa("admin", "preview", false)).toBe(false);
    expect(requiresProductionMfa("student", "production", false)).toBe(false);
  });

  it("limits fresh reauthentication to ten minutes", () => {
    const now = new Date("2026-07-29T12:10:00.000Z");
    expect(
      hasFreshReauthentication(new Date("2026-07-29T12:00:00.000Z"), now),
    ).toBe(true);
    expect(
      hasFreshReauthentication(new Date("2026-07-29T11:59:59.999Z"), now),
    ).toBe(false);
  });
});
