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
import { readTimewebRuntimeGate } from "./runtime";

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

export function createTimewebReadAdapter(
  environment: ServerEnvironment = process.env,
  fetchImpl: typeof fetch = fetch,
): {
  gate: ReturnType<typeof readTimewebRuntimeGate>;
  adapter: TimewebReadAdapter | null;
} {
  const gate = readTimewebRuntimeGate(environment);
  if (gate.mode === "fake") {
    return { gate, adapter: new FakeTimewebReadAdapter() };
  }
  if (gate.mode === "blocked") {
    return { gate, adapter: null };
  }
  return {
    gate,
    adapter: new TimewebReadOnlyAdapter(environment.TIMEWEB_API_TOKEN ?? "", fetchImpl),
  };
}

export async function checkTimewebConnection(
  environment: ServerEnvironment = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<TimewebConnectionCheck> {
  const checkedAt = new Date().toISOString();
  const { gate, adapter } = createTimewebReadAdapter(environment, fetchImpl);
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
    const mode = gate.mode === "fake" ? "fake" : "timeweb";
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
