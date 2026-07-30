import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { getDatabase, type DatabaseSql } from "@/server/db/client";
import type { WorkflowCommand } from "@/server/operations/contracts";
import { operationEnvironmentId } from "@/server/operations/repository";

import type {
  OwnedProviderResource,
  TimewebPublicIpCandidate,
  TimewebPublicIpResource,
  TimewebResourceKind,
} from "./contracts";
import { FakeProviderError, FakeTimewebAdapter } from "./fake";
import { createProductionTimewebMutationAdapter } from "./mutation";
import {
  getTimewebProvisioningPreview,
  type TimewebProvisioningPlan,
} from "./provisioning";
import { TimewebProviderError } from "./read-only";
import { readTimewebMutationRuntimeGate } from "./runtime";

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
  createServer(): Promise<OwnedProviderResource>;
  reconcileServer(): Promise<void>;
  configureDns(): Promise<OwnedProviderResource | void>;
  verifyTls(): Promise<void>;
  deleteOwnedResource(resource: OwnedProviderResource): Promise<void>;
}>;

type OperationContext = Readonly<{
  environmentId: string;
  environmentName: string;
  plan: TimewebProvisioningPlan | null;
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
    plan.version !== "timeweb-provisioning-v1" ||
    !Number.isSafeInteger(plan.presetId) ||
    !Number.isSafeInteger(plan.operatingSystemId) ||
    typeof plan.projectId !== "number" ||
    !Number.isSafeInteger(plan.projectId) ||
    typeof plan.sshKeyId !== "number" ||
    !Number.isSafeInteger(plan.sshKeyId) ||
    typeof plan.monthlyPublicIpRoubles !== "number" ||
    !Number.isFinite(plan.monthlyPublicIpRoubles) ||
    typeof plan.availabilityZone !== "string" ||
    plan.projectId <= 0 ||
    plan.sshKeyId <= 0 ||
    plan.monthlyPublicIpRoubles <= 0
  ) {
    throw new LifecycleProviderError(
      "INVALID_PROVIDER_PLAN",
      "Production provider plan не прошёл проверку.",
    );
  }
  return value as TimewebProvisioningPlan;
}

async function operationContext(
  sql: DatabaseSql,
  command: WorkflowCommand,
): Promise<OperationContext> {
  const rows = await sql<
    {
      environment_id: string;
      environment_name: string;
      input_snapshot: Record<string, unknown>;
    }[]
  >`
    SELECT
      operations.environment_id,
      environments.name AS environment_name,
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
    environmentId: row.environment_id,
    environmentName: row.environment_name,
    plan:
      row.input_snapshot.providerPlan === undefined
        ? null
        : safePlan(row.input_snapshot.providerPlan),
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
  sql: DatabaseSql,
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
  sql: DatabaseSql,
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
      await this.assertFreshProviderPlan();
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

  private async assertFreshProviderPlan(): Promise<void> {
    const preview = await getTimewebProvisioningPreview();
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
      fresh.monthlyServerRoubles !== expected.monthlyServerRoubles ||
      fresh.monthlyPublicIpRoubles !== expected.monthlyPublicIpRoubles
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
      await this.assertFreshProviderPlan();
      if (!this.createExecutionToken) {
        throw new LifecycleProviderError(
          "STEP_STATE_INVALID",
          "Create execution token отсутствует до provider mutation.",
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
        presetId: plan.presetId,
        operatingSystemId: plan.operatingSystemId,
        availabilityZone: plan.availabilityZone,
        projectId: plan.projectId,
        sshKeyId: plan.sshKeyId,
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
      if (reconciliation.status.state === "unsupported") {
        throw new LifecycleProviderError(
          "PROVIDER_STATUS_UNSUPPORTED",
          "Timeweb вернул неизвестный server status; автоматический active запрещён.",
        );
      }
      if (reconciliation.status.value === "blocked") {
        throw new LifecycleProviderError(
          "SERVER_BLOCKED",
          "Timeweb заблокировал созданный VPS.",
        );
      }
      if (reconciliation.status.value !== "on") {
        throw new LifecycleProviderError(
          "SERVER_NOT_READY",
          `Timeweb server ещё не готов: ${reconciliation.status.value}.`,
          true,
        );
      }
      await this.ensureAttachedPublicIp({
        ...resource,
        kind: "server",
      });
    } catch (error) {
      throw mappedError(error);
    }
  }

  async configureDns(): Promise<void> {
    throw new LifecycleProviderError(
      "OUT_OF_SCOPE",
      "DNS относится к срезу 1B и не вызывается в production 1A.",
    );
  }

  async verifyTls(): Promise<void> {
    throw new LifecycleProviderError(
      "OUT_OF_SCOPE",
      "TLS относится к срезу 1B и не вызывается в production 1A.",
    );
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
        if (typeof address !== "string") {
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
        throw new LifecycleProviderError(
          "OUT_OF_SCOPE",
          "DNS cleanup относится к срезу 1B.",
        );
      }
      await markDeleted(this.sql, resource);
    } catch (error) {
      throw mappedError(error);
    }
  }
}

export function isProductionTimewebWorkflow(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const gate = readTimewebMutationRuntimeGate(environment);
  if (
    environment.VERCEL_ENV === "production" &&
    environment.PLATFORM_PROVIDER === "timeweb" &&
    gate.mode !== "timeweb"
  ) {
    throw new LifecycleProviderError(
      "MUTATION_GATE_CLOSED",
      "Production Timeweb mutation gate закрылся во время workflow.",
    );
  }
  return gate.mode === "timeweb";
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
  const gate = readTimewebMutationRuntimeGate();
  if (required && gate.mode !== "timeweb") {
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
      createServer: () => fake.createServer(),
      reconcileServer: async () => undefined,
      configureDns: () => fake.configureDns(),
      verifyTls: () => fake.verifyTls(),
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
