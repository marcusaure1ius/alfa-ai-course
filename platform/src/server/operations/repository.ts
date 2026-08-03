import "server-only";

import { createHash, randomUUID } from "node:crypto";

import type { AuthSession } from "../auth/service";
import { hasFreshReauthentication, hasPermission } from "../auth/rbac";
import type { DatabaseSql } from "../db/client";
import type { OwnedProviderResource } from "../providers/timeweb/contracts";
import {
  COURSE_DNS_ZONE,
  COURSE_HOSTNAME,
} from "../providers/timeweb/bootstrap-profile";
import type {
  TimewebInstallPlan,
  TimewebInstallTarget,
} from "../providers/timeweb/installation";
import type { TimewebProvisioningPlan } from "../providers/timeweb/provisioning";
import {
  MUTATION_COMMAND_VERSION,
  OPERATIONS_DTO_VERSION,
  type FakeScenario,
  type GuardedMutationCommand,
  type MutationAccepted,
  type TimelineStep,
} from "./contracts";
import { redactBounded } from "./redaction";
import {
  canTransitionEnvironment,
  type EnvironmentStatus,
  type RetryClass,
} from "./state";

export class OperationConflictError extends Error {
  constructor(
    public readonly code:
      | "ACTIVE_ENVIRONMENT"
      | "ACTIVE_MUTATION"
      | "IDEMPOTENCY_CONFLICT"
      | "INVALID_STATE"
      | "DNS_CONFLICT",
  ) {
    super(code);
  }
}

export class StepLeaseLostError extends Error {
  constructor() {
    super("STEP_LEASE_LOST");
  }
}

export class MutationGuardError extends Error {
  constructor(
    public readonly code:
      | "FORBIDDEN"
      | "STALE_REAUTH"
      | "INVALID_COMMAND"
      | "INVALID_OPERATION"
      | "INVALID_STATE"
      | "ACTIVE_ENVIRONMENT_LIMIT"
      | "WRONG_OWNERSHIP",
  ) {
    super(code);
  }
}

function assertFreshAdmin(actor: AuthSession): void {
  if (!hasPermission(actor.role, "infrastructure:manage")) {
    throw new MutationGuardError("FORBIDDEN");
  }
  if (!hasFreshReauthentication(actor.reauthenticatedAt)) {
    throw new MutationGuardError("STALE_REAUTH");
  }
}

