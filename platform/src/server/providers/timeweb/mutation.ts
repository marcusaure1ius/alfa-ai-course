import "server-only";

import {
  TIMEWEB_MUTATION_ADAPTER_VERSION,
  type OwnedProviderResource,
  type TimewebCreateServerInput,
  type TimewebMutationAdapter,
  type TimewebPublicIpReconciliation,
  type TimewebPublicIpResource,
  type TimewebServerReconciliation,
  type TimewebServerStatus,
  type TimewebSupportedStatus,
  type TimewebUpdateServerInput,
} from "./contracts";
import { TimewebProviderError } from "./read-only";
import { readTimewebMutationRuntimeGate } from "./runtime";

const API_ORIGIN = "https://api.timeweb.cloud";
const SERVER_COLLECTION_PATH = "/api/v1/servers";
const PUBLIC_IP_COLLECTION_PATH = "/api/v1/floating-ips";
const SERVER_ID = /^[1-9][0-9]{0,18}$/;
const PUBLIC_IP_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENVIRONMENT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AVAILABILITY_ZONE = /^[a-z0-9][a-z0-9-]{1,31}$/;
const IPV4 =
  /^(?:(?:25[0-5]|2[0-4][0-9]|1?[0-9]{1,2})\.){3}(?:25[0-5]|2[0-4][0-9]|1?[0-9]{1,2})$/;
const SUPPORTED_SERVER_STATUSES = new Set<TimewebSupportedStatus>([
  "on",
  "off",
  "installing",
  "reinstalling",
  "starting",
  "stopping",
  "rebooting",
  "shutting_down",
  "hard_rebooting",
  "hard_shutting_down",
  "blocked",
]);
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

function validZone(value: string): string {
  const zone = value.trim().toLowerCase();
  if (!AVAILABILITY_ZONE.test(zone)) {
    throw new TimewebProviderError(
      "INVALID_RESPONSE",
      "Availability zone не прошла локальную проверку.",
      false,
    );
  }
  return zone;
}

function validIpv4(value: string): string {
  const address = value.trim();
  if (!IPV4.test(address)) {
    throw new TimewebProviderError(
      "INVALID_RESPONSE",
      "Public IPv4 не прошёл локальную проверку.",
      false,
    );
  }
  return address;
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

function ownedPublicIp(
  resource: OwnedProviderResource & Readonly<{ kind: "public_ip" }>,
): OwnedProviderResource & Readonly<{ kind: "public_ip" }> {
  if (
    resource.kind !== "public_ip" ||
    !PUBLIC_IP_ID.test(resource.externalId) ||
    !ENVIRONMENT_ID.test(resource.environmentId)
  ) {
    throw new TimewebProviderError(
      "INVALID_RESPONSE",
      "Provider public IP не прошёл ownership-проверку.",
      false,
    );
  }
  return resource;
}

function providerError(status: number): TimewebProviderError {
  if (status === 400 || status === 422) {
    return new TimewebProviderError(
      "INVALID_REQUEST",
      "Timeweb отклонил validated mutation-запрос.",
      false,
    );
  }
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

function responseServerStatus(payload: unknown): TimewebServerStatus {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TimewebProviderError(
      "INVALID_RESPONSE",
      "Timeweb не вернул состояние сервера.",
      false,
    );
  }
  const server = (payload as Record<string, unknown>).server;
  if (!server || typeof server !== "object" || Array.isArray(server)) {
    throw new TimewebProviderError(
      "INVALID_RESPONSE",
      "Timeweb не вернул состояние сервера.",
      false,
    );
  }
  const raw = (server as Record<string, unknown>).status;
  const normalized =
    typeof raw === "string"
      ? raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 64)
      : "";
  if (SUPPORTED_SERVER_STATUSES.has(normalized as TimewebSupportedStatus)) {
    return {
      state: "supported",
      value: normalized as TimewebSupportedStatus,
    };
  }
  return {
    state: "unsupported",
    providerValue: normalized || "unknown",
  };
}

function responsePublicIp(payload: unknown, environmentId: string): TimewebPublicIpResource {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TimewebProviderError(
      "INVALID_RESPONSE",
      "Timeweb не вернул созданный публичный IP.",
      false,
    );
  }
  const ip = (payload as Record<string, unknown>).ip;
  if (!ip || typeof ip !== "object" || Array.isArray(ip)) {
    throw new TimewebProviderError(
      "INVALID_RESPONSE",
      "Timeweb не вернул созданный публичный IP.",
      false,
    );
  }
  const values = ip as Record<string, unknown>;
  const id = typeof values.id === "string" ? values.id : "";
  const address = typeof values.ip === "string" ? values.ip : "";
  if (!PUBLIC_IP_ID.test(id)) {
    throw new TimewebProviderError(
      "INVALID_RESPONSE",
      "Timeweb не вернул идентификатор публичного IP.",
      false,
    );
  }
  return {
    externalId: id,
    kind: "public_ip",
    environmentId,
    address: validIpv4(address),
  };
}

