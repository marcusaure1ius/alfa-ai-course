import "server-only";

import { createHash, randomUUID } from "node:crypto";

import {
  getDatabase,
  type DatabaseSql,
  type DatabaseTransactionSql,
} from "@/server/db/client";
import type { WorkflowCommand } from "@/server/operations/contracts";
import { operationEnvironmentId } from "@/server/operations/repository";

import type {
  OwnedProviderResource,
  TimewebDnsRecord,
  TimewebPublicIpCandidate,
  TimewebPublicIpResource,
  TimewebResourceKind,
  TimewebServerStatus,
} from "./contracts";
import {
  buildStarterKitCloudInit,
  COURSE_DNS_TTL_SECONDS,
  COURSE_DNS_ZONE,
  COURSE_HOSTNAME,
  STARTER_KIT_BOOTSTRAP_PROFILE,
} from "./bootstrap-profile";
import type { TimewebInstallPlan } from "./installation";
import { FakeProviderError, FakeTimewebAdapter } from "./fake";
import {
  createExternalEnvironmentVerifier,
  ExternalHealthError,
} from "./external-health";
import { createProductionTimewebMutationAdapter } from "./mutation";
import {
  getTimewebProvisioningPreview,
  type TimewebProvisioningPlan,
} from "./provisioning";
import { TimewebProviderError } from "./read-only";
import {
  readCloudProviderRuntime,
  runtimeUsesProvider,
} from "../runtime";

export class LifecycleProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "LifecycleProviderError";
  }
}

export type InfrastructureLifecycleAdapter = Readonly<{
  reservePublicIp(): Promise<void>;
  resolvePublicIpAmbiguity(): Promise<void>;
  resolveServerAmbiguity(): Promise<void>;
  resolveDnsAmbiguity(): Promise<void>;
  createServer(): Promise<OwnedProviderResource>;
  reconcileServer(): Promise<void>;
  configureBackups(): Promise<void>;
  installServer(): Promise<void>;
  reconcileInstallation(): Promise<void>;
  configureDns(): Promise<OwnedProviderResource | void>;
  verifyBootstrapReachable(): Promise<void>;
  waitForDns(): Promise<void>;
  verifyTls(): Promise<void>;
  verifyN8nHealth(): Promise<void>;
  recordReadyInstallation(): Promise<void>;
  deleteOwnedResource(resource: OwnedProviderResource): Promise<void>;
}>;

type OperationContext = Readonly<{
  operationKind: string;
  environmentId: string;
  environmentName: string;
  plan: TimewebProvisioningPlan | null;
  installPlan: TimewebInstallPlan | null;
}>;

function safePlan(value: unknown): TimewebProvisioningPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new LifecycleProviderError(
      "INVALID_PROVIDER_PLAN",
      "Production provider plan отсутствует.",
    );
  }
  const plan = value as Record<string, unknown>;
  if (
    plan.version !== "timeweb-provisioning-v3" ||
    plan.deploymentMode !== "plain-vps" ||
    !Number.isSafeInteger(plan.presetId) ||
    !Number.isSafeInteger(plan.operatingSystemId) ||
    typeof plan.projectId !== "number" ||
    !Number.isSafeInteger(plan.projectId) ||
    typeof plan.sshKeyId !== "number" ||
    !Number.isSafeInteger(plan.sshKeyId) ||
    typeof plan.monthlyPublicIpRoubles !== "number" ||
    !Number.isFinite(plan.monthlyPublicIpRoubles) ||
    !Number.isSafeInteger(plan.bandwidthMbps) ||
    typeof plan.backupsEnabled !== "boolean" ||
    plan.backupInterval !== "week" ||
    plan.backupCopyCount !== 1 ||
    plan.publicIpv4 !== true ||
    typeof plan.availabilityZone !== "string" ||
    plan.projectId <= 0 ||
    plan.sshKeyId <= 0 ||
    (plan.bandwidthMbps as number) <= 0 ||
    plan.monthlyPublicIpRoubles <= 0
  ) {
    throw new LifecycleProviderError(
      "INVALID_PROVIDER_PLAN",
      "Production provider plan не прошёл проверку.",
    );
  }
  return value as TimewebProvisioningPlan;
}

function safeInstallPlan(value: unknown): TimewebInstallPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new LifecycleProviderError(
      "INVALID_INSTALL_PLAN",
      "Install operation не содержит versioned install plan.",
    );
  }
  const plan = value as Record<string, unknown>;
  if (
    plan.version !== "timeweb-install-v1" ||
    plan.deploymentMode !== "starter-kit-reinstall" ||
    typeof plan.checkedAt !== "string" ||
    !Number.isSafeInteger(plan.operatingSystemId) ||
    Number(plan.operatingSystemId) <= 0 ||
    plan.operatingSystemLabel !== "Ubuntu 24.04 LTS x86_64" ||
    !Number.isSafeInteger(plan.sshKeyId) ||
    Number(plan.sshKeyId) <= 0 ||
    plan.hostname !== COURSE_HOSTNAME ||
    plan.profileVersion !== STARTER_KIT_BOOTSTRAP_PROFILE.version ||
    plan.release !== STARTER_KIT_BOOTSTRAP_PROFILE.release ||
    plan.installerUrl !== STARTER_KIT_BOOTSTRAP_PROFILE.installerUrl ||
    plan.installerSha256 !== STARTER_KIT_BOOTSTRAP_PROFILE.installerSha256
  ) {
    throw new LifecycleProviderError(
      "INVALID_INSTALL_PLAN",
      "Install plan не прошёл exact profile allowlist.",
    );
  }
  return value as TimewebInstallPlan;
}

async function operationContext(
  sql: DatabaseSql,
  command: WorkflowCommand,
): Promise<OperationContext> {
  const rows = await sql<
    {
      environment_id: string;
      environment_name: string;
      operation_kind: string;
      input_snapshot: Record<string, unknown>;
    }[]
  >`
    SELECT
      operations.environment_id,
      environments.name AS environment_name,
      operations.kind AS operation_kind,
      operations.input_snapshot
    FROM operations
    JOIN environments ON environments.id = operations.environment_id
    WHERE operations.id = ${command.operationId}
  `;
  const row = rows[0];
  if (!row) {
    throw new LifecycleProviderError(
      "INVALID_OPERATION",
      "Production operation не найдена.",
    );
  }
  return {
    operationKind: row.operation_kind,
    environmentId: row.environment_id,
    environmentName: row.environment_name,
    plan:
      row.input_snapshot.providerPlan === undefined
        ? null
        : safePlan(row.input_snapshot.providerPlan),
    installPlan:
      row.input_snapshot.installPlan === undefined
        ? null
        : safeInstallPlan(row.input_snapshot.installPlan),
  };
}

async function activeResource(
  sql: DatabaseSql,
  environmentId: string,
  kind: TimewebResourceKind,
): Promise<(OwnedProviderResource & { publicMetadata: Record<string, unknown> }) | null> {
  const rows = await sql<
    {
      provider_resource_id: string;
      public_metadata: Record<string, unknown>;
    }[]
  >`
    SELECT provider_resource_id, public_metadata
    FROM provider_resources
    WHERE environment_id = ${environmentId}
      AND provider = 'timeweb'
      AND resource_kind = ${kind}
      AND ownership = 'platform'
      AND lifecycle_status <> 'deleted'
    ORDER BY created_at DESC
    LIMIT 2
  `;
  if (rows.length > 1) {
    throw new LifecycleProviderError(
      "DUPLICATE_OWNED_RESOURCE",
      "Найдено несколько активных owned provider resources.",
    );
  }
  return rows[0]
    ? {
        externalId: rows[0].provider_resource_id,
        kind,
        environmentId,
        publicMetadata: rows[0].public_metadata,
      }
    : null;
}