type ExistingOperation = {
  id: string;
  environment_id: string;
  environment_name: string;
  kind: string;
  input_snapshot: Record<string, unknown>;
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function idempotencyFingerprint(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function providerPlanIntent(value: unknown): unknown {
  if (value == null) return null;
  const plan = value as Record<string, unknown>;
  return {
    version: plan.version,
    deploymentMode: plan.deploymentMode,
    region: plan.region,
    presetId: plan.presetId,
    operatingSystemId: plan.operatingSystemId,
    backupsEnabled: plan.backupsEnabled,
    publicIpv4: plan.publicIpv4,
  };
}

function createFingerprint(input: {
  name: string;
  scenario: FakeScenario;
  providerPlan?: TimewebProvisioningPlan;
}): string {
  return idempotencyFingerprint({
    kind: "create_environment",
    name: input.name,
    scenario: input.scenario,
    providerPlan: providerPlanIntent(input.providerPlan),
  });
}

function deleteFingerprint(input: {
  environmentId: string;
  confirmationName: string;
  confirmedLoss: true;
  scenario: FakeScenario;
}): string {
  return idempotencyFingerprint({
    kind: "delete_environment",
    environmentId: input.environmentId,
    confirmationName: input.confirmationName,
    confirmedLoss: input.confirmedLoss,
    scenario: input.scenario,
  });
}

function installFingerprint(input: {
  environmentId: string;
  confirmationName: string;
  confirmedLoss: true;
  scenario: FakeScenario;
  installPlan: TimewebInstallPlan;
}): string {
  return idempotencyFingerprint({
    kind: "install_environment",
    environmentId: input.environmentId,
    confirmationName: input.confirmationName,
    confirmedLoss: input.confirmedLoss,
    scenario: input.scenario,
    installPlan: installPlanIntent(input.installPlan),
  });
}

function installPlanIntent(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const plan = value as Record<string, unknown>;
  return {
    version: plan.version,
    deploymentMode: plan.deploymentMode,
    operatingSystemId: plan.operatingSystemId,
    operatingSystemLabel: plan.operatingSystemLabel,
    sshKeyId: plan.sshKeyId,
    hostname: plan.hostname,
    profileVersion: plan.profileVersion,
    release: plan.release,
    installerUrl: plan.installerUrl,
    installerSha256: plan.installerSha256,
  };
}

async function existingOperation(
  sql: DatabaseSql,
  actorUserId: string,
  idempotencyKey: string,
): Promise<ExistingOperation | null> {
  const rows = await sql<ExistingOperation[]>`
    SELECT
      operations.id,
      operations.environment_id,
      environments.name AS environment_name,
      operations.kind,
      operations.input_snapshot
    FROM operations
    JOIN environments ON environments.id = operations.environment_id
    WHERE operations.requested_by_user_id = ${actorUserId}
      AND operations.idempotency_key = ${idempotencyKey}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

function storedCreateFingerprint(operation: ExistingOperation): string {
  return idempotencyFingerprint({
    kind: operation.kind,
    name: operation.environment_name,
    scenario: operation.input_snapshot.scenario,
    providerPlan: providerPlanIntent(operation.input_snapshot.providerPlan),
  });
}

function storedDeleteFingerprint(operation: ExistingOperation): string {
  return idempotencyFingerprint({
    kind: operation.kind,
    environmentId: operation.environment_id,
    confirmationName: operation.input_snapshot.confirmedName,
    confirmedLoss: operation.input_snapshot.confirmed,
    scenario: operation.input_snapshot.scenario,
  });
}

function storedInstallFingerprint(operation: ExistingOperation): string {
  return idempotencyFingerprint({
    kind: operation.kind,
    environmentId: operation.environment_id,
    confirmationName: operation.input_snapshot.confirmedName,
    confirmedLoss: operation.input_snapshot.confirmed,
    scenario: operation.input_snapshot.scenario,
    installPlan: installPlanIntent(operation.input_snapshot.installPlan),
  });
}

function acceptMatchingOperation(
  operation: ExistingOperation | null,
  expectedFingerprint: string,
  storedFingerprint: (operation: ExistingOperation) => string,
): { accepted: MutationAccepted; created: false } | null {
  if (!operation) return null;
  if (storedFingerprint(operation) !== expectedFingerprint) {
    throw new OperationConflictError("IDEMPOTENCY_CONFLICT");
  }
  return {
    accepted: { version: OPERATIONS_DTO_VERSION, operationId: operation.id },
    created: false,
  };
}

export async function reserveCreateOperation(
  sql: DatabaseSql,
  actor: AuthSession,
  input: {
    name: string;
    idempotencyKey: string;
    scenario: FakeScenario;
    providerPlan?: TimewebProvisioningPlan;
  },
): Promise<{ accepted: MutationAccepted; created: boolean }> {
  assertFreshAdmin(actor);
  const expectedFingerprint = createFingerprint(input);
  const existing = acceptMatchingOperation(
    await existingOperation(sql, actor.userId, input.idempotencyKey),
    expectedFingerprint,
    storedCreateFingerprint,
  );
  if (existing) return existing;

  const environmentId = randomUUID();
  const operationId = randomUUID();
  try {
    await sql.begin(async (transaction) => {
      await transaction`
        INSERT INTO environments (id, name, owner_user_id, status)
        VALUES (${environmentId}, ${input.name}, ${actor.userId}, 'creating')
      `;
      await transaction`
        INSERT INTO operations (
          id, environment_id, kind, status, requested_by_user_id,
          requested_by_session_id, idempotency_key, input_snapshot
        )
        VALUES (
          ${operationId}, ${environmentId}, 'create_environment', 'queued',
          ${actor.userId}, ${actor.sessionId}, ${input.idempotencyKey},
          ${transaction.json({
            scenario: input.scenario,
            ...(input.providerPlan ? { providerPlan: input.providerPlan } : {}),
          })}
        )
      `;
      await transaction`
        INSERT INTO audit_events (
          id, actor_user_id, action, subject_type, subject_id, outcome, metadata
        )
        VALUES (
          ${randomUUID()}, ${actor.userId}, 'operation.create.started',
          'operation', ${operationId}, 'success',
          ${transaction.json({ environmentId, kind: "create_environment" })}
        )
      `;
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      const duplicate = acceptMatchingOperation(
        await existingOperation(sql, actor.userId, input.idempotencyKey),
        expectedFingerprint,
        storedCreateFingerprint,
      );
      if (duplicate) return duplicate;
      throw new OperationConflictError("ACTIVE_ENVIRONMENT");
    }
    throw error;
  }

  return {
    accepted: { version: OPERATIONS_DTO_VERSION, operationId },
    created: true,
  };
}

export async function getInstallTarget(
  sql: DatabaseSql,
  environmentId: string,
): Promise<TimewebInstallTarget | null> {
  const rows = await sql<
    {
      environment_status: string;
      server_provider: string;
      server_id: string;
      public_ip_provider: string;
      public_ip_id: string;
      public_ipv4: string | null;
      ssh_key_id: number | null;
    }[]
  >`
    SELECT
      environments.status AS environment_status,
      server.provider AS server_provider,
      server.provider_resource_id AS server_id,
      public_ip.provider AS public_ip_provider,
      public_ip.provider_resource_id AS public_ip_id,
      public_ip.public_metadata->>'address' AS public_ipv4,
      (
        SELECT (operations.input_snapshot->'providerPlan'->>'sshKeyId')::int
        FROM operations
        WHERE operations.environment_id = environments.id
          AND operations.kind = 'create_environment'
          AND operations.input_snapshot ? 'providerPlan'
        ORDER BY operations.created_at DESC
        LIMIT 1
      ) AS ssh_key_id
    FROM environments
    JOIN provider_resources AS server
      ON server.environment_id = environments.id
      AND server.resource_kind = 'server'
      AND server.ownership = 'platform'
      AND server.lifecycle_status <> 'deleted'
    JOIN provider_resources AS public_ip
      ON public_ip.environment_id = environments.id
      AND public_ip.resource_kind = 'public_ip'
      AND public_ip.ownership = 'platform'
      AND public_ip.lifecycle_status <> 'deleted'
    WHERE environments.id = ${environmentId}
      AND environments.status IN ('active', 'degraded')
    LIMIT 2
  `;
  if (rows.length !== 1) return null;
  const row = rows[0]!;
  if (
    row.server_provider !== row.public_ip_provider ||
    !["fake-timeweb", "timeweb"].includes(row.server_provider) ||
    typeof row.public_ipv4 !== "string"
  ) {
    return null;
  }
  const sshKeyId =
    row.server_provider === "fake-timeweb" ? 1 : row.ssh_key_id;
  if (!sshKeyId || !Number.isSafeInteger(sshKeyId) || sshKeyId <= 0) {
    return null;
  }
  return {
    provider: row.server_provider as "fake-timeweb" | "timeweb",
    serverExternalId: row.server_id,
    publicIpExternalId: row.public_ip_id,
    publicIpv4: row.public_ipv4,
    sshKeyId,
  };
}

export async function reserveInstallOperation(
  sql: DatabaseSql,
  actor: AuthSession,
  input: {
    environmentId: string;
    confirmationName: string;
    confirmedLoss: true;
    idempotencyKey: string;
    scenario: FakeScenario;
    installPlan: TimewebInstallPlan;
  },
): Promise<{ accepted: MutationAccepted; created: boolean }> {
  assertFreshAdmin(actor);
  const expectedFingerprint = installFingerprint(input);
  const operationId = randomUUID();
  const reservation = await sql.begin(async (transaction) => {
    const lockKey = `${actor.userId}:${input.idempotencyKey}`;
    await transaction`
      SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
    `;
    const existingRows = await transaction<ExistingOperation[]>`
      SELECT
        operations.id,
        operations.environment_id,
        environments.name AS environment_name,
        operations.kind,
        operations.input_snapshot
      FROM operations
      JOIN environments ON environments.id = operations.environment_id
      WHERE operations.requested_by_user_id = ${actor.userId}
        AND operations.idempotency_key = ${input.idempotencyKey}
      LIMIT 1
    `;
    const existing = acceptMatchingOperation(
      existingRows[0] ?? null,
      expectedFingerprint,
      storedInstallFingerprint,
    );
    if (existing) {
      return { operationId: existing.accepted.operationId, created: false };
    }
    const environments = await transaction<
      { id: string; name: string; status: string }[]
    >`
      SELECT id, name, status
      FROM environments
      WHERE id = ${input.environmentId}
      FOR UPDATE
    `;
    const environment = environments[0];
    if (
      !environment ||
      environment.name !== input.confirmationName ||
      !["active", "degraded"].includes(environment.status)
    ) {
      throw new OperationConflictError("INVALID_STATE");
    }
    const resources = await transaction<
      { resource_kind: string; ownership: string }[]
    >`
      SELECT resource_kind, ownership
      FROM provider_resources
      WHERE environment_id = ${input.environmentId}
        AND lifecycle_status <> 'deleted'
        AND resource_kind IN ('server', 'public_ip')
    `;
    if (
      resources.length !== 2 ||
      resources.some((resource) => resource.ownership !== "platform") ||
      !resources.some((resource) => resource.resource_kind === "server") ||
      !resources.some((resource) => resource.resource_kind === "public_ip")
    ) {
      throw new OperationConflictError("INVALID_STATE");
    }
    const installed = await transaction<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM software_installations
      WHERE environment_id = ${input.environmentId}
        AND status = 'ready_owner_setup_required'
    `;
    if ((installed[0]?.count ?? 0) > 0) {
      throw new OperationConflictError("INVALID_STATE");
    }
    await transaction`
      INSERT INTO operations (
        id, environment_id, kind, status, requested_by_user_id,
        requested_by_session_id, idempotency_key, input_snapshot
      )
      VALUES (
        ${operationId}, ${input.environmentId}, 'install_environment', 'queued',
        ${actor.userId}, ${actor.sessionId}, ${input.idempotencyKey},
        ${transaction.json({
          scenario: input.scenario,
          confirmedName: input.confirmationName,
          confirmed: input.confirmedLoss,
          installPlan: input.installPlan,
        })}
      )
    `;
    const allocations = await transaction<{ id: string }[]>`
      INSERT INTO domain_allocations (
        id, environment_id, hostname, zone_name, record_type, status
      )
      VALUES (
        ${randomUUID()}, ${input.environmentId}, ${COURSE_HOSTNAME},
        ${COURSE_DNS_ZONE}, 'A', 'reserved'
      )
      ON CONFLICT (hostname) WHERE status NOT IN ('released', 'deleted')
      DO UPDATE SET
        updated_at = now(),
        status = CASE
          WHEN domain_allocations.status = 'record_created'
          THEN 'record_created'
          ELSE 'reserved'
        END
      WHERE domain_allocations.environment_id = EXCLUDED.environment_id
      RETURNING id
    `;
    if (!allocations[0]) throw new OperationConflictError("DNS_CONFLICT");
    await transaction`
      INSERT INTO audit_events (
        id, actor_user_id, action, subject_type, subject_id, outcome, metadata
      )
      VALUES (
        ${randomUUID()}, ${actor.userId}, 'operation.install_n8n.started',
        'operation', ${operationId}, 'success',
        ${transaction.json({
          environmentId: input.environmentId,
          confirmed: input.confirmedLoss,
          installProfileVersion: input.installPlan.profileVersion,
        })}
      )
    `;
    return { operationId, created: true };
  });
  return {
    accepted: {
      version: OPERATIONS_DTO_VERSION,
      operationId: reservation.operationId,
    },
    created: reservation.created,
  };
}