function objectArray(payload: unknown, key: string): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TimewebProviderError(
      "INVALID_RESPONSE",
      "Timeweb вернул коллекцию неизвестного формата.",
      false,
    );
  }
  const values = (payload as Record<string, unknown>)[key];
  if (!Array.isArray(values)) {
    throw new TimewebProviderError(
      "INVALID_RESPONSE",
      "Timeweb вернул коллекцию неизвестного формата.",
      false,
    );
  }
  return values.filter(
    (value): value is Record<string, unknown> =>
      Boolean(value) && typeof value === "object" && !Array.isArray(value),
  );
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
    body?: Readonly<Record<string, unknown>>,
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
      comment: `course-platform:${input.environmentId}`,
      preset_id: positiveInteger(input.presetId, "Preset"),
      os_id: positiveInteger(input.operatingSystemId, "Operating system"),
      availability_zone: validZone(input.availabilityZone),
      project_id: positiveInteger(input.projectId, "Project"),
      ssh_keys_ids: [positiveInteger(input.sshKeyId, "SSH key")],
      is_root_password_required: false,
      network: { floating_ip: "create_ip" },
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
    try {
      await this.request(
        "DELETE",
        `${SERVER_COLLECTION_PATH}/${verified.externalId}`,
      );
    } catch (error) {
      if (
        error instanceof TimewebProviderError &&
        error.code === "NOT_FOUND"
      ) {
        return;
      }
      throw error;
    }
  }

  async reconcileServer(
    resource: OwnedProviderResource & Readonly<{ kind: "server" }>,
  ): Promise<TimewebServerReconciliation> {
    const verified = ownedServer(resource);
    try {
      const response = await this.request(
        "GET",
        `${SERVER_COLLECTION_PATH}/${verified.externalId}`,
      );
      const payload = await response.json().catch(() => null);
      return {
        state: "present",
        resource: verified,
        status: responseServerStatus(payload),
      };
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

  async findServerByEnvironmentId(
    environmentId: string,
  ): Promise<(OwnedProviderResource & Readonly<{ kind: "server" }>) | null> {
    if (!ENVIRONMENT_ID.test(environmentId)) {
      throw new TimewebProviderError(
        "INVALID_RESPONSE",
        "Environment не прошёл локальную проверку.",
        false,
      );
    }
    const response = await this.request("GET", SERVER_COLLECTION_PATH);
    const marker = `course-platform:${environmentId}`;
    const matches = objectArray(
      await response.json().catch(() => null),
      "servers",
    ).filter((server) => server.comment === marker);
    if (matches.length > 1) {
      throw new TimewebProviderError(
        "INVALID_RESPONSE",
        "Timeweb вернул несколько owned server с одним environment marker.",
        false,
      );
    }
    if (!matches[0]) return null;
    const id = matches[0].id;
    const externalId =
      typeof id === "number" && Number.isSafeInteger(id) ? String(id) : id;
    if (typeof externalId !== "string" || !SERVER_ID.test(externalId)) {
      throw new TimewebProviderError(
        "INVALID_RESPONSE",
        "Timeweb вернул некорректный owned server ID.",
        false,
      );
    }
    return { externalId, kind: "server", environmentId };
  }

  async findPublicIpByServer(
    resource: OwnedProviderResource & Readonly<{ kind: "server" }>,
  ): Promise<TimewebPublicIpResource | null> {
    const server = ownedServer(resource);
    const response = await this.request("GET", PUBLIC_IP_COLLECTION_PATH);
    const matches = objectArray(
      await response.json().catch(() => null),
      "ips",
    ).filter((ip) => {
      const resourceId =
        typeof ip.resource_id === "number" && Number.isSafeInteger(ip.resource_id)
          ? String(ip.resource_id)
          : ip.resource_id;
      return ip.resource_type === "server" && resourceId === server.externalId;
    });
    if (matches.length > 1) {
      throw new TimewebProviderError(
        "INVALID_RESPONSE",
        "Timeweb вернул несколько IP для disposable server.",
        false,
      );
    }
    return matches[0]
      ? responsePublicIp({ ip: matches[0] }, server.environmentId)
      : null;
  }

  async deletePublicIp(
    resource: OwnedProviderResource & Readonly<{ kind: "public_ip" }>,
  ): Promise<void> {
    const verified = ownedPublicIp(resource);
    try {
      await this.request(
        "DELETE",
        `${PUBLIC_IP_COLLECTION_PATH}/${verified.externalId}`,
      );
    } catch (error) {
      if (
        error instanceof TimewebProviderError &&
        error.code === "NOT_FOUND"
      ) {
        return;
      }
      throw error;
    }
  }

  async reconcilePublicIp(
    resource: TimewebPublicIpResource,
  ): Promise<TimewebPublicIpReconciliation> {
    const verified = ownedPublicIp(resource);
    try {
      const response = await this.request(
        "GET",
        `${PUBLIC_IP_COLLECTION_PATH}/${verified.externalId}`,
      );
      const current = responsePublicIp(
        await response.json().catch(() => null),
        verified.environmentId,
      );
      return { state: "present", resource: current };
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
