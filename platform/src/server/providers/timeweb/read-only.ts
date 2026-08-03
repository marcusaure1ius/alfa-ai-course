import "server-only";

import { randomUUID } from "node:crypto";

import {
  TIMEWEB_READ_DTO_VERSION,
  type TimewebCatalogSnapshot,
  type TimewebProviderErrorCode,
  type TimewebReadAdapter,
  type TimewebServerStatus,
  type TimewebSupportedStatus,
} from "./contracts";

const API_ORIGIN = "https://api.timeweb.cloud";
const READ_ENDPOINTS = {
  account: "/api/v1/account/status",
  balance: "/api/v1/account/finances",
  servers: "/api/v1/servers",
  presets: "/api/v1/presets/servers",
  operatingSystems: "/api/v1/os/servers",
  locations: "/api/v2/locations",
  floatingIps: "/api/v1/floating-ips",
  serviceCosts: "/api/v1/account/services/cost",
  projects: "/api/v1/projects",
  sshKeys: "/api/v1/ssh-keys",
} as const;
const SUPPORTED_STATUSES = new Set<TimewebSupportedStatus>([
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
type JsonRecord = Record<string, unknown>;

export class TimewebProviderError extends Error {
  readonly correlationId = randomUUID();

  constructor(
    public readonly code: TimewebProviderErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly providerRequestId?: string,
  ) {
    super(message);
    this.name = "TimewebProviderError";
  }

  toJSON(): {
    code: TimewebProviderErrorCode;
    message: string;
    correlationId: string;
    retryable: boolean;
  } {
    return {
      code: this.code,
      message: this.message,
      correlationId: this.correlationId,
      retryable: this.retryable,
    };
  }
}

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidResponse();
  }
  return value as JsonRecord;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw invalidResponse();
  return value;
}

function string(value: unknown, fallback = "unknown"): string {
  if (typeof value !== "string") return fallback;
  const safe = value.trim().slice(0, 120);
  return safe || fallback;
}

function identifier(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return string(value);
}

function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw invalidResponse();
  }
  return value;
}

function providerValue(value: unknown): string {
  const safe = string(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .slice(0, 64);
  return safe || "unknown";
}

function status(value: unknown): TimewebServerStatus {
  const normalized = providerValue(value);
  if (SUPPORTED_STATUSES.has(normalized as TimewebSupportedStatus)) {
    return {
      state: "supported",
      value: normalized as TimewebSupportedStatus,
    };
  }
  return { state: "unsupported", providerValue: normalized };
}

function invalidResponse(): TimewebProviderError {
  return new TimewebProviderError(
    "INVALID_RESPONSE",
    "Timeweb вернул ответ неизвестного формата.",
    false,
  );
}

function publicIpMonthlyPrice(payload: unknown): number | null {
  const root = record(payload);
  const costs = array(root.services_costs);
  const prices = new Set<number>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const entry = value as JsonRecord;
    const kind =
      typeof entry.type === "string"
        ? entry.type.toLowerCase().replace(/-/g, "_")
        : "";
    if (kind === "floating_ip" && typeof entry.cost === "number" && entry.cost > 0) {
      prices.add(entry.cost);
    }
    if (entry.services !== undefined) visit(entry.services);
  };
  visit(costs);
  return prices.size === 1 ? [...prices][0]! : null;
}

function errorForStatus(
  httpStatus: number,
  providerRequestId?: string,
): TimewebProviderError {
  if (httpStatus === 401) {
    return new TimewebProviderError(
      "UNAUTHORIZED",
      "Timeweb отклонил настроенный token.",
      false,
      providerRequestId,
    );
  }
  if (httpStatus === 403) {
    return new TimewebProviderError(
      "FORBIDDEN",
      "Настроенному token недостаточно прав на read-only проверку.",
      false,
      providerRequestId,
    );
  }
  if (httpStatus === 429) {
    return new TimewebProviderError(
      "RATE_LIMITED",
      "Timeweb временно ограничил частоту read-only запросов.",
      true,
      providerRequestId,
    );
  }
  return new TimewebProviderError(
    "UPSTREAM_UNAVAILABLE",
    "Timeweb временно недоступен для read-only проверки.",
    httpStatus >= 500,
    providerRequestId,
  );
}

async function safeProviderRequestId(response: Response): Promise<string | undefined> {
  const payload = await response.clone().json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const requestId = (payload as JsonRecord).response_id;
  return typeof requestId === "string" && /^[0-9a-f-]{16,64}$/i.test(requestId)
    ? requestId
    : undefined;
}

export class TimewebReadOnlyAdapter implements TimewebReadAdapter {
  readonly version = TIMEWEB_READ_DTO_VERSION;
  readonly #token: string;

