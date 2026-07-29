import "server-only";

import {
  TIMEWEB_MUTATION_ADAPTER_VERSION,
  type OwnedProviderResource,
  type TimewebCreateServerInput,
  type TimewebMutationAdapter,
  type TimewebServerReconciliation,
  type TimewebUpdateServerInput,
} from "./contracts";
import { TimewebProviderError } from "./read-only";
import { readTimewebMutationRuntimeGate } from "./runtime";

const API_ORIGIN = "https://api.timeweb.cloud";
const SERVER_COLLECTION_PATH = "/api/v1/servers";
const SERVER_ID = /^[1-9][0-9]{0,18}$/;
const ENVIRONMENT_ID = /^[0-9a-f-]{36}$/i;
type FetchLike = typeof fetch;
type ServerEnvironment = Readonly<Record<string, string | undefined>>;

function validName(value: string): string {
  const name = value.trim();
  if (name.length < 2 || name.length > 255) {
    throw new TimewebProviderError(
      "INVALID_RESPONSE",
      "Имя сервера не прошло локальную проверку.",
      false,
    );
  }
  return name;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TimewebProviderError(
      "INVALID_RESPONSE",
      `${label} не прошёл локальную проверку.`,
      false,
    );
  }
  return value;
}

function ownedServer(
  resource: OwnedProviderResource & Readonly<{ kind: "server" }>,
): OwnedProviderResource & Readonly<{ kind: "server" }> {
  if (
    resource.kind !== "server" ||
    !SERVER_ID.test(resource.externalId) ||
    !ENVIRONMENT_ID.test(resource.environmentId)
  ) {
    throw new TimewebProviderError(
      "INVALID_RESPONSE",
      "Provider resource не прошёл ownership-проверку.",
      false,
    );
  }
  return resource;
}

function providerError(status: number): TimewebProviderError {
  if (status === 404) {
    return new TimewebProviderError(
      "NOT_FOUND",
      "Timeweb resource больше не существует.",
      false,
    );
  }
  if (status === 401) {
    return new TimewebProviderError(
      "UNAUTHORIZED",
      "Timeweb отклонил production token.",
      false,
    );
  }
  if (status === 403) {
    return new TimewebProviderError(
      "FORBIDDEN",
      "Production token не разрешает эту операцию.",
      false,
    );
  }
  if (status === 429) {
    return new TimewebProviderError(
      "RATE_LIMITED",
      "Timeweb временно ограничил частоту mutation-запросов.",
      true,
    );
  }
  return new TimewebProviderError(
    "UPSTREAM_UNAVAILABLE",
    "Timeweb не подтвердил mutation-запрос.",
    status >= 500 || status === 409 || status === 423,
  );
}

function responseServerId(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TimewebProviderError(
      "INVALID_RESPONSE",
      "Timeweb не вернул идентификатор созданного сервера.",
      false,
    );
  }
  const server = (payload as Record<string, unknown>).server;
  if (!server || typeof server !== "object" || Array.isArray(server)) {
    throw new TimewebProviderError(
      "INVALID_RESPONSE",
      "Timeweb не вернул идентификатор созданного сервера.",
      false,
    );
  }
  const id = (server as Record<string, unknown>).id;
  const value =
    typeof id === "number" && Number.isSafeInteger(id) ? String(id) : id;
  if (typeof value !== "string" || !SERVER_ID.test(value)) {
    throw new TimewebProviderError(
      "INVALID_RESPONSE",
      "Timeweb не вернул идентификатор созданного сервера.",
      false,
    );
  }
  return value;
}

export class TimewebMutationHttpAdapter implements TimewebMutationAdapter {
  readonly version = TIMEWEB_MUTATION_ADAPTER_VERSION;
  readonly #token: string;

  constructor(
    token: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = 8_000,
  ) {
    if (token.length < 8) {
      throw new TimewebProviderError(
        "NOT_CONFIGURED",
        "Production Timeweb token не настроен.",
        false,
      );
    }
    this.#token = token;
  }

  private async request(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: Readonly<Record<string, string | number>>,
  ): Promise<Response> {
    try {
      const response = await this.fetchImpl(`${API_ORIGIN}${path}`, {
        method,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.#token}`,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: "no-store",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) throw providerError(response.status);
      return response;
    } catch (error) {
      if (error instanceof TimewebProviderError) throw error;
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new TimewebProviderError(
          "TIMEOUT",
          "Timeweb не ответил за безопасный mutation-интервал.",
          true,
        );
      }
      throw new TimewebProviderError(
        "UPSTREAM_UNAVAILABLE",
        "Timeweb временно недоступен для mutation-запроса.",
        true,
      );
    }
  }

  async createServer(
    input: TimewebCreateServerInput,
  ): Promise<OwnedProviderResource & Readonly<{ kind: "server" }>> {
    if (!ENVIRONMENT_ID.test(input.environmentId)) {
      throw new TimewebProviderError(
        "INVALID_RESPONSE",
        "Environment не прошёл локальную проверку.",
        false,
      );
    }
    const response = await this.request("POST", SERVER_COLLECTION_PATH, {
      name: validName(input.name),
      preset_id: positiveInteger(input.presetId, "Preset"),
      os_id: positiveInteger(input.operatingSystemId, "Operating system"),
    });
    const payload = await response.json().catch(() => null);
    return {
      externalId: responseServerId(payload),
      kind: "server",
      environmentId: input.environmentId,
    };
  }

  async updateServer(input: TimewebUpdateServerInput): Promise<void> {
    const resource = ownedServer(input.resource);
    await this.request(
      "PATCH",
      `${SERVER_COLLECTION_PATH}/${resource.externalId}`,
      { name: validName(input.name) },
    );
  }

  async deleteServer(
    resource: OwnedProviderResource & Readonly<{ kind: "server" }>,
  ): Promise<void> {
    const verified = ownedServer(resource);
    await this.request(
      "DELETE",
      `${SERVER_COLLECTION_PATH}/${verified.externalId}`,
    );
  }

  async reconcileServer(
    resource: OwnedProviderResource & Readonly<{ kind: "server" }>,
  ): Promise<TimewebServerReconciliation> {
    const verified = ownedServer(resource);
    try {
      await this.request(
        "GET",
        `${SERVER_COLLECTION_PATH}/${verified.externalId}`,
      );
      return { state: "present", resource: verified };
    } catch (error) {
      if (
        error instanceof TimewebProviderError &&
        error.code === "NOT_FOUND"
      ) {
        return { state: "absent" };
      }
      throw error;
    }
  }
}

/**
 * The real adapter can only be constructed after all production kill-switches
 * pass. Preview, development and tests cannot obtain a mutation adapter.
 */
export function createProductionTimewebMutationAdapter(
  environment: ServerEnvironment = process.env,
  fetchImpl: FetchLike = fetch,
): TimewebMutationHttpAdapter | null {
  const gate = readTimewebMutationRuntimeGate(environment);
  if (gate.mode !== "timeweb") return null;
  return new TimewebMutationHttpAdapter(
    environment.TIMEWEB_API_TOKEN!,
    fetchImpl,
  );
}
