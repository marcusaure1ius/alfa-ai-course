import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getStudentN8nAccess: vi.fn(),
}));

vi.mock("@/server/tools/student-access", () => ({
  getStudentN8nAccess: mocks.getStudentN8nAccess,
}));

import { getStudentToolCatalog, toStudentToolEntitlement } from "./student-catalog";
import type { StudentN8nAccess } from "./student-access";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getStudentToolCatalog", () => {
  it("uses the same effective n8n entitlement loader as the detail route", async () => {
    const effectiveAccess = {
      tool: "n8n" as const,
      displayName: "n8n" as const,
      state: "service_disabled" as const,
      canLaunch: false as const,
      launchUrl: null,
      inviteUrl: null,
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
      expiresAt: "2026-09-01T00:00:00.000Z",
    });
  });

  it.each([
    ["locked", "locked"],
    ["license_blocked", "attention"],
    ["service_disabled", "service_disabled"],
    ["preparing", "preparing"],
    ["owner_setup_required", "preparing"],
    ["invite_pending", "available"],
    ["ready", "available"],
    ["attention", "attention"],
    ["expired", "expired"],
  ] as const)("maps n8n %s into generic %s", (state, expected) => {
    const access: StudentN8nAccess =
      state === "ready"
        ? {
            tool: "n8n",
            displayName: "n8n",
            state,
            canLaunch: true,
            launchUrl: "https://n8n.example.test",
            inviteUrl: null,
            expiresAt: null,
          }
        : state === "invite_pending"
        ? {
            tool: "n8n",
            displayName: "n8n",
            state,
            canLaunch: true,
            launchUrl: "https://n8n.example.test",
            inviteUrl: "https://n8n.example.test/signup?token=invite-token",
            expiresAt: null,
          }
        : {
            tool: "n8n",
            displayName: "n8n",
            state,
            canLaunch: false,
            launchUrl: null,
            inviteUrl: null,
            expiresAt: null,
          };
    expect(toStudentToolEntitlement(access)).toEqual({
      toolType: "n8n",
      state: expected,
      expiresAt: null,
    });
  });
});