async function recordResource(
  sql: DatabaseSql | DatabaseTransactionSql,
  command: WorkflowCommand,
  resource: OwnedProviderResource,
  publicMetadata: Record<string, string | number | boolean | null>,
): Promise<void> {
  await sql`
    INSERT INTO provider_resources (
      id, environment_id, operation_id, provider, resource_kind,
      provider_resource_id, ownership, lifecycle_status, public_metadata
    )
    VALUES (
      ${randomUUID()}, ${resource.environmentId}, ${command.operationId},
      'timeweb', ${resource.kind}, ${resource.externalId}, 'platform', 'active',
      ${sql.json(publicMetadata)}
    )
    ON CONFLICT (provider, resource_kind, provider_resource_id) DO UPDATE SET
      operation_id = COALESCE(provider_resources.operation_id, EXCLUDED.operation_id),
      lifecycle_status = 'active',
      public_metadata = provider_resources.public_metadata || EXCLUDED.public_metadata,
      updated_at = now()
    WHERE provider_resources.environment_id = EXCLUDED.environment_id
      AND provider_resources.ownership = 'platform'
  `;
}

async function markDeleted(
  sql: DatabaseSql | DatabaseTransactionSql,
  resource: OwnedProviderResource,
): Promise<void> {
  const rows = await sql<{ id: string }[]>`
    UPDATE provider_resources
    SET lifecycle_status = 'deleted', updated_at = now()
    WHERE environment_id = ${resource.environmentId}
      AND provider = 'timeweb'
      AND resource_kind = ${resource.kind}
      AND provider_resource_id = ${resource.externalId}
      AND ownership = 'platform'
    RETURNING id
  `;
  if (!rows[0]) {
    throw new LifecycleProviderError(
      "WRONG_OWNERSHIP",
      "Owned provider resource не найден.",
    );
  }
}

const PROVIDER_MUTATION_STARTED_LOG =
  "provider mutation started; response outcome may be ambiguous";
const PUBLIC_IP_MUTATION_LOG_VERSION = "public-ip-create-v1";
const DNS_MUTATION_LOG_VERSION = "dns-a-create-v1";
const INSTALL_MUTATION_LOG_VERSION = "starter-kit-reinstall-v1";

async function installMutationStarted(
  sql: DatabaseSql,
  operationId: string,
  plan: TimewebInstallPlan,
): Promise<boolean> {
  const rows = await sql<{ logs_redacted: string | null }[]>`
    SELECT logs_redacted
    FROM operation_steps
    WHERE operation_id = ${operationId} AND logical_key = 'installing_n8n'
  `;
  const value = rows[0]?.logs_redacted;
  if (!value) return false;
  let parsed: { version?: unknown; planHash?: unknown };
  try {
    parsed = JSON.parse(value) as typeof parsed;
  } catch {
    throw new LifecycleProviderError(
      "STEP_STATE_INVALID",
      "Install mutation marker повреждён.",
    );
  }
  const expectedHash = createHash("sha256")
    .update(JSON.stringify(plan))
    .digest("hex");
  if (
    parsed.version !== INSTALL_MUTATION_LOG_VERSION ||
    parsed.planHash !== expectedHash
  ) {
    throw new LifecycleProviderError(
      "STEP_STATE_INVALID",
      "Install mutation marker не совпадает с approved plan.",
    );
  }
  return true;
}

async function markInstallMutationStarted(
  sql: DatabaseSql,
  operationId: string,
  executionToken: string,
  plan: TimewebInstallPlan,
): Promise<void> {
  const logs = JSON.stringify({
    version: INSTALL_MUTATION_LOG_VERSION,
    planHash: createHash("sha256").update(JSON.stringify(plan)).digest("hex"),
  });
  const rows = await sql<{ id: string }[]>`
    UPDATE operation_steps
    SET logs_redacted = ${logs}, updated_at = now()
    WHERE operation_id = ${operationId}
      AND logical_key = 'installing_n8n'
      AND status = 'running'
      AND execution_token = ${executionToken}
    RETURNING id
  `;
  if (!rows[0]) {
    throw new LifecycleProviderError(
      "STEP_STATE_INVALID",
      "Install step потерял durable lease до provider mutation.",
      true,
    );
  }
}

export async function providerMutationStarted(
  sql: DatabaseSql,
  operationId: string,
): Promise<boolean> {
  const rows = await sql<{ logs_redacted: string | null }[]>`
    SELECT logs_redacted
    FROM operation_steps
    WHERE operation_id = ${operationId} AND logical_key = 'create_server'
  `;
  return rows[0]?.logs_redacted === PROVIDER_MUTATION_STARTED_LOG;
}

export async function markProviderMutationStarted(
  sql: DatabaseSql,
  operationId: string,
  executionToken: string,
): Promise<void> {
  const rows = await sql<{ id: string }[]>`
    UPDATE operation_steps
    SET logs_redacted = ${PROVIDER_MUTATION_STARTED_LOG}, updated_at = now()
    WHERE operation_id = ${operationId}
      AND logical_key = 'create_server'
      AND status = 'running'
      AND execution_token = ${executionToken}
    RETURNING id
  `;
  if (!rows[0]) {
    throw new LifecycleProviderError(
      "STEP_STATE_INVALID",
      "Create step потерял durable lease до provider mutation.",
      true,
    );
  }
}

function providerIdHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parsePublicIpMutationBaseline(value: string): ReadonlySet<string> {
  let parsed: { version?: unknown; baselineHashes?: unknown };
  try {
    parsed = JSON.parse(value) as typeof parsed;
  } catch {
    throw new LifecycleProviderError(
      "STEP_STATE_INVALID",
      "Public IP mutation marker повреждён.",
    );
  }
  if (
    parsed.version !== PUBLIC_IP_MUTATION_LOG_VERSION ||
    !Array.isArray(parsed.baselineHashes) ||
    !parsed.baselineHashes.every(
      (hash) => typeof hash === "string" && /^[0-9a-f]{64}$/.test(hash),
    )
  ) {
    throw new LifecycleProviderError(
      "STEP_STATE_INVALID",
      "Public IP mutation marker повреждён.",
    );
  }
  return new Set(parsed.baselineHashes);
}

async function publicIpMutationBaseline(
  sql: DatabaseSql,
  operationId: string,
): Promise<ReadonlySet<string> | null> {
  const rows = await sql<{ logs_redacted: string | null }[]>`
    SELECT logs_redacted
    FROM operation_steps
    WHERE operation_id = ${operationId} AND logical_key = 'reserve_public_ip'
  `;
  const value = rows[0]?.logs_redacted;
  if (!value) return null;
  return parsePublicIpMutationBaseline(value);
}

async function markPublicIpMutationStarted(
  sql: DatabaseSql,
  operationId: string,
  executionToken: string,
  baselineIds: readonly string[],
): Promise<void> {
  const logs = JSON.stringify({
    version: PUBLIC_IP_MUTATION_LOG_VERSION,
    baselineHashes: baselineIds.map(providerIdHash).sort(),
  });
  const rows = await sql<{ id: string }[]>`
    UPDATE operation_steps
    SET logs_redacted = ${logs}, updated_at = now()
    WHERE operation_id = ${operationId}
      AND logical_key = 'reserve_public_ip'
      AND status = 'running'
      AND execution_token = ${executionToken}
    RETURNING id
  `;
  if (!rows[0]) {
    throw new LifecycleProviderError(
      "STEP_STATE_INVALID",
      "Public IP step потерял durable lease до provider mutation.",
      true,
    );
  }
}

export type DnsMutationMarker = Readonly<{
  targetHash: string;
  baselineHashes: ReadonlySet<string>;
}>;

async function dnsMutationMarker(
  sql: DatabaseSql,
  operationId: string,
): Promise<DnsMutationMarker | null> {
  const rows = await sql<{ logs_redacted: string | null }[]>`
    SELECT logs_redacted
    FROM operation_steps
    WHERE operation_id = ${operationId} AND logical_key = 'configure_dns'
  `;
  const value = rows[0]?.logs_redacted;
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as {
      version?: unknown;
      targetHash?: unknown;
      baselineHashes?: unknown;
    };
    if (
      parsed.version === DNS_MUTATION_LOG_VERSION &&
      typeof parsed.targetHash === "string" &&
      /^[0-9a-f]{64}$/.test(parsed.targetHash) &&
      Array.isArray(parsed.baselineHashes) &&
      parsed.baselineHashes.every(
        (hash) => typeof hash === "string" && /^[0-9a-f]{64}$/.test(hash),
      )
    ) {
      return {
        targetHash: parsed.targetHash,
        baselineHashes: new Set(parsed.baselineHashes),
      };
    }
    throw new LifecycleProviderError(
      "STEP_STATE_INVALID",
      "DNS mutation marker повреждён.",
    );
  } catch {
    throw new LifecycleProviderError(
      "STEP_STATE_INVALID",
      "DNS mutation marker повреждён.",
    );
  }
}

