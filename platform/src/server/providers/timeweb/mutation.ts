import "server-only";

import {
  TIMEWEB_MUTATION_ADAPTER_VERSION,
  type OwnedProviderResource,
  type TimewebAutoBackupSettings,
  type TimewebCreateServerInput,
  type TimewebDnsRecord,
  type TimewebMutationAdapter,
  type TimewebPublicIpCandidate,
  type TimewebPublicIpReconciliation,
  type TimewebPublicIpResource,
  type TimewebServerReconciliation,
  type TimewebServerStatus,
  type TimewebSupportedStatus,
  type TimewebUpdateServerInput,
} from "./contracts";
import {
  buildStarterKitCloudInit,
  COURSE_SERVER_HOSTNAME,
} from "./bootstrap-profile";
import { TimewebProviderError } from "./read-only";
import { readTimewebMutationRuntimeGate } from "./runtime";

const API_ORIGIN = "https://api.timeweb.cloud";
const MUTATION_REQUEST_TIMEOUT_MS = 60_000;
const RECONCILIATION_REQUEST_TIMEOUT_MS = 8_000;
const SERVER_COLLECTION_PATH = "/api/v1/servers";
const PUBLIC_IP_COLLECTION_PATH = "/api/v1/floating-ips";
const DNS_RECORD_ID = /^[1-9][0-9]{0,18}$/;
const SERVER_ID = /^[1-9][0-9]{0,18}$/;
const PUBLIC_IP_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENVIRONMENT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AVAILABILITY_ZONE = /^[a-z0-9][a-z0-9-]{1,31}$/;
const IPV4 =
  /^(?:(?:25[0-5]|2[0-4][0-9]|1?[0-9]{1,2})\.){3}(?:25[0-5]|2[0-4][0-9]|1?[0-9]{1,2})$/;
