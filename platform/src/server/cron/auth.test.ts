import { describe, expect, it } from "vitest";

import { authorizeReconciliationCron } from "./auth";

const secret = "synthetic-cron-secret-with-at-least-32-characters";

function request(value?: string): Request {
  return new Request("https://course.example.test/api/cron/reconcile", {
    headers: value ? { authorization: value } : undefined,
  });
}

describe("authorizeReconciliationCron", () => {
  it("hides the route outside production without reading a valid credential", () => {
    expect(
      authorizeReconciliationCron(request(`Bearer ${secret}`), {
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

  it("fails closed when the provider or secret gates are missing", () => {
    expect(
      authorizeReconciliationCron(request(`Bearer ${secret}`), {
        VERCEL_ENV: "production",
        PLATFORM_PROVIDER: "timeweb",
        CRON_SECRET: secret,
      }),
    ).toEqual({
      ok: false,
      status: 503,
      code: "PROVIDER_GATE_CLOSED",
    });
    expect(
      authorizeReconciliationCron(request(), {
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
      authorizeReconciliationCron(request("Bearer wrong"), environment),
    ).toEqual({
      ok: false,
      status: 401,
      code: "CRON_UNAUTHORIZED",
    });
    expect(
      authorizeReconciliationCron(
        request(`Bearer ${secret}`),
        environment,
      ),
    ).toEqual({ ok: true });
  });

  it("allows a fully gated production Timeweb reconciliation", () => {
    expect(
      authorizeReconciliationCron(request(`Bearer ${secret}`), {
        VERCEL_ENV: "production",
        PLATFORM_PROVIDER: "timeweb",
        TIMEWEB_API_TOKEN: "synthetic-test-token",
        TIMEWEB_MUTATIONS_ENABLED: "true",
        TIMEWEB_CAPABILITIES_VERIFIED: "true",
        TIMEWEB_SMOKE_EXCLUSIVE_ACCOUNT: "true",
        CRON_SECRET: secret,
      }),
    ).toEqual({ ok: true });
  });
});