async function markDnsMutationStarted(
  sql: DatabaseSql,
  operationId: string,
  executionToken: string,
  target: string,
  baselineIds: readonly string[],
): Promise<void> {
  const logs = JSON.stringify({
    version: DNS_MUTATION_LOG_VERSION,
    targetHash: providerIdHash(target),
    baselineHashes: baselineIds.map(providerIdHash).sort(),
  });
  const rows = await sql<{ id: string }[]>`
    UPDATE operation_steps
    SET logs_redacted = ${logs}, updated_at = now()
    WHERE operation_id = ${operationId}
      AND logical_key = 'configure_dns'
      AND status = 'running'
      AND execution_token = ${executionToken}
    RETURNING id
  `;
  if (!rows[0]) {
    throw new LifecycleProviderError(
      "STEP_STATE_INVALID",
      "DNS step потерял durable lease до provider mutation.",
      true,
    );
  }
}

async function clearDnsMutationMarkerAfterDefinitiveRejection(
  sql: DatabaseSql,
  operationId: string,
  executionToken: string,
): Promise<void> {
  const rows = await sql<{ id: string }[]>`
    UPDATE operation_steps
    SET logs_redacted = NULL, updated_at = now()
    WHERE operation_id = ${operationId}
      AND logical_key = 'configure_dns'
      AND status = 'running'
      AND execution_token = ${executionToken}
    RETURNING id
  `;
  if (!rows[0]) {
    throw new LifecycleProviderError(
      "STEP_STATE_INVALID",
      "DNS step потерял durable lease после definitive provider rejection.",
    );
  }
}

async function clearInstallMutationMarkerAfterDefinitiveRejection(
  sql: DatabaseSql,
  operationId: string,
  executionToken: string,
): Promise<void> {
  const rows = await sql<{ id: string }[]>`
    UPDATE operation_steps
    SET logs_redacted = NULL, updated_at = now()
    WHERE operation_id = ${operationId}
      AND logical_key = 'installing_n8n'
      AND status = 'running'
      AND execution_token = ${executionToken}
    RETURNING id
  `;
  if (!rows[0]) {
    throw new LifecycleProviderError(
      "STEP_STATE_INVALID",
      "Install step потерял durable lease после definitive provider rejection.",
    );
  }
}

export async function runFreshDnsCreate<T>(
  create: () => Promise<T>,
  clearMarker: () => Promise<void>,
): Promise<T> {
  try {
    return await create();
  } catch (error) {
    if (
      error instanceof TimewebProviderError &&
      ["INVALID_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND"].includes(
        error.code,
      )
    ) {
      await clearMarker();
    }
    throw error;
  }
}

export async function runFreshInstallMutation(
  install: () => Promise<void>,
  clearMarker: () => Promise<void>,
): Promise<void> {
  try {
    await install();
  } catch (error) {
    if (
      error instanceof TimewebProviderError &&
      ["INVALID_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND"].includes(
        error.code,
      )
    ) {
      await clearMarker();
      throw error;
    }
    // Timeweb can apply a reinstall and still return an unconfirmed outcome.
    // The durable marker prevents a duplicate PATCH; the following bounded
    // reconciliation step proves the resulting OS and server state.
  }
}

async function recordDnsResource(
  sql: DatabaseSql,
  command: WorkflowCommand,
  resource: TimewebDnsRecord,
): Promise<void> {
  await sql.begin(async (transaction) => {
    await recordResource(transaction, command, resource, {
      zone: resource.zone,
      hostname: resource.hostname,
      type: resource.type,
      value: resource.value,
      ttl: resource.ttl,
    });
    const rows = await transaction<{ id: string }[]>`
      UPDATE domain_allocations
      SET provider_resource_id = provider_resources.id,
          status = 'record_created',
          updated_at = now()
      FROM provider_resources
      WHERE domain_allocations.environment_id = ${resource.environmentId}
        AND domain_allocations.hostname = ${resource.hostname}
        AND domain_allocations.zone_name = ${resource.zone}
        AND domain_allocations.record_type = 'A'
        AND domain_allocations.status IN ('reserved', 'record_created')
        AND provider_resources.environment_id = domain_allocations.environment_id
        AND provider_resources.provider = 'timeweb'
        AND provider_resources.resource_kind = 'dns_record'
        AND provider_resources.provider_resource_id = ${resource.externalId}
      RETURNING domain_allocations.id
    `;
    if (!rows[0]) {
      throw new LifecycleProviderError(
        "DNS_RESERVATION_LOST",
        "Reserved hostname не найден после DNS mutation.",
      );
    }
  });
}

function assertDnsMutationTarget(
  marker: DnsMutationMarker,
  expectedHostname: string,
  expectedAddress: string,
): void {
  if (
    marker.targetHash !==
    providerIdHash(`${expectedHostname}:${expectedAddress}`)
  ) {
    throw new LifecycleProviderError(
      "STEP_STATE_INVALID",
      "DNS mutation marker не совпадает с approved target.",
    );
  }
}

export function recoverDnsRecordCandidate(
  records: readonly TimewebDnsRecord[],
  marker: DnsMutationMarker,
  expectedHostname: string,
  expectedAddress: string,
  conflictingHostnames: readonly string[],
  attemptCount = 10,
): TimewebDnsRecord {
  assertDnsMutationTarget(
    marker,
    expectedHostname,
    expectedAddress,
  );
  const hostnameRecords = records.filter(
    (record) => record.hostname === expectedHostname,
  );
  const nonBaseline = hostnameRecords.filter(
    (record) =>
      !marker.baselineHashes.has(providerIdHash(record.externalId)),
  );
  const conflictCount = conflictingHostnames.filter(
    (hostname) => hostname === expectedHostname,
  ).length;
  if (
    nonBaseline.length === 0 &&
    conflictCount === 0 &&
    attemptCount < 10
  ) {
    throw new LifecycleProviderError(
      "DNS_RECORD_NOT_READY",
      "Timeweb ещё не показывает созданную DNS-запись.",
      true,
    );
  }
  const exact = nonBaseline.filter(
    (record) => record.value === expectedAddress,
  );
  if (
    conflictCount !== 1 ||
    nonBaseline.length !== 1 ||
    exact.length !== 1
  ) {
    throw new LifecycleProviderError(
      nonBaseline.length > 1
        ? "DUPLICATE_OWNED_RESOURCE"
        : "UNKNOWN_DNS_OUTCOME",
      "Не удалось однозначно восстановить созданную DNS-запись.",
    );
  }
  return exact[0]!;
}

export function resolveDnsAmbiguityCandidate(
  records: readonly TimewebDnsRecord[],
  marker: DnsMutationMarker,
  expectedHostname: string,
  expectedAddress: string,
  conflictingHostnames: readonly string[],
  attemptCount: number,
): TimewebDnsRecord {
  return recoverDnsRecordCandidate(
    records,
    marker,
    expectedHostname,
    expectedAddress,
    conflictingHostnames,
    attemptCount,
  );
}

