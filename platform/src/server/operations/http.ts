import "server-only";

import type { FakeScenario } from "./contracts";

const scenarios = new Set<FakeScenario>([
  "success",
  "timeout_after_create",
  "insufficient_funds",
  "dns_failure",
  "tls_failure",
  "backup_unavailable",
  "partial_cleanup",
]);

export function hasOnlyInputKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

export function fakeScenario(value: unknown): FakeScenario {
  if (
    process.env.VERCEL_ENV !== "production" &&
    typeof value === "string" &&
    scenarios.has(value as FakeScenario)
  ) {
    return value as FakeScenario;
  }
  return "success";
}

export function operationError(
  status: 400 | 403 | 409 | 500,
  code: string,
  message: string,
  correlationId = crypto.randomUUID(),
): Response {
  return Response.json(
    { version: "v1", error: { code, message, correlationId } },
    { status, headers: { "cache-control": "no-store" } },
  );
}
