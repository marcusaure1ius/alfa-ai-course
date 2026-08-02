import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getStudentN8nAccess: vi.fn(),
}));

vi.mock("@/server/tools/student-access", () => ({
  getStudentN8nAccess: mocks.getStudentN8nAccess,
}));

import { getStudentToolCatalog } from "./student-catalog";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getStudentToolCatalog", () => {
  it("uses the same effective n8n entitlement loader as the detail route", async () => {
    const effectiveAccess = {
      tool: "n8n" as const,
      displayName: "n8n" as const,
      state: "service_disabled" as const,
      launchUrl: null,
      expiresAt: "2026-09-01T00:00:00.000Z",
    };
    mocks.getStudentN8nAccess.mockResolvedValue(effectiveAccess);
    const sql = vi.fn();

    const catalog = await getStudentToolCatalog(sql as never, "student-1");

    expect(mocks.getStudentN8nAccess).toHaveBeenCalledWith(sql, "student-1");
    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.entitlement).toEqual({
      toolType: "n8n",
      state: "service_disabled",
      launchUrl: null,
      expiresAt: "2026-09-01T00:00:00.000Z",
    });
  });
});