export function recoverPublicIpCandidate(
  candidates: readonly TimewebPublicIpCandidate[],
  baseline: ReadonlySet<string>,
  availabilityZone: string,
  attemptCount = 10,
): TimewebPublicIpCandidate {
  const nonBaseline = candidates.filter(
    (candidate) => !baseline.has(providerIdHash(candidate.externalId)),
  );
  if (nonBaseline.length === 0 && attemptCount < 10) {
    throw new LifecycleProviderError(
      "PUBLIC_IP_NOT_READY",
      "Timeweb ещё не показывает созданный floating IP.",
      true,
    );
  }
  if (nonBaseline.length !== 1) {
    throw new LifecycleProviderError(
      nonBaseline.length > 1
        ? "DUPLICATE_OWNED_RESOURCE"
        : "UNKNOWN_PUBLIC_IP_OUTCOME",
      "Не удалось однозначно восстановить созданный floating IP.",
    );
  }
  const recovered = nonBaseline[0]!;
  if (
    recovered.availabilityZone !== availabilityZone ||
    recovered.resourceType !== null ||
    recovered.resourceId !== null
  ) {
    throw new LifecycleProviderError(
      "UNKNOWN_PUBLIC_IP_OUTCOME",
      "Новый floating IP не прошёл ownership-проверку.",
    );
  }
  return recovered;
}

export function resolvePublicIpAmbiguityCandidate(
  candidates: readonly TimewebPublicIpCandidate[],
  baseline: ReadonlySet<string>,
  availabilityZone: string,
): TimewebPublicIpCandidate | null {
  const currentHashes = new Set(
    candidates.map((candidate) => providerIdHash(candidate.externalId)),
  );
  if (
    currentHashes.size === baseline.size &&
    [...baseline].every((hash) => currentHashes.has(hash))
  ) {
    return null;
  }
  return recoverPublicIpCandidate(
    candidates,
    baseline,
    availabilityZone,
    10,
  );
}

export function requireReadyServerStatus(
  status: TimewebServerStatus,
  attemptCount: number,
): void {
  if (status.state === "unsupported") {
    throw new LifecycleProviderError(
      "PROVIDER_STATUS_UNSUPPORTED",
      "Timeweb вернул неизвестный server status; автоматический active запрещён.",
    );
  }
  if (["blocked", "no_paid"].includes(status.value)) {
    if (attemptCount < 3) {
      throw new LifecycleProviderError(
        "SERVER_NOT_READY",
        `Timeweb временно показывает ${status.value} во время provisioning.`,
        true,
      );
    }
    throw new LifecycleProviderError(
      status.value === "blocked"
        ? "SERVER_BLOCKED"
        : "SERVER_BILLING_BLOCKED",
      `Timeweb сохранил terminal status ${status.value}.`,
    );
  }
  if (status.value === "permanent_blocked") {
    throw new LifecycleProviderError(
      "SERVER_BILLING_BLOCKED",
      `Timeweb вернул terminal status ${status.value}.`,
    );
  }
  if (status.value === "removed") {
    throw new LifecycleProviderError(
      "SERVER_REMOVED",
      "Timeweb удалил VPS до завершения provisioning.",
    );
  }
  if (status.value !== "on") {
    throw new LifecycleProviderError(
      "SERVER_NOT_READY",
      `Timeweb server ещё не готов: ${status.value}.`,
      true,
    );
  }
}

