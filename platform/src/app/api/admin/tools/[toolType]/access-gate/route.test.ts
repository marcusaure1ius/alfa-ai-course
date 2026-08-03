import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  verifyCsrfRequest: vi.fn(),
  setToolServiceAccess: vi.fn(),
  getDatabase: vi.fn(() => ({ database: true })),
}));

vi.mock("@/server/auth/access", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/server/auth/csrf", () => ({ verifyCsrfRequest: mocks.verifyCsrfRequest }));
vi.mock("@/server/db/client", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@/server/tools/service-access", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/tools/service-access")>();
  return { ...original, setToolServiceAccess: mocks.setToolServiceAccess };
});

import { PUT } from "./route";

const adminSession = {
  sessionId: "session-1",
  userId: "admin-1",
  email: "admin@example.test",
  role: "admin" as const,
  expiresAt: new Date("2026-08-03T00:00:00.000Z"),
  reauthenticatedAt: new Date("2026-08-02T00:00:00.000Z"),
  mfaAuthenticatedAt: null,
};

function request(body = { enabled: false }): Request {
  return new Request("https://course.example.test/api/admin/tools/n8n/access-gate", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyCsrfRequest.mockReturnValue(true);
  mocks.requireAdmin.mockResolvedValue({ ok: true, session: adminSession });
  mocks.setToolServiceAccess.mockResolvedValue({
    toolType: "n8n", enabled: false, changed: true, affectedAssignments: 2,
  });
});

describe("PUT /api/admin/tools/[toolType]/access-gate", () => {
  it("rejects missing or invalid CSRF before auth and mutation", async () => {
    mocks.verifyCsrfRequest.mockReturnValue(false);
    const response = await PUT(request(), { params: Promise.resolve({ toolType: "n8n" }) });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "CSRF" } });
    expect(mocks.requireAdmin).not.toHaveBeenCalled();
    expect(mocks.setToolServiceAccess).not.toHaveBeenCalled();
  });

  it("rejects non-admin sessions without touching the gate", async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 }),
    });
    const response = await PUT(request(), { params: Promise.resolve({ toolType: "n8n" }) });
    expect(response.status).toBe(403);
    expect(mocks.setToolServiceAccess).not.toHaveBeenCalled();
  });

  it("passes only the scoped service decision for an authorized request", async () => {
    const response = await PUT(request(), { params: Promise.resolve({ toolType: "n8n" }) });
    expect(response.status).toBe(200);
    expect(mocks.setToolServiceAccess).toHaveBeenCalledWith(
      { database: true },
      adminSession,
      { toolType: "n8n", enabled: false },
      { requestId: undefined },
    );
    expect(await response.json()).toMatchObject({
      toolType: "n8n", enabled: false, affectedAssignments: 2,
    });
  });
});