  constructor(
    token: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = 8_000,
    private readonly documentedPublicIpMonthlyRoubles: number | null = null,
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

  private async get(path: (typeof READ_ENDPOINTS)[keyof typeof READ_ENDPOINTS]) {
    try {
      const response = await this.fetchImpl(`${API_ORIGIN}${path}`, {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.#token}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        throw errorForStatus(response.status, await safeProviderRequestId(response));
      }
      return await response.json().catch(() => {
        throw invalidResponse();
      });
    } catch (error) {
      if (error instanceof TimewebProviderError) throw error;
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new TimewebProviderError(
          "TIMEOUT",
          "Timeweb не ответил за безопасный интервал.",
          true,
        );
      }
      throw new TimewebProviderError(
        "UPSTREAM_UNAVAILABLE",
        "Timeweb временно недоступен для read-only проверки.",
        true,
      );
    }
  }

  async discover(): Promise<TimewebCatalogSnapshot> {
    const [
      accountPayload,
      balancePayload,
      serversPayload,
      presetsPayload,
      osPayload,
      locationsPayload,
      floatingIpsPayload,
      serviceCostsPayload,
      projectsPayload,
      sshKeysPayload,
    ] =
      await Promise.all([
        this.get(READ_ENDPOINTS.account),
        this.get(READ_ENDPOINTS.balance),
        this.get(READ_ENDPOINTS.servers),
        this.get(READ_ENDPOINTS.presets),
        this.get(READ_ENDPOINTS.operatingSystems),
        this.get(READ_ENDPOINTS.locations),
        this.get(READ_ENDPOINTS.floatingIps),
        this.get(READ_ENDPOINTS.serviceCosts),
        this.get(READ_ENDPOINTS.projects),
        this.get(READ_ENDPOINTS.sshKeys),
      ]);

    const account = record(record(accountPayload).status);
    const finances = record(record(balancePayload).finances);
    const servers = array(record(serversPayload).servers).map((value) => {
      const server = record(value);
      return {
        id: identifier(server.id),
        name: string(server.name),
        region: providerValue(server.location),
        zone: providerValue(server.availability_zone),
        presetId: server.preset_id == null ? null : identifier(server.preset_id),
        status: status(server.status),
      };
    });
    const presets = array(record(presetsPayload).server_presets).map((value) => {
      const preset = record(value);
      return {
        id: identifier(preset.id),
        region: providerValue(preset.location),
        tags: Array.isArray(preset.tags)
          ? preset.tags.map(providerValue)
          : [],
        priceRoubles: number(preset.price),
        cpu: number(preset.cpu),
        ramMb: number(preset.ram),
        diskMb: number(preset.disk),
        diskType: providerValue(preset.disk_type),
        bandwidthMbps: number(preset.bandwidth),
      };
    });
    const operatingSystems = array(record(osPayload).servers_os).map((value) => {
      const operatingSystem = record(value);
      return {
        id: identifier(operatingSystem.id),
        family: providerValue(operatingSystem.family),
        name: string(operatingSystem.name),
        version: string(operatingSystem.version),
      };
    });
    const locations = array(record(locationsPayload).locations).map((value) => {
      const location = record(value);
      return {
        region: providerValue(location.location),
        countryCode: providerValue(location.location_code),
        zones: array(location.availability_zones).map(providerValue),
      };
    });
    const floatingIps = array(record(floatingIpsPayload).ips).map((value) => {
      const ip = record(value);
      return {
        id: identifier(ip.id),
        address: string(ip.ip),
        zone: providerValue(ip.availability_zone),
        resourceType:
          ip.resource_type == null ? null : providerValue(ip.resource_type),
        resourceId:
          ip.resource_id == null ? null : identifier(ip.resource_id),
      };
    });
    const projects = array(record(projectsPayload).projects).map((value) => {
      const project = record(value);
      return { id: identifier(project.id), name: string(project.name) };
    });
    const sshKeys = array(record(sshKeysPayload).ssh_keys).map((value) => {
      const key = record(value);
      return { id: identifier(key.id), name: string(key.name) };
    });
    const degraded = servers.some((server) => server.status.state === "unsupported");

    return {
      version: this.version,
      source: "timeweb",
      checkedAt: new Date().toISOString(),
      degraded,
      account: {
        state:
          account.is_blocked === true ||
          account.is_permanent_blocked === true
            ? "blocked"
            : "ready",
      },
      balance: {
        amount: number(finances.balance),
        currency: string(finances.currency),
        monthlyFeeRoubles: number(finances.monthly_fee),
      },
      servers,
      presets,
      operatingSystems,
      locations,
      floatingIps,
      publicIpMonthlyRoubles:
        publicIpMonthlyPrice(serviceCostsPayload) ??
        this.documentedPublicIpMonthlyRoubles,
      projects,
      sshKeys,
      capabilities: {
        servers: true,
        presets: true,
        operatingSystems: true,
        locations: true,
        balance: true,
        accountStatus: true,
        floatingIps: true,
        serviceCosts: true,
        projects: true,
        sshKeys: true,
        tokenPermissions: {
          serviceScope: "manual-verification-required",
          deleteWithoutConfirmation: "manual-verification-required",
          actionLevelPermissions: "not-documented",
        },
      },
    };
  }
}