/**
 * Restarts a durable install whose Workflow already released its failed step.
 * The existing operation and its completed steps are reused, so a recovery
 * cannot allocate another server, public IP, or DNS record.
 */
export async function resumeInterruptedInstallOperation(
  sql: DatabaseSql,
  actor: AuthSession,
  input: {
    environmentId: string;
    confirmationName: string;
    confirmedLoss: true;
  },
): Promise<{ accepted: MutationAccepted; resumed: true } | null> {
  assertFreshAdmin(actor);
  return sql.begin(async (transaction) => {
    await transaction`
      SELECT pg_advisory_xact_lock(hashtextextended(${input.environmentId}, 0))
    `;
    const operations = await transaction<
      { id: string; environment_name: string }[]
    >`
      SELECT operations.id, environments.name AS environment_name
      FROM operations
      JOIN environments ON environments.id = operations.environment_id
      WHERE operations.environment_id = ${input.environmentId}
        AND operations.kind = 'install_environment'
        AND operations.status = 'running'
        AND environments.status IN ('active', 'degraded')
      ORDER BY operations.created_at DESC
      FOR UPDATE OF operations, environments
      LIMIT 1
    `;
    const operation = operations[0];
    if (!operation) return null;
    if (operation.environment_name !== input.confirmationName) {
      throw new OperationConflictError("INVALID_STATE");
    }
    const resumable = await transaction<{ resumable: boolean }[]>`
      SELECT COALESCE((
        SELECT
          operation_steps.status = 'failed'
          AND operation_steps.retry_class = 'transient'
          AND operation_steps.execution_token IS NULL
          AND operation_steps.lease_expires_at IS NULL
          AND operation_steps.updated_at < now() - interval '2 minutes'
        FROM operation_steps
        WHERE operation_steps.operation_id = ${operation.id}
          AND operation_steps.status <> 'succeeded'
        ORDER BY operation_steps.step_order DESC
        LIMIT 1
      ), false) AS resumable
    `;
    if (!resumable[0]?.resumable) return null;

    const resumed = await transaction<{ id: string }[]>`
      UPDATE operations
      SET requested_by_user_id = ${actor.userId},
          requested_by_session_id = ${actor.sessionId},
          workflow_run_id = NULL,
          updated_at = now()
      WHERE id = ${operation.id}
        AND status = 'running'
        AND NOT EXISTS (
          SELECT 1 FROM operation_steps
          WHERE operation_steps.operation_id = operations.id
            AND operation_steps.status = 'running'
        )
      RETURNING id
    `;
    if (!resumed[0]) return null;
    await transaction`
      INSERT INTO audit_events (
        id, actor_user_id, action, subject_type, subject_id, outcome, metadata
      )
      VALUES (
        ${randomUUID()}, ${actor.userId}, 'operation.install_n8n.resumed',
        'operation', ${operation.id}, 'success',
        ${transaction.json({ environmentId: input.environmentId })}
      )
    `;
    return {
      accepted: {
        version: OPERATIONS_DTO_VERSION,
        operationId: operation.id,
      },
      resumed: true,
    };
  });
}