async function unresolvedPublicIpMutation(
  sql: DatabaseSql,
  environmentId: string,
): Promise<{
  baseline: ReadonlySet<string>;
  availabilityZone: string;
} | null> {
  const resources = await sql<{ id: string }[]>`
    SELECT id
    FROM provider_resources
    WHERE environment_id = ${environmentId}
      AND provider = 'timeweb'
      AND resource_kind = 'public_ip'
    LIMIT 1
  `;
  if (resources[0]) return null;

  const rows = await sql<
    {
      logs_redacted: string;
      input_snapshot: Record<string, unknown>;
    }[]
  >`
    SELECT operation_steps.logs_redacted, operations.input_snapshot
    FROM operation_steps
    JOIN operations ON operations.id = operation_steps.operation_id
    WHERE operations.environment_id = ${environmentId}
      AND operations.kind = 'create_environment'
      AND operation_steps.logical_key = 'reserve_public_ip'
      AND operation_steps.logs_redacted IS NOT NULL
    ORDER BY operations.created_at DESC
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  const plan = safePlan(row.input_snapshot.providerPlan);
  return {
    baseline: parsePublicIpMutationBaseline(row.logs_redacted),
    availabilityZone: plan.availabilityZone,
  };
}

async function operationStepAttempts(
  sql: DatabaseSql,
  operationId: string,
  logicalKey: string,
): Promise<number> {
  const rows = await sql<{ attempt_count: number }[]>`
    SELECT attempt_count
    FROM operation_steps
    WHERE operation_id = ${operationId} AND logical_key = ${logicalKey}
  `;
  return rows[0]?.attempt_count ?? 0;
}

function mappedError(error: unknown): LifecycleProviderError {
  if (error instanceof LifecycleProviderError) return error;
  if (error instanceof ExternalHealthError) {
    return new LifecycleProviderError(
      error.code,
      error.message,
      error.retryable,
    );
  }
  if (error instanceof TimewebProviderError) {
    const code =
      error.code === "TIMEOUT"
        ? "TIMEOUT_AFTER_MUTATION"
        : error.code === "RATE_LIMITED"
          ? "RATE_LIMIT"
          : error.code === "UPSTREAM_UNAVAILABLE"
            ? "PROVIDER_UNAVAILABLE"
            : error.code;
    return new LifecycleProviderError(code, error.message, error.retryable);
  }
  return new LifecycleProviderError(
    "PROVIDER_UNAVAILABLE",
    "Timeweb lifecycle завершился безопасной ошибкой.",
    true,
  );
}

async function waitForAbsent(
  reconcile: () => Promise<{ state: "absent" | "present" }>,
): Promise<boolean> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if ((await reconcile()).state === "absent") return true;
    if (attempt < 9) {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
  }
  return false;
}

class ProductionTimewebLifecycleAdapter
  implements InfrastructureLifecycleAdapter
{
  constructor(
    private readonly sql: DatabaseSql,
    private readonly command: WorkflowCommand,
    private readonly context: OperationContext,
    private readonly adapter: NonNullable<
      ReturnType<typeof createProductionTimewebMutationAdapter>
    >,
    private readonly createExecutionToken?: string,
    private readonly reserveIpExecutionToken?: string,
    private readonly configureDnsExecutionToken?: string,
    private readonly installExecutionToken?: string,
  ) {}

  private requirePlan(): TimewebProvisioningPlan {
    if (!this.context.plan) {
      throw new LifecycleProviderError(
        "INVALID_PROVIDER_PLAN",
        "Create operation не содержит production provider plan.",
      );
    }
    return this.context.plan;
  }

  private requireInstallPlan(): TimewebInstallPlan {
    if (!this.context.installPlan) {
      throw new LifecycleProviderError(
        "INVALID_INSTALL_PLAN",
        "Install operation не содержит exact install plan.",
      );
    }
    return this.context.installPlan;
  }

  private async publicIpv4(): Promise<string> {
    const publicIp = await activeResource(
      this.sql,
      this.context.environmentId,
      "public_ip",
    );
    const address = publicIp?.publicMetadata.address;
    if (typeof address !== "string") {
      throw new LifecycleProviderError(
        "PUBLIC_IP_NOT_READY",
        "Owned floating IP отсутствует в durable state.",
        true,
      );
    }
    return address;
  }

  async reservePublicIp(): Promise<void> {
    const plan = this.requirePlan();
    const existing = await activeResource(
      this.sql,
      this.context.environmentId,
      "public_ip",
    );
    if (existing) return;
    try {
      const candidates = await this.adapter.listPublicIps(
        this.context.environmentId,
      );
      const baseline = await publicIpMutationBaseline(
        this.sql,
        this.command.operationId,
      );
      if (baseline) {
        const attempts = await operationStepAttempts(
          this.sql,
          this.command.operationId,
          "reserve_public_ip",
        );
        const recovered = recoverPublicIpCandidate(
          candidates,
          baseline,
          plan.availabilityZone,
          attempts,
        );
        await recordResource(this.sql, this.command, recovered, {
          address: recovered.address,
          availabilityZone: plan.availabilityZone,
          monthlyRoubles: plan.monthlyPublicIpRoubles,
        });
        return;
      }
      await this.assertFreshProviderPlan(false);
      if (!this.reserveIpExecutionToken) {
        throw new LifecycleProviderError(
          "STEP_STATE_INVALID",
          "Public IP execution token отсутствует до provider mutation.",
        );
      }
      await markPublicIpMutationStarted(
        this.sql,
        this.command.operationId,
        this.reserveIpExecutionToken,
        candidates.map((candidate) => candidate.externalId),
      );
      const resource = await this.adapter.createPublicIp({
        environmentId: this.context.environmentId,
        availabilityZone: plan.availabilityZone,
      });
      await recordResource(this.sql, this.command, resource, {
        address: resource.address,
        availabilityZone: plan.availabilityZone,
        monthlyRoubles: plan.monthlyPublicIpRoubles,
      });
    } catch (error) {
      throw mappedError(error);
    }
  }

  async resolvePublicIpAmbiguity(): Promise<void> {
    try {
      const unresolved = await unresolvedPublicIpMutation(
        this.sql,
        this.context.environmentId,
      );
      if (!unresolved) return;
      const candidates = await this.adapter.listPublicIps(
        this.context.environmentId,
      );
      const recovered = resolvePublicIpAmbiguityCandidate(
        candidates,
        unresolved.baseline,
        unresolved.availabilityZone,
      );
      if (!recovered) return;
      await recordResource(this.sql, this.command, recovered, {
        address: recovered.address,
        availabilityZone: recovered.availabilityZone,
      });
    } catch (error) {
      throw mappedError(error);
    }
  }

  async resolveServerAmbiguity(): Promise<void> {
    try {
      if (
        await activeResource(
          this.sql,
          this.context.environmentId,
          "server",
        )
      ) {
        return;
      }
      const rows = await this.sql<
        {
          create_operation_id: string;
          input_snapshot: Record<string, unknown>;
        }[]
      >`
        SELECT id AS create_operation_id, input_snapshot
        FROM operations
        WHERE environment_id = ${this.context.environmentId}
          AND kind = 'create_environment'
        ORDER BY created_at DESC
        LIMIT 1
      `;
      const row = rows[0];
      if (
        !row ||
        !(await providerMutationStarted(
          this.sql,
          row.create_operation_id,
        ))
      ) {
        return;
      }
      const recovered = await this.adapter.findServerByEnvironmentId(
        this.context.environmentId,
      );
      if (recovered) {
        const plan = safePlan(row.input_snapshot.providerPlan);
        await recordResource(this.sql, this.command, recovered, {
          presetId: plan.presetId,
          operatingSystemId: plan.operatingSystemId,
          availabilityZone: plan.availabilityZone,
          monthlyRoubles: plan.monthlyServerRoubles,
          projectId: plan.projectId,
          passwordAuthentication: false,
        });
        return;
      }
      const attempts = await operationStepAttempts(
        this.sql,
        this.command.operationId,
        "resolve_server_ambiguity",
      );
      throw new LifecycleProviderError(
        attempts < 10
          ? "SERVER_OUTCOME_NOT_READY"
          : "UNKNOWN_SERVER_OUTCOME",
        attempts < 10
          ? "Timeweb ещё не показывает VPS после неоднозначного create."
          : "VPS create outcome нельзя безопасно считать отсутствующим.",
        attempts < 10,
      );
    } catch (error) {
      throw mappedError(error);
    }
  }

  private async ensureAttachedPublicIp(
    server: OwnedProviderResource & Readonly<{ kind: "server" }>,
  ): Promise<void> {
    const existing = await activeResource(
      this.sql,
      this.context.environmentId,
      "public_ip",
    );
    if (!existing || typeof existing.publicMetadata.address !== "string") {
      throw new LifecycleProviderError(
        "PUBLIC_IP_NOT_READY",
        "Owned floating IP отсутствует в durable state.",
        true,
      );
    }
    const resource: TimewebPublicIpResource = {
      externalId: existing.externalId,
      kind: "public_ip",
      environmentId: existing.environmentId,
      address: existing.publicMetadata.address,
    };
    let current = await this.adapter.reconcilePublicIp(resource);
    if (current.state === "absent") {
      throw new LifecycleProviderError(
        "PUBLIC_IP_NOT_READY",
        "Owned floating IP отсутствует в Timeweb.",
        true,
      );
    }
    if (
      current.binding.resourceType === "server" &&
      current.binding.resourceId === server.externalId
    ) {
      return;
    }
    if (
      current.binding.resourceType !== null ||
      current.binding.resourceId !== null
    ) {
      throw new LifecycleProviderError(
        "WRONG_OWNERSHIP",
        "Owned floating IP уже привязан к другому ресурсу.",
      );
    }
    await this.adapter.bindPublicIp(resource, server);
    current = await this.adapter.reconcilePublicIp(resource);
    if (
      current.state !== "present" ||
      current.binding.resourceType !== "server" ||
      current.binding.resourceId !== server.externalId
    ) {
      throw new LifecycleProviderError(
        "PUBLIC_IP_NOT_READY",
        "Timeweb ещё не подтвердил привязку floating IP к VPS.",
        true,
      );
    }
  }

  private async assertFreshProviderPlan(
    requireApprovedOwnedPublicIp: boolean,
  ): Promise<void> {
    let approvedOwnedPublicIp:
      | {
          externalId: string;
          address: string;
        }
      | undefined;
    if (requireApprovedOwnedPublicIp) {
      const publicIp = await activeResource(
        this.sql,
        this.context.environmentId,
        "public_ip",
      );
      const expectedAddress = publicIp?.publicMetadata.address;
      if (
        !publicIp ||
        typeof expectedAddress !== "string"
      ) {
        throw new LifecycleProviderError(
          "PUBLIC_IP_NOT_READY",
          "Owned floating IP отсутствует до повторного provider preflight.",
        );
      }
      approvedOwnedPublicIp = {
        externalId: publicIp.externalId,
        address: expectedAddress,
      };
    }
    const preview = await getTimewebProvisioningPreview(
      process.env,
      fetch,
      {
        selection: {
          region: this.requirePlan().region,
          presetId: this.requirePlan().presetId,
          operatingSystemId: this.requirePlan().operatingSystemId,
          backupsEnabled: this.requirePlan().backupsEnabled,
          publicIpv4: true,
        },
        approvedOwnedPublicIp,
      },
    );
    if (!preview.ok) {
      throw new LifecycleProviderError(
        preview.code,
        `Повторный provider preflight отклонён: ${preview.message}`,
      );
    }
    const fresh = preview.plan;
    const expected = this.requirePlan();
    if (
      fresh.presetId !== expected.presetId ||
      fresh.operatingSystemId !== expected.operatingSystemId ||
      fresh.availabilityZone !== expected.availabilityZone ||
      fresh.projectId !== expected.projectId ||
      fresh.sshKeyId !== expected.sshKeyId ||
      fresh.bandwidthMbps !== expected.bandwidthMbps ||
      fresh.monthlyServerRoubles !== expected.monthlyServerRoubles ||
      fresh.monthlyPublicIpRoubles !== expected.monthlyPublicIpRoubles ||
      fresh.backupsEnabled !== expected.backupsEnabled
    ) {
      throw new LifecycleProviderError(
        "STALE_PROVIDER_PLAN",
        "Provider catalog или цена изменились; создайте новую operation после preview.",
      );
    }
  }

  async createServer(): Promise<OwnedProviderResource> {
    const plan = this.requirePlan();
    const existing = await activeResource(
      this.sql,
      this.context.environmentId,
      "server",
    );
    if (existing) {
      return { ...existing, kind: "server" as const };
    }
    try {
      const recovered = await this.adapter.findServerByEnvironmentId(
        this.context.environmentId,
      );
      if (recovered) {
        await recordResource(this.sql, this.command, recovered, {
          presetId: plan.presetId,
          operatingSystemId: plan.operatingSystemId,
          availabilityZone: plan.availabilityZone,
          monthlyRoubles: plan.monthlyServerRoubles,
          projectId: plan.projectId,
          passwordAuthentication: false,
        });
        return recovered;
      }
      if (
        await providerMutationStarted(this.sql, this.command.operationId)
      ) {
        throw new LifecycleProviderError(
          "UNKNOWN_SERVER_OUTCOME",
          "Owned server не найден после timeout; повторное создание запрещено.",
        );
      }
      await this.assertFreshProviderPlan(true);
      if (!this.createExecutionToken) {
        throw new LifecycleProviderError(
          "STEP_STATE_INVALID",
          "Create execution token отсутствует до provider mutation.",
        );
      }
      const publicIp = await activeResource(
        this.sql,
        this.context.environmentId,
        "public_ip",
      );
      if (typeof publicIp?.publicMetadata.address !== "string") {
        throw new LifecycleProviderError(
          "PUBLIC_IP_NOT_READY",
          "Owned floating IP отсутствует до server create.",
          true,
        );
      }
      await markProviderMutationStarted(
        this.sql,
        this.command.operationId,
        this.createExecutionToken,
      );
      const resource = await this.adapter.createServer({
        environmentId: this.context.environmentId,
        name: this.context.environmentName,
        deploymentMode: "plain-vps",
        presetId: plan.presetId,
        operatingSystemId: plan.operatingSystemId,
        availabilityZone: plan.availabilityZone,
        projectId: plan.projectId,
        sshKeyId: plan.sshKeyId,
        bandwidthMbps: plan.bandwidthMbps,
        publicIpv4: publicIp.publicMetadata.address,
      });
      await recordResource(this.sql, this.command, resource, {
        presetId: plan.presetId,
        operatingSystemId: plan.operatingSystemId,
        availabilityZone: plan.availabilityZone,
        monthlyRoubles: plan.monthlyServerRoubles,
        projectId: plan.projectId,
        passwordAuthentication: false,
      });
      return resource;
    } catch (error) {
      throw mappedError(error);
    }
  }

  async configureBackups(): Promise<void> {
    const plan = this.requirePlan();
    const resource = await activeResource(
      this.sql,
      this.context.environmentId,
      "server",
    );
    if (!resource) {
      throw new LifecycleProviderError(
        "SERVER_NOT_RECORDED",
        "Owned server отсутствует до настройки автобэкапов.",
        true,
      );
    }
    const firstBackup = new Date(plan.checkedAt);
    firstBackup.setUTCDate(firstBackup.getUTCDate() + 1);
    const day = firstBackup.getUTCDay();
    try {
      await this.adapter.configureServerAutoBackups(
        { ...resource, kind: "server" },
        plan.backupsEnabled
          ? {
              enabled: true,
              interval: "week",
              copyCount: 1,
              creationStartAt: firstBackup.toISOString(),
              dayOfWeek: day === 0 ? 7 : day,
            }
          : { enabled: false },
      );
    } catch (error) {
      throw mappedError(error);
    }
  }

  async installServer(): Promise<void> {
    const plan = this.requireInstallPlan();
    const resource = await activeResource(
      this.sql,
      this.context.environmentId,
      "server",
    );
    if (!resource) {
      throw new LifecycleProviderError(
        "SERVER_NOT_RECORDED",
        "Owned VPS отсутствует до установки n8n.",
      );
    }
    try {
      if (
        await installMutationStarted(
          this.sql,
          this.command.operationId,
          plan,
        )
      ) {
        return;
      }
      if (!this.installExecutionToken) {
        throw new LifecycleProviderError(
          "STEP_STATE_INVALID",
          "Install execution token отсутствует до provider mutation.",
        );
      }
      await markInstallMutationStarted(
        this.sql,
        this.command.operationId,
        this.installExecutionToken,
        plan,
      );
      await runFreshInstallMutation(
        () =>
          this.adapter.installServer({
            resource: { ...resource, kind: "server" },
            operatingSystemId: plan.operatingSystemId,
            sshKeyId: plan.sshKeyId,
            cloudInit: buildStarterKitCloudInit(),
          }),
        () =>
          clearInstallMutationMarkerAfterDefinitiveRejection(
            this.sql,
            this.command.operationId,
            this.installExecutionToken!,
          ),
      );
    } catch (error) {
      throw mappedError(error);
    }
  }

  async reconcileInstallation(): Promise<void> {
    const plan = this.requireInstallPlan();
    const resource = await activeResource(
      this.sql,
      this.context.environmentId,
      "server",
    );
    if (!resource) {
      throw new LifecycleProviderError(
        "SERVER_NOT_RECORDED",
        "Owned VPS отсутствует во время reconciliation установки.",
      );
    }
    try {
      const reconciliation = await this.adapter.reconcileInstallation({
        ...resource,
        kind: "server",
      });
      if (reconciliation.state !== "present") {
        throw new LifecycleProviderError(
          "SERVER_REMOVED",
          "Timeweb больше не возвращает owned VPS после переустановки.",
        );
      }
      const attempts = await operationStepAttempts(
        this.sql,
        this.command.operationId,
        "provider_installing",
      );
      requireReadyServerStatus(reconciliation.status, attempts);
      if (reconciliation.operatingSystemId !== plan.operatingSystemId) {
        throw new LifecycleProviderError(
          attempts < 4 ? "SERVER_NOT_READY" : "INSTALL_OS_MISMATCH",
          attempts < 4
            ? "Timeweb ещё не подтвердил approved Ubuntu 24.04 image."
            : "Timeweb вернул running VPS с OS вне approved install plan.",
          attempts < 4,
        );
      }
      await this.adapter.ensureServerSshKey(
        { ...resource, kind: "server" },
        plan.sshKeyId,
      );
      await this.ensureAttachedPublicIp({ ...resource, kind: "server" });
      await recordResource(
        this.sql,
        this.command,
        { ...resource, kind: "server" },
        {
          operatingSystemId: plan.operatingSystemId,
          operatingSystemLabel: plan.operatingSystemLabel,
          installProfileVersion: plan.profileVersion,
        },
      );
    } catch (error) {
      throw mappedError(error);
    }
  }

  async reconcileServer(): Promise<void> {
    const resource = await activeResource(
      this.sql,
      this.context.environmentId,
      "server",
    );
    if (!resource) {
      throw new LifecycleProviderError(
        "SERVER_NOT_RECORDED",
        "Owned server отсутствует в durable state.",
      );
    }
    try {
      const reconciliation = await this.adapter.reconcileServer({
        ...resource,
        kind: "server",
      });
      if (reconciliation.state !== "present") {
        throw new LifecycleProviderError(
          "SERVER_NOT_READY",
          "Timeweb ещё не подтверждает созданный VPS.",
          true,
        );
      }
      requireReadyServerStatus(
        reconciliation.status,
        await operationStepAttempts(
          this.sql,
          this.command.operationId,
          "provider_installing",
        ),
      );
      await this.ensureAttachedPublicIp({
        ...resource,
        kind: "server",
      });
    } catch (error) {
      throw mappedError(error);
    }
  }

  async configureDns(): Promise<OwnedProviderResource> {
    const existing = await activeResource(
      this.sql,
      this.context.environmentId,
      "dns_record",
    );
    if (existing) {
      const metadata = existing.publicMetadata;
      if (
        metadata.zone !== COURSE_DNS_ZONE ||
        metadata.hostname !== COURSE_HOSTNAME ||
        metadata.type !== "A" ||
        typeof metadata.value !== "string" ||
        typeof metadata.ttl !== "number"
      ) {
        throw new LifecycleProviderError(
          "WRONG_OWNERSHIP",
          "Recorded DNS resource не прошёл metadata-проверку.",
        );
      }
      const resource: TimewebDnsRecord = {
        ...existing,
        kind: "dns_record",
        zone: COURSE_DNS_ZONE,
        hostname: COURSE_HOSTNAME,
        type: "A",
        value: metadata.value,
        ttl: metadata.ttl,
      };
      await recordDnsResource(this.sql, this.command, resource);
      return resource;
    }
    try {
      const allocations = await this.sql<
        { hostname: string; zone_name: string; status: string }[]
      >`
        SELECT hostname, zone_name, status
        FROM domain_allocations
        WHERE environment_id = ${this.context.environmentId}
          AND status NOT IN ('released', 'deleted')
        LIMIT 2
      `;
      const allocation = allocations[0];
      if (
        allocations.length !== 1 ||
        allocation?.hostname !== COURSE_HOSTNAME ||
        allocation.zone_name !== COURSE_DNS_ZONE ||
        !["reserved", "record_created"].includes(allocation.status)
      ) {
        throw new LifecycleProviderError(
          "DNS_RESERVATION_INVALID",
          "Approved hostname не зарезервирован для environment.",
        );
      }
      const publicIp = await activeResource(
        this.sql,
        this.context.environmentId,
        "public_ip",
      );
      const address = publicIp?.publicMetadata.address;
      if (typeof address !== "string") {
        throw new LifecycleProviderError(
          "PUBLIC_IP_NOT_READY",
          "Owned floating IP отсутствует до DNS create.",
          true,
        );
      }
      const records = await this.adapter.listDnsRecords({
        environmentId: this.context.environmentId,
        zone: COURSE_DNS_ZONE,
        hostname: COURSE_HOSTNAME,
      });
      const hostnameRecords = records.filter(
        (record) => record.hostname === COURSE_HOSTNAME,
      );
      const hostnames = await this.adapter.listDnsConflictingHostnames({
        environmentId: this.context.environmentId,
        zone: COURSE_DNS_ZONE,
        hostname: COURSE_HOSTNAME,
      });
      const marker = await dnsMutationMarker(
        this.sql,
        this.command.operationId,
      );
      if (marker) {
        const attempts = await operationStepAttempts(
          this.sql,
          this.command.operationId,
          "configure_dns",
        );
        const recovered = recoverDnsRecordCandidate(
          hostnameRecords,
          marker,
          COURSE_HOSTNAME,
          address,
          hostnames,
          attempts,
        );
        await recordDnsResource(this.sql, this.command, recovered);
        return recovered;
      }
      if (hostnames.includes(COURSE_HOSTNAME)) {
        throw new LifecycleProviderError(
          "DNS_CONFLICT",
          "Hostname n8n.neurokurs.ru уже содержит A-запись.",
        );
      }
      if (!this.configureDnsExecutionToken) {
        throw new LifecycleProviderError(
          "STEP_STATE_INVALID",
          "DNS execution token отсутствует до provider mutation.",
        );
      }
      await markDnsMutationStarted(
        this.sql,
        this.command.operationId,
        this.configureDnsExecutionToken,
        `${COURSE_HOSTNAME}:${address}`,
        hostnameRecords.map((record) => record.externalId),
      );
      const resource = await runFreshDnsCreate(
        () =>
          this.adapter.createDnsARecord({
            environmentId: this.context.environmentId,
            zone: COURSE_DNS_ZONE,
            hostname: COURSE_HOSTNAME,
            value: address,
            ttl: COURSE_DNS_TTL_SECONDS,
          }),
        () =>
          clearDnsMutationMarkerAfterDefinitiveRejection(
            this.sql,
            this.command.operationId,
            this.configureDnsExecutionToken!,
          ),
      );
      await recordDnsResource(this.sql, this.command, resource);
      return resource;
    } catch (error) {
      throw mappedError(error);
    }
  }

  async resolveDnsAmbiguity(): Promise<void> {
    try {
      if (
        await activeResource(
          this.sql,
          this.context.environmentId,
          "dns_record",
        )
      ) {
        return;
      }
      const rows = await this.sql<
        { create_operation_id: string; hostname: string; status: string }[]
      >`
        SELECT
          operations.id AS create_operation_id,
          domain_allocations.hostname,
          domain_allocations.status
        FROM operations
        JOIN domain_allocations
          ON domain_allocations.environment_id = operations.environment_id
        WHERE operations.environment_id = ${this.context.environmentId}
          AND operations.kind = 'create_environment'
          AND domain_allocations.hostname = ${COURSE_HOSTNAME}
        ORDER BY operations.created_at DESC
        LIMIT 1
      `;
      const row = rows[0];
      if (!row || ["released", "deleted"].includes(row.status)) return;
      const marker = await dnsMutationMarker(
        this.sql,
        row.create_operation_id,
      );
      if (!marker) {
        const released = await this.sql<{ id: string }[]>`
          UPDATE domain_allocations
          SET status = 'released', updated_at = now()
          WHERE environment_id = ${this.context.environmentId}
            AND hostname = ${COURSE_HOSTNAME}
            AND status = 'reserved'
          RETURNING id
        `;
        if (!released[0]) {
          throw new LifecycleProviderError(
            "DNS_RESERVATION_LOST",
            "DNS allocation без mutation marker не освобождён.",
          );
        }
        return;
      }

      const publicIp = await activeResource(
        this.sql,
        this.context.environmentId,
        "public_ip",
      );
      const address = publicIp?.publicMetadata.address;
      if (typeof address !== "string") {
        throw new LifecycleProviderError(
          "UNKNOWN_DNS_OUTCOME",
          "DNS mutation была начата, но expected public IP недоступен.",
        );
      }
      const records = await this.adapter.listDnsRecords({
        environmentId: this.context.environmentId,
        zone: COURSE_DNS_ZONE,
        hostname: COURSE_HOSTNAME,
      });
      const matches = records.filter(
        (record) => record.hostname === COURSE_HOSTNAME,
      );
      const conflictingHostnames =
        await this.adapter.listDnsConflictingHostnames({
          environmentId: this.context.environmentId,
          zone: COURSE_DNS_ZONE,
          hostname: COURSE_HOSTNAME,
        });
      const recovered = resolveDnsAmbiguityCandidate(
        matches,
        marker,
        COURSE_HOSTNAME,
        address,
        conflictingHostnames,
        await operationStepAttempts(
          this.sql,
          this.command.operationId,
          "resolve_dns_ambiguity",
        ),
      );
      await recordDnsResource(this.sql, this.command, recovered);
    } catch (error) {
      throw mappedError(error);
    }
  }

  async verifyTls(): Promise<void> {
    try {
      await createExternalEnvironmentVerifier().verifyTlsAndPorts(
        await this.publicIpv4(),
      );
    } catch (error) {
      throw mappedError(error);
    }
  }

  async verifyBootstrapReachable(): Promise<void> {
    try {
      await createExternalEnvironmentVerifier().verifyBootstrapReachable(
        await this.publicIpv4(),
      );
    } catch (error) {
      throw mappedError(error);
    }
  }

  async waitForDns(): Promise<void> {
    try {
      await createExternalEnvironmentVerifier().verifyDns(
        await this.publicIpv4(),
      );
    } catch (error) {
      throw mappedError(error);
    }
  }

  async verifyN8nHealth(): Promise<void> {
    try {
      await createExternalEnvironmentVerifier().verifyN8nHealth();
    } catch (error) {
      throw mappedError(error);
    }
  }

  async recordReadyInstallation(): Promise<void> {
    if (this.context.operationKind === "create_environment") return;
    const installPlan = this.requireInstallPlan();
    await this.sql.begin(async (transaction) => {
      await transaction`
        INSERT INTO software_installations (
          id, environment_id, profile_name, profile_version,
          software_version, status, health_status, installed_at,
          last_checked_at, managed_gateway_verified_at
        )
        VALUES (
          ${randomUUID()}, ${this.context.environmentId}, 'starter-kit',
          ${installPlan.profileVersion},
          ${STARTER_KIT_BOOTSTRAP_PROFILE.n8nVersion},
          'ready_owner_setup_required', 'healthy', now(), now(), now()
        )
        ON CONFLICT (environment_id, profile_name) DO UPDATE SET
          profile_version = EXCLUDED.profile_version,
          software_version = EXCLUDED.software_version,
          status = EXCLUDED.status,
          health_status = EXCLUDED.health_status,
          managed_gateway_verified_at = EXCLUDED.managed_gateway_verified_at,
          installed_at = COALESCE(
            software_installations.installed_at,
            EXCLUDED.installed_at
          ),
          last_checked_at = EXCLUDED.last_checked_at,
          updated_at = now()
      `;
      await transaction`
        UPDATE environments
        SET public_url = ${`https://${COURSE_HOSTNAME}`}, updated_at = now()
        WHERE id = ${this.context.environmentId}
      `;
    });
  }

  async deleteOwnedResource(resource: OwnedProviderResource): Promise<void> {
    try {
      if (resource.kind === "server") {
        await this.adapter.deleteServer({ ...resource, kind: "server" });
        const absent = await waitForAbsent(() =>
          this.adapter.reconcileServer({
            ...resource,
            kind: "server",
          }),
        );
        if (!absent) {
          throw new LifecycleProviderError(
            "DELETE_NOT_CONFIRMED",
            "Timeweb ещё не подтвердил удаление VPS.",
          );
        }
      } else if (resource.kind === "public_ip") {
        const current = await activeResource(
          this.sql,
          resource.environmentId,
          "public_ip",
        );
        const address = current?.publicMetadata.address;
        if (!current || typeof address !== "string") {
          throw new LifecycleProviderError(
            "PUBLIC_IP_NOT_FOUND",
            "Metadata публичного IP недоступна для cleanup.",
          );
        }
        const publicIp: TimewebPublicIpResource = {
          ...resource,
          kind: "public_ip",
          address,
        };
        await this.adapter.deletePublicIp(publicIp);
        const absent = await waitForAbsent(() =>
          this.adapter.reconcilePublicIp(publicIp),
        );
        if (!absent) {
          throw new LifecycleProviderError(
            "DELETE_NOT_CONFIRMED",
            "Timeweb ещё не подтвердил удаление публичного IP.",
          );
        }
      } else {
        const current = await activeResource(
          this.sql,
          resource.environmentId,
          "dns_record",
        );
        if (!current || current.externalId !== resource.externalId) {
          throw new LifecycleProviderError(
            "WRONG_OWNERSHIP",
            "DNS resource metadata не подтверждает ownership.",
          );
        }
        const metadata = current.publicMetadata;
        if (
          metadata.zone !== COURSE_DNS_ZONE ||
          metadata.hostname !== COURSE_HOSTNAME ||
          metadata.type !== "A" ||
          typeof metadata.value !== "string" ||
          typeof metadata.ttl !== "number"
        ) {
          throw new LifecycleProviderError(
            "WRONG_OWNERSHIP",
            "DNS resource metadata не подтверждает ownership.",
          );
        }
        const dnsRecord: TimewebDnsRecord = {
          ...resource,
          kind: "dns_record",
          zone: COURSE_DNS_ZONE,
          hostname: COURSE_HOSTNAME,
          type: "A",
          value: metadata.value,
          ttl: metadata.ttl,
        };
        await this.adapter.deleteDnsRecord(dnsRecord);
        const absent = await waitForAbsent(() =>
          this.adapter.reconcileDnsRecord(dnsRecord),
        );
        if (!absent) {
          throw new LifecycleProviderError(
            "DELETE_NOT_CONFIRMED",
            "Timeweb ещё не подтвердил удаление DNS record.",
            true,
          );
        }
      }
      if (resource.kind === "dns_record") {
        await this.sql.begin(async (transaction) => {
          await markDeleted(transaction, resource);
          const released = await transaction<{ id: string }[]>`
            UPDATE domain_allocations
            SET status = 'released', updated_at = now()
            WHERE environment_id = ${resource.environmentId}
              AND hostname = ${COURSE_HOSTNAME}
              AND provider_resource_id IN (
                SELECT id
                FROM provider_resources
                WHERE environment_id = ${resource.environmentId}
                  AND provider = 'timeweb'
                  AND resource_kind = 'dns_record'
                  AND provider_resource_id = ${resource.externalId}
              )
            RETURNING id
          `;
          if (!released[0]) {
            throw new LifecycleProviderError(
              "DNS_RESERVATION_LOST",
              "DNS allocation не освобождён атомарно.",
            );
          }
        });
      } else {
        await markDeleted(this.sql, resource);
      }
    } catch (error) {
      throw mappedError(error);
    }
  }
}

export function isProductionTimewebWorkflow(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const runtime = readCloudProviderRuntime(environment);
  if (
    environment.VERCEL_ENV === "production" &&
    environment.PLATFORM_PROVIDER === "timeweb" &&
    !runtimeUsesProvider(runtime, "timeweb")
  ) {
    throw new LifecycleProviderError(
      "MUTATION_GATE_CLOSED",
      "Production Timeweb provider недоступен во время workflow.",
    );
  }
  return runtimeUsesProvider(runtime, "timeweb");
}

async function operationRequiresTimeweb(
  sql: DatabaseSql,
  operationId: string,
): Promise<boolean> {
  const rows = await sql<{ required: boolean }[]>`
    SELECT (
      operations.input_snapshot ? 'providerPlan'
      OR operations.input_snapshot->>'providerMode' = 'timeweb'
      OR EXISTS (
        SELECT 1
        FROM operations AS environment_operations
        WHERE environment_operations.environment_id = operations.environment_id
          AND environment_operations.input_snapshot ? 'providerPlan'
      )
      OR EXISTS (
        SELECT 1
        FROM provider_resources
        WHERE provider_resources.environment_id = operations.environment_id
          AND provider_resources.provider = 'timeweb'
          AND provider_resources.ownership = 'platform'
          AND provider_resources.lifecycle_status <> 'deleted'
      )
    ) AS required
    FROM operations
    WHERE operations.id = ${operationId}
  `;
  if (!rows[0]) {
    throw new LifecycleProviderError(
      "INVALID_OPERATION",
      "Provider mode для operation не найден.",
    );
  }
  return rows[0].required;
}

export async function operationUsesProductionTimeweb(
  command: WorkflowCommand,
): Promise<boolean> {
  const sql = getDatabase();
  const required = await operationRequiresTimeweb(sql, command.operationId);
  const runtime = readCloudProviderRuntime();
  if (required && !runtimeUsesProvider(runtime, "timeweb")) {
    throw new LifecycleProviderError(
      "PROVIDER_MODE_DRIFT",
      "Operation закреплена за Timeweb, но production gate изменился.",
    );
  }
  return required;
}

export async function createInfrastructureLifecycleAdapter(
  command: WorkflowCommand,
  options: Readonly<{
    createExecutionToken?: string;
    reserveIpExecutionToken?: string;
    configureDnsExecutionToken?: string;
    installExecutionToken?: string;
  }> = {},
): Promise<InfrastructureLifecycleAdapter> {
  const sql = getDatabase();
  const requiresTimeweb = await operationRequiresTimeweb(
    sql,
    command.operationId,
  );
  if (!requiresTimeweb) {
    const fake = new FakeTimewebAdapter(
      sql,
      command.operationId,
      await operationEnvironmentId(sql, command.operationId),
      command.scenario,
    );
    return {
      reservePublicIp: async () => {
        await fake.reservePublicIp();
      },
      resolvePublicIpAmbiguity: async () => undefined,
      resolveServerAmbiguity: async () => undefined,
      resolveDnsAmbiguity: async () => undefined,
      createServer: () => fake.createServer(),
      reconcileServer: async () => undefined,
      configureBackups: () => fake.configureBackups(),
      installServer: () => fake.installServer(),
      reconcileInstallation: async () => undefined,
      configureDns: () => fake.configureDns(),
      verifyBootstrapReachable: async () => undefined,
      waitForDns: async () => undefined,
      verifyTls: () => fake.verifyTls(),
      verifyN8nHealth: async () => undefined,
      recordReadyInstallation: () => fake.recordReadyInstallation(),
      deleteOwnedResource: (resource) => fake.deleteOwnedResource(resource),
    };
  }
  const production = createProductionTimewebMutationAdapter();
  if (!production) {
    throw new LifecycleProviderError(
      "PROVIDER_MODE_DRIFT",
      "Timeweb operation не может перейти на fake adapter.",
    );
  }
  return new ProductionTimewebLifecycleAdapter(
    sql,
    command,
    await operationContext(sql, command),
    production,
    options.createExecutionToken,
    options.reserveIpExecutionToken,
    options.configureDnsExecutionToken,
    options.installExecutionToken,
  );
}

export function lifecycleProviderError(
  error: unknown,
): FakeProviderError | LifecycleProviderError | null {
  if (error instanceof FakeProviderError || error instanceof LifecycleProviderError) {
    return error;
  }
  return null;
}
