import "server-only";

import { randomUUID } from "node:crypto";

import { getDatabase, type DatabaseSql } from "@/server/db/client";
import type { WorkflowCommand } from "@/server/operations/contracts";
import { operationEnvironmentId } from "@/server/operations/repository";

import type {
  OwnedProviderResource,
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

async function stepAttempts(
  sql: DatabaseSql,
  operationId: string,
  key: string,
): Promise<number> {
  const rows = await sql<{ attempt_count: number }[]>`
    SELECT attempt_count
    FROM operation_steps
    WHERE operation_id = ${operationId} AND logical_key = ${key}
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
    // Production creates the IPv4 atomically with the marked server. A
    // standalone IP has no provider-side ownership marker and cannot be
    // reconciled safely after an ambiguous POST timeout.
  }

  private async ensureAttachedPublicIp(
    server: OwnedProviderResource & Readonly<{ kind: "server" }>,
  ): Promise<void> {
    const plan = this.requirePlan();
    const existing = await activeResource(
      this.sql,
      this.context.environmentId,
      "public_ip",
    );
    if (existing) return;
    const resource = await this.adapter.findPublicIpByServer(server);
    if (!resource) {
      throw new LifecycleProviderError(
        "PUBLIC_IP_NOT_READY",
        "Timeweb ещё не привязал атомарно созданный публичный IP к VPS.",
        true,
      );
    }
    await recordResource(this.sql, this.command, resource, {
      address: resource.address,
      availabilityZone: plan.availabilityZone,
      monthlyRoubles: plan.monthlyPublicIpRoubles,
    });
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
      const server = { ...existing, kind: "server" as const };
      await this.ensureAttachedPublicIp(server);
      return server;
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
        await this.ensureAttachedPublicIp(recovered);
        return recovered;
      }
      if (
        (await stepAttempts(
          this.sql,
          this.command.operationId,
          "create_server",
        )) > 1
      ) {
        throw new LifecycleProviderError(
          "UNKNOWN_SERVER_OUTCOME",
          "Owned server не найден после timeout; повторное создание запрещено.",
        );
      }
      await this.assertFreshProviderPlan();
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
      await this.ensureAttachedPublicIp(resource);
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