export async function reserveDeleteOperation(
  sql: DatabaseSql,
  actor: AuthSession,
  input: {
    environmentId: string;
    confirmationName: string;
    confirmedLoss: true;
    idempotencyKey: string;
    scenario: FakeScenario;
  },
): Promise<{ accepted: MutationAccepted; created: boolean }> {
  assertFreshAdmin(actor);
  const expectedFingerprint = deleteFingerprint(input);
  const operationId = randomUUID();
  const reservation = await sql.begin(async (transaction) => {
      const lockKey = `${actor.userId}:${input.idempotencyKey}`;
      await transaction`
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
      `;
      const existingRows = await transaction<ExistingOperation[]>`
        SELECT
          operations.id,
          operations.environment_id,
          environments.name AS environment_name,
          operations.kind,
          operations.input_snapshot
        FROM operations
        JOIN environments ON environments.id = operations.environment_id
        WHERE operations.requested_by_user_id = ${actor.userId}
          AND operations.idempotency_key = ${input.idempotencyKey}
        LIMIT 1
      `;
      const existing = acceptMatchingOperation(
        existingRows[0] ?? null,
        expectedFingerprint,
        storedDeleteFingerprint,
      );
      if (existing) {
        return {
          operationId: existing.accepted.operationId,
          created: false,
        };
      }
      const activeOperations = await transaction<
        { id: string; kind: string }[]
      >`
        SELECT id, kind
        FROM operations
        WHERE environment_id = ${input.environmentId}
          AND status IN ('queued', 'running')
          AND kind IN (
            'create_environment',
            'install_environment',
            'delete_environment'
          )
        FOR UPDATE
      `;
      const activeOperation = activeOperations[0];
      if (activeOperation) {
        if (activeOperation.kind !== "install_environment") {
          throw new OperationConflictError("INVALID_STATE");
        }
        const resumable = await transaction<{ resumable: boolean }[]>`
          SELECT COALESCE((
            SELECT
              operation_steps.status = 'failed'
              AND operation_steps.retry_class = 'transient'
              AND operation_steps.execution_token IS NULL
              AND operation_steps.lease_expires_at IS NULL
              AND operation_steps.updated_at < now() - interval '2 minutes'
            FROM operation_steps
            WHERE operation_steps.operation_id = ${activeOperation.id}
              AND operation_steps.status <> 'succeeded'
            ORDER BY operation_steps.step_order DESC
            LIMIT 1
          ), false) AS resumable
        `;
        if (!resumable[0]?.resumable) {
          throw new OperationConflictError("INVALID_STATE");
        }
        await transaction`
          UPDATE operations
          SET status = 'cancelled', error_code = 'CLEANUP_REQUESTED',
              error_message_redacted =
                'Прерванная установка отменена перед удалением среды.',
              finished_at = now(), state_version = state_version + 1,
              updated_at = now()
          WHERE id = ${activeOperation.id}
            AND status = 'running'
        `;
        await transaction`
          INSERT INTO audit_events (
            id, actor_user_id, action, subject_type, subject_id, outcome, metadata
          )
          VALUES (
            ${randomUUID()}, ${actor.userId},
            'operation.install_n8n.cancelled_for_delete', 'operation',
            ${activeOperation.id}, 'success',
            ${transaction.json({ environmentId: input.environmentId })}
          )
        `;
      }
      const rows = await transaction<{ id: string }[]>`
        UPDATE environments
        SET status = 'deleting', updated_at = now()
        WHERE id = ${input.environmentId}
          AND name = ${input.confirmationName}
          AND status IN ('active', 'degraded', 'cleanup_required')
        RETURNING id
      `;
      if (!rows[0]) throw new OperationConflictError("INVALID_STATE");
      await transaction`
        INSERT INTO operations (
          id, environment_id, kind, status, requested_by_user_id,
          requested_by_session_id, idempotency_key, input_snapshot
        )
        VALUES (
          ${operationId}, ${input.environmentId}, 'delete_environment', 'queued',
          ${actor.userId}, ${actor.sessionId}, ${input.idempotencyKey},
          ${transaction.json({
            scenario: input.scenario,
            confirmedName: input.confirmationName,
            confirmed: input.confirmedLoss,
          })}
        )
      `;
      await transaction`
        INSERT INTO audit_events (
          id, actor_user_id, action, subject_type, subject_id, outcome, metadata
        )
        VALUES (
          ${randomUUID()}, ${actor.userId}, 'operation.delete.started',
          'operation', ${operationId}, 'success',
          ${transaction.json({
            environmentId: input.environmentId,
            confirmed: input.confirmedLoss,
          })}
        )
      `;
      return { operationId, created: true };
    });
  return {
    accepted: {
      version: OPERATIONS_DTO_VERSION,
      operationId: reservation.operationId,
    },
    created: reservation.created,
  };
}

