import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cleanupExpiredN8nInvites, getDatabase, reconcileOrphanedFakeWorkflows } =
  vi.hoisted(() => ({
    cleanupExpiredN8nInvites: vi.fn(),
    getDatabase: vi.fn(() => ({ kind: "database" })),
  reconcileOrphanedFakeWorkflows: vi.fn(),
  }));

vi.mock("@/server/cron/reconcile", () => ({
  reconcileOrphanedFakeWorkflows,
}));
vi.mock("@/server/db/client", () => ({ getDatabase }));
vi.mock("@/server/tools/n8n-invite", () => ({ cleanupExpiredN8nInvites }));

import { GET } from "./route";

const originalEnvironment = {
  VERCEL_ENV: process.env.VERCEL_ENV,
  PLATFORM_PROVIDER: process.env.PLATFORM_PROVIDER,
  CRON_SECRET: process.env.CRON_SECRET,
  TIMEWEB_API_TOKEN: process.env.TIMEWEB_API_TOKEN,
};
const secret = "synthetic-cron-secret-with-at-least-32-characters";

beforeEach(() => {
  process.env.VERCEL_ENV = "production";
  process.env.PLATFORM_PROVIDER = "fake";
  process.env.CRON_SECRET = secret;
  delete process.env.TIMEWEB_API_TOKEN;
  reconcileOrphanedFakeWorkflows.mockReset();
  cleanupExpiredN8nInvites.mockReset().mockResolvedValue(3);
  getDatabase.mockClear();
});

afterEach(() => {
  process.env.VERCEL_ENV = originalEnvironment.VERCEL_ENV;
  process.env.PLATFORM_PROVIDER = originalEnvironment.PLATFORM_PROVIDER;
  process.env.CRON_SECRET = originalEnvironment.CRON_SECRET;
  process.env.TIMEWEB_API_TOKEN = originalEnvironment.TIMEWEB_API_TOKEN;
});

describe("GET /api/cron/reconcile", () => {
  it("does not touch the database-backed service without valid authorization", async () => {
    const response = await GET(
      new Request("https://course.example.test/api/cron/reconcile"),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      version: "cron-reconcile-v1",
      error: { code: "CRON_UNAUTHORIZED" },
    });
    expect(reconcileOrphanedFakeWorkflows).not.toHaveBeenCalled();
    expect(cleanupExpiredN8nInvites).not.toHaveBeenCalled();
  });

  it("returns only bounded aggregate reconciliation counters", async () => {
    reconcileOrphanedFakeWorkflows.mockResolvedValue({
      version: "cron-reconcile-v1",
      claimed: 2,
      started: 1,
      released: 1,
    });
    const response = await GET(
      new Request("https://course.example.test/api/cron/reconcile", {
        headers: { authorization: `Bearer ${secret}` },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({
      version: "cron-reconcile-v1",
      claimed: 2,
      started: 1,
      released: 1,
      clearedN8nInvites: 3,
    });
    expect(JSON.stringify(body)).not.toMatch(
      /operationId|workflow_run_id|token|secret|error_message/i,
    );
    expect(cleanupExpiredN8nInvites).toHaveBeenCalledWith({ kind: "database" });
  });

  it("runs security cleanup even when the provider workflow gate is closed", async () => {
    process.env.PLATFORM_PROVIDER = "timeweb";
    delete process.env.TIMEWEB_API_TOKEN;
    const response = await GET(
      new Request("https://course.example.test/api/cron/reconcile", {
        headers: { authorization: `Bearer ${secret}` },
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      version: "cron-reconcile-v1",
      clearedN8nInvites: 3,
      error: { code: "PROVIDER_GATE_CLOSED" },
    });
    expect(cleanupExpiredN8nInvites).toHaveBeenCalledOnce();
    expect(reconcileOrphanedFakeWorkflows).not.toHaveBeenCalled();
  });
});
