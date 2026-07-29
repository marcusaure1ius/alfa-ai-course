import { describe, expect, it } from "vitest";

import { authorizeFakeReconciliationCron } from "./auth";

const secret = "synthetic-cron-secret-with-at-least-32-characters";

function request(value?: string): Request {
  return new Request("https://course.example.test/api/cron/reconcile", {
    headers: value ? { authorization: value } : undefined,
  });
}

describe("authorizeFakeReconciliationCron", () => {
  it("hides the route outside production without reading a valid credential", () => {
    expect(
      authorizeFakeReconciliationCron(request(`Bearer ${secret}`), {
        VERCEL_ENV: "preview",
        PLATFORM_PROVIDER: "fake",
        CRON_SECRET: secret,
      }),
    ).toEqual({
      ok: false,
      status: 404,
      code: "CRON_NOT_PRODUCTION",
    });
  });

  it("fails closed when the fake-provider or secret gates are missing", () => {
    expect(
      authorizeFakeReconciliationCron(request(`Bearer ${secret}`), {
        VERCEL_ENV: "production",
        PLATFORM_PROVIDER: "timeweb",
        CRON_SECRET: secret,
      }),
    ).toEqual({
      ok: false,
      status: 503,
      code: "PROVIDER_NOT_FAKE",
    });
    expect(
      authorizeFakeReconciliationCron(request(), {
        VERCEL_ENV: "production",
        PLATFORM_PROVIDER: "fake",
      }),
    ).toEqual({
      ok: false,
      status: 503,
      code: "CRON_NOT_CONFIGURED",
    });
  });

  it("requires the exact bearer credential", () => {
    const environment = {
      VERCEL_ENV: "production",
      PLATFORM_PROVIDER: "fake",
      CRON_SECRET: secret,
    };
    expect(
      authorizeFakeReconciliationCron(request("Bearer wrong"), environment),
    ).toEqual({
      ok: false,
      status: 401,
      code: "CRON_UNAUTHORIZED",
    });
    expect(
      authorizeFakeReconciliationCron(
        request(`Bearer ${secret}`),
        environment,
      ),
    ).toEqual({ ok: true });
  });
});
