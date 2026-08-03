import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const sql = vi.fn(async () => []);
  return {
    requireAdmin: vi.fn(),
    getDatabase: vi.fn(() => sql),
    sql,
  };
});

vi.mock("@/server/auth/access", () => ({
  requireAdmin: mocks.requireAdmin,
  requireFreshAdmin: vi.fn(),
}));
vi.mock("@/server/db/client", () => ({ getDatabase: mocks.getDatabase }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({
    ok: true,
    session: { role: "admin", userId: "admin-1" },
  });
});

describe("GET /api/admin/infrastructure/environments", () => {
  it("passes the selected service type into the environment query", async () => {
    const response = await GET(new Request(
      "https://course.example.test/api/admin/infrastructure/environments?toolType=n8n",
    ));
    expect(response.status).toBe(200);
    expect(mocks.sql).toHaveBeenCalledTimes(1);
    expect(mocks.sql.mock.calls[0]?.slice(1)).toContain("n8n");
  });

  it("rejects malformed tool types before querying environments", async () => {
    const response = await GET(new Request(
      "https://course.example.test/api/admin/infrastructure/environments?toolType=n8n%2Fother",
    ));
    expect(response.status).toBe(400);
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it("fails closed when the service type is missing", async () => {
    const response = await GET(new Request(
      "https://course.example.test/api/admin/infrastructure/environments",
    ));
    expect(response.status).toBe(400);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
});
