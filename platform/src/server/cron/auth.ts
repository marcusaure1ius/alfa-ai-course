import "server-only";

import { safeEqual } from "../auth/crypto";
import { readCloudProviderRuntime } from "../providers/runtime";

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

export type CronAuthorization =
  | Readonly<{ ok: true }>
  | Readonly<{
      ok: false;
      status: 401 | 404 | 503;
      code:
        | "CRON_NOT_PRODUCTION"
        | "CRON_UNAUTHORIZED"
        | "CRON_NOT_CONFIGURED"
        | "PROVIDER_GATE_CLOSED";
    }>;

/**
 * Production Cron uses the same fail-closed provider gates as Workflow.
 */
export function authorizeReconciliationCron(
  request: Request,
  environment: ServerEnvironment = process.env,
): CronAuthorization {
  if (environment.VERCEL_ENV !== "production") {
    return { ok: false, status: 404, code: "CRON_NOT_PRODUCTION" };
  }
  if (
    environment.PLATFORM_PROVIDER !== "fake" &&
    readCloudProviderRuntime(environment).mode !== "provider"
  ) {
    return { ok: false, status: 503, code: "PROVIDER_GATE_CLOSED" };
  }
  const secret = environment.CRON_SECRET;
  if (!secret || secret.length < 32) {
    return { ok: false, status: 503, code: "CRON_NOT_CONFIGURED" };
  }
  const authorization = request.headers.get("authorization") ?? "";
  if (!safeEqual(authorization, `Bearer ${secret}`)) {
    return { ok: false, status: 401, code: "CRON_UNAUTHORIZED" };
  }
  return { ok: true };
}
