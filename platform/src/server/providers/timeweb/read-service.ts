import "server-only";

import {
  TIMEWEB_READ_DTO_VERSION,
  type TimewebConnectionCheck,
  type TimewebReadAdapter,
} from "./contracts";
import { FakeTimewebReadAdapter } from "./read-only-fake";
import {
  TimewebProviderError,
  TimewebReadOnlyAdapter,
} from "./read-only";
import {
  readCloudProviderRuntime,
  runtimeUsesProvider,
} from "../runtime";

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

const PUBLISHED_PRICE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const PUBLISHED_PRICE_FUTURE_TOLERANCE_MS = 5 * 60 * 1_000;

export function readDocumentedPublicIpMonthlyRoubles(
  environment: ServerEnvironment,
  now = new Date(),
): number | null {
  const rawPrice = environment.TIMEWEB_PUBLIC_IPV4_MONTHLY_ROUBLES?.trim();
  const rawVerifiedAt = environment.TIMEWEB_PUBLIC_IPV4_PRICE_VERIFIED_AT?.trim();
  if (
    !rawPrice ||
    !/^\d{1,5}(?:\.\d{1,2})?$/.test(rawPrice) ||
    !rawVerifiedAt
  ) {
    return null;
  }

  const price = Number(rawPrice);
  const verifiedAt = Date.parse(rawVerifiedAt);
  const ageMs = now.getTime() - verifiedAt;
  if (
    !Number.isFinite(price) ||
    price <= 0 ||
    price > 10_000 ||
    !Number.isFinite(verifiedAt) ||
    ageMs < -PUBLISHED_PRICE_FUTURE_TOLERANCE_MS ||
    ageMs > PUBLISHED_PRICE_MAX_AGE_MS
  ) {
    return null;
  }

  return price;
}

export function createTimewebReadAdapter(
  environment: ServerEnvironment = process.env,
  fetchImpl: typeof fetch = fetch,
): {
  runtime: ReturnType<typeof readCloudProviderRuntime>;
  adapter: TimewebReadAdapter | null;
} {
  const runtime = readCloudProviderRuntime(environment);
  if (runtime.mode === "fake") {
    return { runtime, adapter: new FakeTimewebReadAdapter() };
  }
  if (!runtimeUsesProvider(runtime, "timeweb")) {
    return { runtime, adapter: null };
  }
  return {
    runtime,
    adapter: new TimewebReadOnlyAdapter(
      environment.TIMEWEB_API_TOKEN ?? "",
      fetchImpl,
      8_000,
      readDocumentedPublicIpMonthlyRoubles(environment),
    ),
  };
}

export async function checkTimewebConnection(
  environment: ServerEnvironment = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<TimewebConnectionCheck> {
  const checkedAt = new Date().toISOString();
  const { runtime, adapter } = createTimewebReadAdapter(environment, fetchImpl);
  if (!adapter) {
    const error = new TimewebProviderError(
      "NOT_CONFIGURED",
      "Production Timeweb token не настроен.",
      false,
    );
    return {
      version: TIMEWEB_READ_DTO_VERSION,
      ok: false,
      mode: "blocked",
      status: "unavailable",
      checkedAt,
      error: error.toJSON(),
    };
  }

  try {
    const catalog = await adapter.discover();
    const mode = runtime.mode === "fake" ? "fake" : "timeweb";
    return {
      version: TIMEWEB_READ_DTO_VERSION,
      ok: true,
      mode,
      status:
        mode === "fake"
          ? "fake"
          : catalog.degraded || catalog.account.state === "blocked"
            ? "degraded"
            : "ready",
      checkedAt: catalog.checkedAt,
      catalog,
    };
  } catch (error) {
    const safeError =
      error instanceof TimewebProviderError
        ? error
        : new TimewebProviderError(
            "UPSTREAM_UNAVAILABLE",
            "Timeweb временно недоступен для read-only проверки.",
            true,
          );
    return {
      version: TIMEWEB_READ_DTO_VERSION,
      ok: false,
      mode: "timeweb",
      status: "unavailable",
      checkedAt,
      error: safeError.toJSON(),
    };
  }
}
