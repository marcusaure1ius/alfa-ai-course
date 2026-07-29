import "server-only";

import { safeEqual } from "../auth/crypto";

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
        | "PROVIDER_NOT_FAKE";
    }>;

/**
 * T-0055 runs reconciliation only in the production Cron environment and only
 * against the fake provider. Real provider reconciliation has a separate gate.
 */
export function authorizeFakeReconciliationCron(
  request: Request,
  environment: ServerEnvironment = process.env,
): CronAuthorization {
  if (environment.VERCEL_ENV !== "production") {
    return { ok: false, status: 404, code: "CRON_NOT_PRODUCTION" };
  }
  if (environment.PLATFORM_PROVIDER !== "fake") {
    return { ok: false, status: 503, code: "PROVIDER_NOT_FAKE" };
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