const DNS_NAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const SERVER_HOSTNAME =
  /^(?=.{1,63}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const SUPPORTED_SERVER_STATUSES = new Set<TimewebSupportedStatus>([
  "on",
  "off",
  "installing",
  "software_install",
  "reinstalling",
  "turning_on",
  "turning_off",
  "hard_turning_off",
  "rebooting",
  "hard_rebooting",
  "removing",
  "removed",
  "cloning",
  "transfer",
  "blocked",
  "configuring",
  "no_paid",
  "permanent_blocked",
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

function validDnsName(value: string, label: string): string {
  const name = value.trim().toLowerCase().replace(/\.$/, "");
  if (!DNS_NAME.test(name)) {
    throw new TimewebProviderError(
      "INVALID_RESPONSE",
      `${label} не прошло локальную DNS-проверку.`,
      false,
    );
  }
  return name;
}

function validServerHostname(value: string): string {
  const hostname = value.trim().toLowerCase();
  if (!SERVER_HOSTNAME.test(hostname)) {
    throw new TimewebProviderError(
      "INVALID_RESPONSE",
      "Server hostname не прошёл локальную проверку.",
      false,
    );
  }
  return hostname;
}

function dnsRecordListPath(hostname: string): string {
  const verifiedHostname = validDnsName(hostname, "DNS hostname");
  return `/api/v1/domains/${encodeURIComponent(verifiedHostname)}/dns-records`;
}

function dnsRecordMutationPath(
  hostname: string,
  recordId?: string,
): string {
  const verifiedHostname = validDnsName(hostname, "DNS hostname");
  const base =
    `/api/v2/domains/${encodeURIComponent(verifiedHostname)}/dns-records`;
  if (recordId === undefined) return base;
  if (!DNS_RECORD_ID.test(recordId)) {
    throw new TimewebProviderError(
      "INVALID_RESPONSE",
      "DNS record ID не прошёл локальную проверку.",
      false,
    );
  }
  return `${base}/${recordId}`;
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

async function safeProviderErrorCode(
  response: Response,
): Promise<string | null> {
  const payload = await response.clone().json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const value = (payload as Record<string, unknown>).error_code;
  return typeof value === "string" && /^[a-z0-9_.-]{1,64}$/i.test(value)
    ? value.toLowerCase()
    : null;
}

async function providerError(response: Response): Promise<TimewebProviderError> {
  const status = response.status;
  const safeCode = await safeProviderErrorCode(response);
  const diagnostic = safeCode ? `, code ${safeCode}` : "";
  if (status === 400 || status === 422) {
    return new TimewebProviderError(
      "INVALID_REQUEST",
      `Timeweb отклонил validated mutation-запрос (HTTP ${status}${diagnostic}).`,
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
  if (status === 423) {
    return new TimewebProviderError(
      "FORBIDDEN",
      "Timeweb требует внешний код подтверждения удаления; automatic delete запрещён.",
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
  if (status === 409) {
    return new TimewebProviderError(
      "INVALID_REQUEST",
      `Timeweb отклонил конфликтующий mutation-запрос (HTTP 409${diagnostic}).`,
      false,
    );
  }
  return new TimewebProviderError(
    "UPSTREAM_UNAVAILABLE",
    `Timeweb не подтвердил mutation-запрос (HTTP ${status}${diagnostic}).`,
    status >= 500,
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

function publicIpCandidate(
  values: Record<string, unknown>,
  environmentId: string,
): TimewebPublicIpCandidate {
  const resource = responsePublicIp({ ip: values }, environmentId);
  const rawResourceId = values.resource_id;
  const resourceId =
    typeof rawResourceId === "number" && Number.isSafeInteger(rawResourceId)
      ? String(rawResourceId)
      : typeof rawResourceId === "string"
        ? rawResourceId
        : null;
  return {
    ...resource,
    availabilityZone: validZone(String(values.availability_zone ?? "")),
    resourceType:
      typeof values.resource_type === "string"
        ? values.resource_type.trim().toLowerCase().slice(0, 32)
        : null,
    resourceId,
  };
}

function dnsRecordId(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TimewebProviderError(
      "INVALID_RESPONSE",
      "Timeweb не вернул созданную DNS-запись.",
      false,
    );
  }
  const record = (payload as Record<string, unknown>).dns_record;
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new TimewebProviderError(
      "INVALID_RESPONSE",
      "Timeweb не вернул созданную DNS-запись.",
      false,
    );
  }
  const raw = (record as Record<string, unknown>).id;
  const id =
    typeof raw === "number" && Number.isSafeInteger(raw) ? String(raw) : raw;
  if (typeof id !== "string" || !DNS_RECORD_ID.test(id)) {
    throw new TimewebProviderError(
      "INVALID_RESPONSE",
      "Timeweb не вернул DNS record ID.",
      false,
    );
  }
  return id;
}

function dnsARecord(
  value: Record<string, unknown>,
  environmentId: string,
  zone: string,
  requestedHostname: string,
): TimewebDnsRecord | null {
  if (value.type !== "A") return null;
  const rawId = value.id;
  const externalId =
    typeof rawId === "number" && Number.isSafeInteger(rawId)
      ? String(rawId)
      : rawId;
  const data =
    value.data && typeof value.data === "object" && !Array.isArray(value.data)
      ? (value.data as Record<string, unknown>)
      : null;
  const subdomain =
    typeof data?.subdomain === "string"
      ? data.subdomain.trim().toLowerCase()
      : null;
  const hostname =
    subdomain && subdomain !== "@"
      ? subdomain.endsWith(`.${zone}`)
        ? subdomain
        : `${subdomain}.${zone}`
      : requestedHostname;
  const address = typeof data?.value === "string" ? data.value : "";
  const ttl =
    typeof value.ttl === "number" && Number.isSafeInteger(value.ttl)
      ? value.ttl
      : 600;
  if (
    typeof externalId !== "string" ||
    !DNS_RECORD_ID.test(externalId) ||
    !ENVIRONMENT_ID.test(environmentId) ||
    ttl <= 0
  ) {
    throw new TimewebProviderError(
      "INVALID_RESPONSE",
      "Timeweb вернул некорректную DNS-запись.",
      false,
    );
  }
  return {
    externalId,
    kind: "dns_record",
    environmentId,
    zone: validDnsName(zone, "DNS zone"),
    hostname: validDnsName(hostname, "DNS hostname"),
    type: "A",
    value: validIpv4(address),
    ttl,
  };
}

function dnsRecordHostname(
  value: Record<string, unknown>,
  zone: string,
  requestedHostname: string,
): string {
  const data =
    value.data && typeof value.data === "object" && !Array.isArray(value.data)
      ? (value.data as Record<string, unknown>)
      : null;
  const subdomain =
    typeof data?.subdomain === "string"
      ? data.subdomain.trim().toLowerCase()
      : null;
  return validDnsName(
    subdomain && subdomain !== "@"
      ? subdomain.endsWith(`.${zone}`)
        ? subdomain
        : `${subdomain}.${zone}`
      : requestedHostname,
    "DNS hostname",
  );
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
    private readonly mutationTimeoutMs = MUTATION_REQUEST_TIMEOUT_MS,
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
    const timeoutMs =
      method === "GET"
        ? RECONCILIATION_REQUEST_TIMEOUT_MS
        : this.mutationTimeoutMs;
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
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw await providerError(response);
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
    const deploymentMode = input.deploymentMode ?? "starter-kit";
    const isStarterKit =
      deploymentMode === "starter-kit" &&
      input.serverHostname === COURSE_SERVER_HOSTNAME &&
      input.cloudInit === buildStarterKitCloudInit();
    const isPlainVps =
      deploymentMode === "plain-vps" &&
      input.serverHostname === undefined &&
      input.cloudInit === undefined;
    if (!isStarterKit && !isPlainVps) {
      throw new TimewebProviderError(
        "INVALID_RESPONSE",
        "Deployment profile не прошёл allowlist-проверку.",
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
      bandwidth: positiveInteger(input.bandwidthMbps, "Bandwidth"),
      network: { floating_ip: validIpv4(input.publicIpv4) },
      ...(isStarterKit
        ? {
            cloud_init: input.cloudInit,
            hostname: validServerHostname(input.serverHostname),
          }
        : {}),
    });
    const payload = await response.json().catch(() => null);
    return {
      externalId: responseServerId(payload),
      kind: "server",
      environmentId: input.environmentId,
    };
  }

  async configureServerAutoBackups(
    resource: OwnedProviderResource & Readonly<{ kind: "server" }>,
    settings: TimewebAutoBackupSettings,
  ): Promise<void> {
    const verified = ownedServer(resource);
    const disksResponse = await this.request(
      "GET",
      `${SERVER_COLLECTION_PATH}/${verified.externalId}/disks`,
    );
    const systemDisks = objectArray(
      await disksResponse.json().catch(() => null),
      "server_disks",
    ).filter((disk) => disk.is_system === true);
    if (systemDisks.length !== 1) {
      throw new TimewebProviderError(
        "INVALID_RESPONSE",
        "Timeweb не вернул единственный системный диск сервера.",
        false,
      );
    }
    const rawDiskId = systemDisks[0]!.id;
    if (typeof rawDiskId !== "number") {
      throw new TimewebProviderError(
        "INVALID_RESPONSE",
        "Timeweb вернул некорректный ID системного диска.",
        false,
      );
    }
    const diskId = positiveInteger(rawDiskId, "System disk");
    await this.request(
      "PATCH",
      `${SERVER_COLLECTION_PATH}/${verified.externalId}/disks/${diskId}/auto-backups`,
      settings.enabled
        ? {
            is_enabled: true,
            interval: settings.interval,
            copy_count: settings.copyCount,
            creation_start_at: settings.creationStartAt,
            day_of_week: settings.dayOfWeek,
          }
        : { is_enabled: false },
    );
  }

  async updateServer(input: TimewebUpdateServerInput): Promise<void> {
    const resource = ownedServer(input.resource);
    await this.request(
      "PATCH",
      `${SERVER_COLLECTION_PATH}/${resource.externalId}`,
      { name: validName(input.name) },
    );
  }

  async rebootServer(
    resource: OwnedProviderResource & Readonly<{ kind: "server" }>,
  ): Promise<void> {
    const verified = ownedServer(resource);
    await this.request(
      "POST",
      `${SERVER_COLLECTION_PATH}/${verified.externalId}/reboot`,
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

  private async serverValues(): Promise<Record<string, unknown>[]> {
    const result: Record<string, unknown>[] = [];
    const limit = 100;
    let expectedTotal: number | null = null;
    for (let offset = 0; offset < 1_000; offset += limit) {
      const response = await this.request(
        "GET",
        `${SERVER_COLLECTION_PATH}?limit=${limit}&offset=${offset}`,
      );
      const payload = await response.json().catch(() => null);
      const page = objectArray(payload, "servers");
      const meta =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? (payload as { meta?: { total?: unknown } }).meta
          : undefined;
      const total = meta?.total;
      if (
        typeof total !== "number" ||
        !Number.isSafeInteger(total) ||
        total < 0 ||
        total > 1_000
      ) {
        throw new TimewebProviderError(
          "INVALID_RESPONSE",
          "Timeweb server pagination metadata не прошла проверку.",
          false,
        );
      }
      if (expectedTotal !== null && total !== expectedTotal) {
        throw new TimewebProviderError(
          "INVALID_RESPONSE",
          "Timeweb server pagination total изменился между страницами.",
          false,
        );
      }
      expectedTotal = total;
      result.push(...page);
      if (result.length > total) {
        throw new TimewebProviderError(
          "INVALID_RESPONSE",
          "Timeweb server pagination вернула больше записей, чем meta.total.",
          false,
        );
      }
      if (result.length === total) return result;
      if (page.length === 0) {
        throw new TimewebProviderError(
          "INVALID_RESPONSE",
          "Timeweb server pagination завершилась неполной страницей.",
          false,
        );
      }
    }
    throw new TimewebProviderError(
      "INVALID_RESPONSE",
      "Timeweb server collection превышает безопасный лимит.",
      false,
    );
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
    const marker = `course-platform:${environmentId}`;
    const matches = (await this.serverValues()).filter(
      (server) => server.comment === marker,
    );
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

  async listPublicIps(
    environmentId: string,
  ): Promise<TimewebPublicIpCandidate[]> {
    if (!ENVIRONMENT_ID.test(environmentId)) {
      throw new TimewebProviderError(
        "INVALID_RESPONSE",
        "Environment не прошёл локальную проверку.",
        false,
      );
    }
    const response = await this.request("GET", PUBLIC_IP_COLLECTION_PATH);
    return objectArray(
      await response.json().catch(() => null),
      "ips",
    ).map((ip) => publicIpCandidate(ip, environmentId));
  }

  async createPublicIp(input: {
    environmentId: string;
    availabilityZone: string;
  }): Promise<TimewebPublicIpResource> {
    if (!ENVIRONMENT_ID.test(input.environmentId)) {
      throw new TimewebProviderError(
        "INVALID_RESPONSE",
        "Environment не прошёл локальную проверку.",
        false,
      );
    }
    const response = await this.request("POST", PUBLIC_IP_COLLECTION_PATH, {
      is_ddos_guard: false,
      availability_zone: validZone(input.availabilityZone),
    });
    try {
      return responsePublicIp(
        await response.json().catch(() => null),
        input.environmentId,
      );
    } catch {
      throw new TimewebProviderError(
        "TIMEOUT",
        "Timeweb создал floating IP с ответом, требующим reconciliation.",
        true,
      );
    }
  }

  async bindPublicIp(
    resource: TimewebPublicIpResource,
    server: OwnedProviderResource & Readonly<{ kind: "server" }>,
  ): Promise<void> {
    const ip = ownedPublicIp(resource);
    const verifiedServer = ownedServer(server);
    const serverId = Number(verifiedServer.externalId);
    positiveInteger(serverId, "Server");
    await this.request(
      "POST",
      `${PUBLIC_IP_COLLECTION_PATH}/${ip.externalId}/bind`,
      {
        resource_type: "server",
        resource_id: serverId,
      },
    );
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
      const payload = await response.json().catch(() => null);
      const values =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? (payload as Record<string, unknown>).ip
          : null;
      if (!values || typeof values !== "object" || Array.isArray(values)) {
        throw new TimewebProviderError(
          "INVALID_RESPONSE",
          "Timeweb не вернул состояние публичного IP.",
          false,
        );
      }
      const current = publicIpCandidate(
        values as Record<string, unknown>,
        verified.environmentId,
      );
      return {
        state: "present",
        resource: current,
        binding: {
          resourceType: current.resourceType,
          resourceId: current.resourceId,
        },
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

  private async dnsRecordValues(
    hostname: string,
  ): Promise<Record<string, unknown>[]> {
    const verifiedHostname = validDnsName(hostname, "DNS hostname");
    const result: Record<string, unknown>[] = [];
    const limit = 100;
    let expectedTotal: number | null = null;
    for (let offset = 0; offset < 1_000; offset += limit) {
      const response = await this.request(
        "GET",
        `${dnsRecordListPath(verifiedHostname)}?limit=${limit}&offset=${offset}`,
      );
      const payload = await response.json().catch(() => null);
      const page = objectArray(payload, "dns_records");
      const meta =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? (payload as { meta?: { total?: unknown } }).meta
          : undefined;
      const total = meta?.total;
      if (
        typeof total !== "number" ||
        !Number.isSafeInteger(total) ||
        total < 0 ||
        total > 1_000
      ) {
        throw new TimewebProviderError(
          "INVALID_RESPONSE",
          "Timeweb DNS pagination metadata не прошла проверку.",
          false,
        );
      }
      if (expectedTotal !== null && total !== expectedTotal) {
        throw new TimewebProviderError(
          "INVALID_RESPONSE",
          "Timeweb DNS pagination total изменился между страницами.",
          false,
        );
      }
      expectedTotal = total;
      result.push(...page);
      if (result.length > total) {
        throw new TimewebProviderError(
          "INVALID_RESPONSE",
          "Timeweb DNS pagination вернула больше записей, чем meta.total.",
          false,
        );
      }
      if (result.length === total) return result;
      if (page.length === 0) {
        throw new TimewebProviderError(
          "INVALID_RESPONSE",
          "Timeweb DNS pagination завершилась неполной страницей.",
          false,
        );
      }
    }
    throw new TimewebProviderError(
      "INVALID_RESPONSE",
      "Timeweb DNS zone превышает безопасный лимит записей.",
      false,
    );
  }

  async listDnsRecords(input: {
    environmentId: string;
    zone: string;
    hostname: string;
  }): Promise<TimewebDnsRecord[]> {
    if (!ENVIRONMENT_ID.test(input.environmentId)) {
      throw new TimewebProviderError(
        "INVALID_RESPONSE",
        "Environment не прошёл локальную проверку.",
        false,
      );
    }
    const zone = validDnsName(input.zone, "DNS zone");
    const hostname = validDnsName(input.hostname, "DNS hostname");
    if (!hostname.endsWith(`.${zone}`)) {
      throw new TimewebProviderError(
        "INVALID_RESPONSE",
        "DNS hostname находится вне approved zone.",
        false,
      );
    }
    return (await this.dnsRecordValues(hostname))
      .map((record) =>
        dnsARecord(record, input.environmentId, zone, hostname),
      )
      .filter((record): record is TimewebDnsRecord => record !== null);
  }

  async listDnsConflictingHostnames(input: {
    environmentId: string;
    zone: string;
    hostname: string;
  }): Promise<string[]> {
    if (!ENVIRONMENT_ID.test(input.environmentId)) {
      throw new TimewebProviderError(
        "INVALID_RESPONSE",
        "Environment не прошёл локальную проверку.",
        false,
      );
    }
    const zone = validDnsName(input.zone, "DNS zone");
    const hostname = validDnsName(input.hostname, "DNS hostname");
    if (!hostname.endsWith(`.${zone}`)) {
      throw new TimewebProviderError(
        "INVALID_RESPONSE",
        "DNS hostname находится вне approved zone.",
        false,
      );
    }
    return (await this.dnsRecordValues(hostname))
      .filter((record) => record.type === "A" || record.type === "CNAME")
      .map((record) => dnsRecordHostname(record, zone, hostname));
  }

  async createDnsARecord(input: {
    environmentId: string;
    zone: string;
    hostname: string;
    value: string;
    ttl: number;
  }): Promise<TimewebDnsRecord> {
    if (!ENVIRONMENT_ID.test(input.environmentId)) {
      throw new TimewebProviderError(
        "INVALID_RESPONSE",
        "Environment не прошёл локальную проверку.",
        false,
      );
    }
    const zone = validDnsName(input.zone, "DNS zone");
    const hostname = validDnsName(input.hostname, "DNS hostname");
    if (!hostname.endsWith(`.${zone}`)) {
      throw new TimewebProviderError(
        "INVALID_RESPONSE",
        "DNS hostname находится вне approved zone.",
        false,
      );
    }
    const ttl = positiveInteger(input.ttl, "DNS TTL");
    const address = validIpv4(input.value);
    const response = await this.request(
      "POST",
      dnsRecordMutationPath(hostname),
      {
        type: "A",
        value: address,
        ttl,
      },
    );
    return {
      externalId: dnsRecordId(await response.json().catch(() => null)),
      kind: "dns_record",
      environmentId: input.environmentId,
      zone,
      hostname,
      type: "A",
      value: address,
      ttl,
    };
  }

  async deleteDnsRecord(resource: TimewebDnsRecord): Promise<void> {
    if (
      resource.kind !== "dns_record" ||
      !ENVIRONMENT_ID.test(resource.environmentId)
    ) {
      throw new TimewebProviderError(
        "INVALID_RESPONSE",
        "Owned DNS resource не прошёл локальную проверку.",
        false,
      );
    }
    try {
      await this.request(
        "DELETE",
        dnsRecordMutationPath(resource.hostname, resource.externalId),
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

  async reconcileDnsRecord(
    resource: TimewebDnsRecord,
  ): Promise<{ state: "absent" | "present" }> {
    const records = await this.listDnsRecords({
      environmentId: resource.environmentId,
      zone: resource.zone,
      hostname: resource.hostname,
    });
    const exact = records.filter(
      (record) => record.externalId === resource.externalId,
    );
    if (exact.length > 1) {
      throw new TimewebProviderError(
        "INVALID_RESPONSE",
        "Timeweb вернул duplicate DNS record ID.",
        false,
      );
    }
    return { state: exact.length === 1 ? "present" : "absent" };
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