export type GuardedMutationAuthorization = Readonly<{
  command: GuardedMutationCommand;
  environmentId: string;
  resource:
    | Readonly<{ state: "absent" }>
    | Readonly<{ state: "deleted"; value: OwnedProviderResource }>
    | Readonly<{ state: "active"; value: OwnedProviderResource }>;
}>;

type GuardRow = {
  operation_kind: string;
  operation_status: string;
  input_snapshot: Record<string, unknown>;
  environment_id: string;
  environment_name: string;
  environment_status: EnvironmentStatus;
  user_role: string;
  user_status: string;
  session_active: boolean;
  reauth_fresh: boolean;
  has_verified_factor: boolean;
  mfa_fresh: boolean;
};

export async function authorizeMutationStep(
  sql: DatabaseSql,
  command: GuardedMutationCommand,
): Promise<GuardedMutationAuthorization> {
  const commandKeys = Object.keys(command);
  if (
    commandKeys.length !== 4 ||
    !commandKeys.every((key) =>
      ["version", "operationId", "action", "resourceKind"].includes(key),
    ) ||
    command.version !== MUTATION_COMMAND_VERSION ||
    !["create", "install", "delete"].includes(command.action) ||
    !["server", "public_ip", "dns_record"].includes(command.resourceKind)
  ) {
    throw new MutationGuardError("INVALID_COMMAND");
  }

  return sql.begin(async (transaction) => {
    await transaction`
      SELECT pg_advisory_xact_lock(hashtextextended(${command.operationId}, 0))
    `;
    const rows = await transaction<GuardRow[]>`
      SELECT
        operations.kind AS operation_kind,
        operations.status AS operation_status,
        operations.input_snapshot,
        environments.id AS environment_id,
        environments.name AS environment_name,
        environments.status AS environment_status,
        users.role_id AS user_role,
        users.status AS user_status,
        EXISTS (
          SELECT 1
          FROM auth_factors
          WHERE auth_factors.user_id = users.id
            AND auth_factors.verified_at IS NOT NULL
            AND auth_factors.disabled_at IS NULL
        ) AS has_verified_factor,
        (
          auth_sessions.id IS NOT NULL
          AND auth_sessions.revoked_at IS NULL
          AND auth_sessions.expires_at > now()
        ) AS session_active,
        (
          auth_sessions.reauthenticated_at <= now()
          AND auth_sessions.reauthenticated_at >= now() - interval '10 minutes'
        ) AS reauth_fresh,
        (
          auth_sessions.mfa_authenticated_at <= now()
          AND auth_sessions.mfa_authenticated_at >= now() - interval '10 minutes'
        ) AS mfa_fresh
      FROM operations
      JOIN environments ON environments.id = operations.environment_id
      JOIN users ON users.id = operations.requested_by_user_id
      LEFT JOIN auth_sessions
        ON auth_sessions.id = operations.requested_by_session_id
        AND auth_sessions.user_id = operations.requested_by_user_id
      WHERE operations.id = ${command.operationId}
      FOR UPDATE OF operations, environments
    `;
    const row = rows[0];
    if (!row) throw new MutationGuardError("INVALID_OPERATION");
    if (
      row.operation_status === "queued" &&
      (row.user_role !== "admin" ||
        row.user_status !== "active" ||
        !row.session_active)
    ) {
      throw new MutationGuardError("FORBIDDEN");
    }
    // The first guarded step revalidates the account, session, password and
    // MFA proof. After that, the durable operation must finish reconciliation
    // even if its interactive session expires or is revoked.
    if (row.operation_status === "queued" && !row.reauth_fresh) {
      throw new MutationGuardError("STALE_REAUTH");
    }
    if (
      row.operation_status === "queued" &&
      process.env.VERCEL_ENV === "production" &&
      row.has_verified_factor &&
      !row.mfa_fresh
    ) {
      throw new MutationGuardError("STALE_REAUTH");
    }
    if (!["queued", "running"].includes(row.operation_status)) {
      throw new MutationGuardError("INVALID_OPERATION");
    }

    const expectedOperation =
      command.action === "create"
        ? "create_environment"
        : command.action === "install"
          ? "install_environment"
          : "delete_environment";
    const expectedEnvironment =
      command.action === "create"
        ? ["creating"]
        : command.action === "install"
          ? ["active", "degraded"]
          : ["deleting"];
    if (
      row.operation_kind !== expectedOperation ||
      !expectedEnvironment.includes(row.environment_status)
    ) {
      throw new MutationGuardError("INVALID_STATE");
    }

    if (command.action === "create") {
      const live = await transaction<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM environments
        WHERE status IN ('creating', 'active', 'degraded', 'deleting', 'cleanup_required')
      `;
      if (live[0]?.count !== 1) {
        throw new MutationGuardError("ACTIVE_ENVIRONMENT_LIMIT");
      }
    } else if (
      row.input_snapshot.confirmed !== true ||
      row.input_snapshot.confirmedName !== row.environment_name
    ) {
      throw new MutationGuardError("INVALID_STATE");
    }
    if (
      command.action === "install" &&
      !["server", "dns_record"].includes(command.resourceKind)
    ) {
      throw new MutationGuardError("INVALID_COMMAND");
    }

    const resources = await transaction<
      {
        provider_resource_id: string;
        ownership: "platform" | "external";
        lifecycle_status: string;
      }[]
    >`
      SELECT provider_resource_id, ownership, lifecycle_status
      FROM provider_resources
      WHERE environment_id = ${row.environment_id}
        AND provider IN ('fake-timeweb', 'timeweb')
        AND resource_kind = ${command.resourceKind}
      ORDER BY created_at DESC
    `;
    if (resources.some((resource) => resource.ownership !== "platform")) {
      throw new MutationGuardError("WRONG_OWNERSHIP");
    }
    const active = resources.filter(
      (resource) => resource.lifecycle_status !== "deleted",
    );
    if (active.length > 1) throw new MutationGuardError("INVALID_STATE");
    const selected = active[0] ?? resources[0];
    const value = selected
      ? {
          externalId: selected.provider_resource_id,
          kind: command.resourceKind,
          environmentId: row.environment_id,
        }
      : null;
    return {
      command,
      environmentId: row.environment_id,
      resource: !value
        ? { state: "absent" as const }
        : active[0]
          ? { state: "active" as const, value }
          : { state: "deleted" as const, value },
    };
  });
}

export async function attachWorkflowRun(
  sql: DatabaseSql,
  operationId: string,
  runId: string,
): Promise<void> {
  await sql`
    UPDATE operations
    SET workflow_run_id = COALESCE(workflow_run_id, ${runId}), updated_at = now()
    WHERE id = ${operationId}
  `;
}

export async function operationNeedsWorkflowStart(
  sql: DatabaseSql,
  operationId: string,
): Promise<boolean> {
  const rows = await sql<{ workflow_run_id: string | null }[]>`
    SELECT workflow_run_id FROM operations WHERE id = ${operationId}
  `;
  return rows[0]?.workflow_run_id == null;
}

export type WorkflowReconciliationCandidate = Readonly<{
  operationId: string;
  kind: "create_environment" | "install_environment" | "delete_environment";
  scenario: FakeScenario;
  claimToken: string;
}>;

const fakeScenarios = new Set<FakeScenario>([
  "success",
  "timeout_after_create",
  "insufficient_funds",
  "dns_failure",
  "tls_failure",
  "backup_unavailable",
  "partial_cleanup",
]);

/**
 * Claims only operations for which no durable Workflow run was ever attached,
 * or an earlier reconciliation claim expired. Terminal operations and valid
 * Workflow run IDs are never restarted by Cron.
 */
export async function claimOrphanedWorkflowOperations(
  sql: DatabaseSql,
  limit: number,
): Promise<WorkflowReconciliationCandidate[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    throw new Error("INVALID_RECONCILIATION_LIMIT");
  }

  return sql.begin(async (transaction) => {
    const rows = await transaction<
      {
        id: string;
        kind: string;
        input_snapshot: Record<string, unknown>;
      }[]
    >`
      SELECT id, kind, input_snapshot
      FROM operations
      WHERE status IN ('queued', 'running')
        AND kind IN ('create_environment', 'install_environment', 'delete_environment')
        AND input_snapshot->>'scenario' IN (
          'success',
          'timeout_after_create',
          'insufficient_funds',
          'dns_failure',
          'tls_failure',
          'backup_unavailable',
          'partial_cleanup'
        )
        AND (
          workflow_run_id IS NULL
          OR (
            workflow_run_id LIKE 'reconcile:%'
            AND updated_at < now() - interval '5 minutes'
          )
        )
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    `;
    const candidates: WorkflowReconciliationCandidate[] = [];
    for (const row of rows) {
      const scenario = row.input_snapshot.scenario;
      if (
        ![
          "create_environment",
          "install_environment",
          "delete_environment",
        ].includes(row.kind) ||
        typeof scenario !== "string" ||
        !fakeScenarios.has(scenario as FakeScenario)
      ) {
        continue;
      }
      const claimToken = `reconcile:${randomUUID()}`;
      const claimed = await transaction<{ id: string }[]>`
        UPDATE operations
        SET workflow_run_id = ${claimToken}, updated_at = now()
        WHERE id = ${row.id}
        RETURNING id
      `;
      if (!claimed[0]) continue;
      candidates.push({
        operationId: row.id,
        kind: row.kind as
          | "create_environment"
          | "install_environment"
          | "delete_environment",
        scenario: scenario as FakeScenario,
        claimToken,
      });
    }
    return candidates;
  });
}

export async function attachReconciledWorkflowRun(
  sql: DatabaseSql,
  operationId: string,
  claimToken: string,
  runId: string,
): Promise<void> {
  const attached = await sql<{ id: string }[]>`
    UPDATE operations
    SET workflow_run_id = ${runId}, updated_at = now()
    WHERE id = ${operationId}
      AND workflow_run_id = ${claimToken}
      AND status IN ('queued', 'running')
    RETURNING id
  `;
  if (!attached[0]) throw new Error("RECONCILIATION_CLAIM_LOST");
}

export async function releaseWorkflowReconciliationClaim(
  sql: DatabaseSql,
  operationId: string,
  claimToken: string,
): Promise<boolean> {
  const released = await sql<{ id: string }[]>`
    UPDATE operations
    SET workflow_run_id = NULL, updated_at = now()
    WHERE id = ${operationId}
      AND workflow_run_id = ${claimToken}
      AND status IN ('queued', 'running')
    RETURNING id
  `;
  return Boolean(released[0]);
}

export async function operationEnvironmentId(
  sql: DatabaseSql,
  operationId: string,
): Promise<string> {
  const rows = await sql<{ environment_id: string }[]>`
    SELECT environment_id FROM operations WHERE id = ${operationId}
  `;
  if (!rows[0]?.environment_id) throw new Error("OPERATION_NOT_FOUND");
  return rows[0].environment_id;
}

export async function beginStep(
  sql: DatabaseSql,
  operationId: string,
  key: string,
  order: number,
): Promise<{
  alreadyCompleted: boolean;
  claimed: boolean;
  attempts: number;
  executionToken: string | null;
}> {
  const executionToken = randomUUID();
  return sql.begin(async (transaction) => {
    await transaction`
      UPDATE operations
      SET status = 'running', started_at = COALESCE(started_at, now()),
          state_version = state_version + 1, updated_at = now()
      WHERE id = ${operationId} AND status IN ('queued', 'running')
    `;
    const rows = await transaction<
      { status: string; attempt_count: number; execution_token: string }[]
    >`
      INSERT INTO operation_steps (
        id, operation_id, step_order, kind, logical_key, status, attempt_count,
        execution_token, lease_expires_at
      )
      VALUES (
        ${randomUUID()}, ${operationId}, ${order}, ${key}, ${key}, 'running', 1,
        ${executionToken}, now() + interval '30 minutes'
      )
      ON CONFLICT (operation_id, logical_key) DO UPDATE SET
        status = 'running',
        attempt_count = operation_steps.attempt_count + 1,
        execution_token = ${executionToken},
        lease_expires_at = now() + interval '30 minutes',
        started_at = COALESCE(operation_steps.started_at, now()),
        updated_at = now()
      WHERE operation_steps.status <> 'succeeded'
        AND (
          operation_steps.status <> 'running'
          OR operation_steps.execution_token IS NULL
          OR operation_steps.lease_expires_at <= now()
        )
      RETURNING status, attempt_count, execution_token
    `;
    if (!rows[0]) {
      const current = await transaction<
        { status: string; attempt_count: number }[]
      >`
        SELECT status, attempt_count
        FROM operation_steps
        WHERE operation_id = ${operationId} AND logical_key = ${key}
      `;
      return {
        alreadyCompleted: current[0]?.status === "succeeded",
        claimed: false,
        attempts: current[0]?.attempt_count ?? 0,
        executionToken: null,
      };
    }
    return {
      alreadyCompleted: rows[0]?.status === "succeeded",
      claimed: true,
      attempts: rows[0]?.attempt_count ?? 0,
      executionToken: rows[0]?.execution_token ?? null,
    };
  });
}

export async function finishStep(
  sql: DatabaseSql,
  operationId: string,
  key: string,
  executionToken: string,
  outcome:
    | { status: "succeeded" }
    | { status: "failed"; code: string; message: string; retryClass: RetryClass },
): Promise<void> {
  const rows = await sql<{ id: string }[]>`
    UPDATE operation_steps
    SET status = ${outcome.status},
        error_code = ${outcome.status === "failed" ? outcome.code : null},
        error_message_redacted = ${
          outcome.status === "failed" ? String(redactBounded(outcome.message)) : null
        },
        retry_class = ${outcome.status === "failed" ? outcome.retryClass : "none"},
        finished_at = CASE WHEN ${outcome.status} = 'succeeded' THEN now() ELSE finished_at END,
        execution_token = NULL,
        lease_expires_at = NULL,
        updated_at = now()
    WHERE operation_id = ${operationId}
      AND logical_key = ${key}
      AND execution_token = ${executionToken}
    RETURNING id
  `;
  if (!rows[0]) throw new StepLeaseLostError();
}

export async function completeOperationStep(
  sql: DatabaseSql,
  operationId: string,
  key: string,
  executionToken: string,
  expected: EnvironmentStatus,
  next: EnvironmentStatus,
): Promise<void> {
  if (!canTransitionEnvironment(expected, next)) {
    throw new OperationConflictError("INVALID_STATE");
  }
  await sql.begin(async (transaction) => {
    const step = await transaction<{ id: string }[]>`
      UPDATE operation_steps
      SET status = 'succeeded', error_code = NULL,
          error_message_redacted = NULL, retry_class = 'none',
          finished_at = now(), execution_token = NULL,
          lease_expires_at = NULL, updated_at = now()
      WHERE operation_id = ${operationId}
        AND logical_key = ${key}
        AND execution_token = ${executionToken}
      RETURNING id
    `;
    if (!step[0]) throw new StepLeaseLostError();

    const environment = await transaction<{ id: string }[]>`
      UPDATE environments
      SET status = ${next},
          public_url = CASE WHEN ${next} = 'deleted' THEN NULL ELSE public_url END,
          updated_at = now()
      WHERE id = (
        SELECT environment_id FROM operations WHERE id = ${operationId}
      )
        AND status = ${expected}
      RETURNING id
    `;
    if (!environment[0]) throw new OperationConflictError("INVALID_STATE");
    if (next === "deleted") {
      await transaction`
        UPDATE software_installations
        SET status = 'deleted', health_status = NULL, updated_at = now()
        WHERE environment_id = (
          SELECT environment_id FROM operations WHERE id = ${operationId}
        )
      `;
    }

    const operation = await transaction<
      { requested_by_user_id: string; kind: string; environment_id: string }[]
    >`
      UPDATE operations
      SET status = 'succeeded', error_code = NULL,
          error_message_redacted = NULL, finished_at = now(),
          state_version = state_version + 1, updated_at = now()
      WHERE id = ${operationId} AND status IN ('queued', 'running')
      RETURNING requested_by_user_id, kind, environment_id
    `;
    if (!operation[0]) throw new OperationConflictError("INVALID_STATE");

    await transaction`
      INSERT INTO audit_events (
        id, actor_user_id, action, subject_type, subject_id, outcome, metadata
      )
      VALUES (
        ${randomUUID()}, ${operation[0].requested_by_user_id},
        ${`operation.${operation[0].kind}.finished`}, 'operation', ${operationId},
        'success',
        ${transaction.json({
          environmentId: operation[0].environment_id,
          code: "OK",
        })}
      )
    `;
  });
}

export async function markInstallEnvironmentDegraded(
  sql: DatabaseSql,
  operationId: string,
): Promise<void> {
  const rows = await sql<{ id: string }[]>`
    UPDATE environments
    SET status = 'degraded', updated_at = now()
    WHERE id = (
      SELECT environment_id
      FROM operations
      WHERE id = ${operationId} AND kind = 'install_environment'
    )
      AND status IN ('active', 'degraded')
    RETURNING id
  `;
  if (!rows[0]) throw new OperationConflictError("INVALID_STATE");
}

export async function completeInstallOperationStep(
  sql: DatabaseSql,
  operationId: string,
  key: string,
  executionToken: string,
): Promise<void> {
  await sql.begin(async (transaction) => {
    const step = await transaction<{ id: string }[]>`
      UPDATE operation_steps
      SET status = 'succeeded', error_code = NULL,
          error_message_redacted = NULL, retry_class = 'none',
          finished_at = now(), execution_token = NULL,
          lease_expires_at = NULL, updated_at = now()
      WHERE operation_id = ${operationId}
        AND logical_key = ${key}
        AND execution_token = ${executionToken}
      RETURNING id
    `;
    if (!step[0]) throw new StepLeaseLostError();

    const environment = await transaction<{ id: string }[]>`
      UPDATE environments
      SET status = 'active', updated_at = now()
      WHERE id = (
        SELECT environment_id
        FROM operations
        WHERE id = ${operationId} AND kind = 'install_environment'
      )
        AND status IN ('active', 'degraded')
      RETURNING id
    `;
    if (!environment[0]) throw new OperationConflictError("INVALID_STATE");

    const operation = await transaction<
      { requested_by_user_id: string; environment_id: string }[]
    >`
      UPDATE operations
      SET status = 'succeeded', error_code = NULL,
          error_message_redacted = NULL, finished_at = now(),
          state_version = state_version + 1, updated_at = now()
      WHERE id = ${operationId}
        AND kind = 'install_environment'
        AND status IN ('queued', 'running')
      RETURNING requested_by_user_id, environment_id
    `;
    if (!operation[0]) throw new OperationConflictError("INVALID_STATE");

    await transaction`
      INSERT INTO audit_events (
        id, actor_user_id, action, subject_type, subject_id, outcome, metadata
      )
      VALUES (
        ${randomUUID()}, ${operation[0].requested_by_user_id},
        'operation.install_environment.finished', 'operation', ${operationId},
        'success',
        ${transaction.json({
          environmentId: operation[0].environment_id,
          code: "OK",
        })}
      )
    `;
  });
}

export async function transitionEnvironment(
  sql: DatabaseSql,
  operationId: string,
  expected: EnvironmentStatus,
  next: EnvironmentStatus,
): Promise<void> {
  if (!canTransitionEnvironment(expected, next)) {
    throw new OperationConflictError("INVALID_STATE");
  }
  const environmentId = await operationEnvironmentId(sql, operationId);
  const changed = await sql<{ id: string }[]>`
    UPDATE environments SET status = ${next}, updated_at = now()
    WHERE id = ${environmentId} AND status = ${expected}
    RETURNING id
  `;
  if (changed[0]) return;
  const current = await sql<{ status: EnvironmentStatus }[]>`
    SELECT status FROM environments WHERE id = ${environmentId}
  `;
  if (current[0]?.status !== next) throw new OperationConflictError("INVALID_STATE");
}

export async function finishOperation(
  sql: DatabaseSql,
  operationId: string,
  outcome: { status: "succeeded" | "failed"; code?: string; message?: string },
): Promise<void> {
  const rows = await sql<
    { requested_by_user_id: string; kind: string; environment_id: string | null }[]
  >`
    UPDATE operations
    SET status = ${outcome.status}, error_code = ${outcome.code ?? null},
        error_message_redacted = ${
          outcome.message ? String(redactBounded(outcome.message)) : null
        },
        finished_at = now(), state_version = state_version + 1, updated_at = now()
    WHERE id = ${operationId} AND status IN ('queued', 'running')
    RETURNING requested_by_user_id, kind, environment_id
  `;
  const operation = rows[0];
  if (operation) {
    await sql`
      INSERT INTO audit_events (
        id, actor_user_id, action, subject_type, subject_id, outcome, metadata
      )
      VALUES (
        ${randomUUID()}, ${operation.requested_by_user_id},
        ${`operation.${operation.kind}.finished`}, 'operation', ${operationId},
        ${outcome.status === "succeeded" ? "success" : "failure"},
        ${sql.json({
          environmentId: operation.environment_id ?? "",
          code: outcome.code ?? "OK",
        })}
      )
    `;
  }
}

export async function getOperationTimeline(
  sql: DatabaseSql,
  operationId: string,
): Promise<{ version: "v1"; operationId: string; status: string; steps: TimelineStep[] } | null> {
  const operations = await sql<{ status: string }[]>`
    SELECT status FROM operations WHERE id = ${operationId}
  `;
  if (!operations[0]) return null;
  const steps = await sql<
    {
      logical_key: string;
      status: string;
      attempt_count: number;
      error_code: string | null;
      error_message_redacted: string | null;
    }[]
  >`
    SELECT logical_key, status, attempt_count, error_code, error_message_redacted
    FROM operation_steps
    WHERE operation_id = ${operationId}
    ORDER BY step_order
  `;
  return {
    version: "v1",
    operationId,
    status: operations[0].status,
    steps: steps.map((step) => ({
      key: step.logical_key,
      status: step.status,
      attempts: step.attempt_count,
      ...(step.error_code
        ? { error: { code: step.error_code, message: step.error_message_redacted ?? "Ошибка шага." } }
        : {}),
    })),
  };
}
