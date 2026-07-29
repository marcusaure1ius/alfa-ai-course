import "server-only";

import { randomUUID } from "node:crypto";

import type { AuthSession } from "../auth/service";
import type { DatabaseSql } from "../db/client";
import {
  OPERATIONS_DTO_VERSION,
  type FakeScenario,
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
  constructor(public readonly code: "ACTIVE_ENVIRONMENT" | "ACTIVE_MUTATION" | "INVALID_STATE") {
    super(code);
  }
}

export async function reserveCreateOperation(
  sql: DatabaseSql,
  actor: AuthSession,
  input: { name: string; idempotencyKey: string; scenario: FakeScenario },
): Promise<{ accepted: MutationAccepted; created: boolean }> {
  const existing = await sql<{ id: string }[]>`
    SELECT id FROM operations
    WHERE requested_by_user_id = ${actor.userId}
      AND idempotency_key = ${input.idempotencyKey}
    LIMIT 1
  `;
  if (existing[0]) {
    return {
      accepted: { version: OPERATIONS_DTO_VERSION, operationId: existing[0].id },
      created: false,
    };
  }

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
          idempotency_key, input_snapshot
        )
        VALUES (
          ${operationId}, ${environmentId}, 'create_environment', 'queued',
          ${actor.userId}, ${input.idempotencyKey},
          ${transaction.json({ scenario: input.scenario })}
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
      const duplicate = await sql<{ id: string }[]>`
        SELECT id FROM operations
        WHERE requested_by_user_id = ${actor.userId}
          AND idempotency_key = ${input.idempotencyKey}
        LIMIT 1
      `;
      if (duplicate[0]) {
        return {
          accepted: { version: OPERATIONS_DTO_VERSION, operationId: duplicate[0].id },
          created: false,
        };
      }
      throw new OperationConflictError("ACTIVE_ENVIRONMENT");
    }
    throw error;
  }

  return {
    accepted: { version: OPERATIONS_DTO_VERSION, operationId },
    created: true,
  };
}

export async function reserveDeleteOperation(
  sql: DatabaseSql,
  actor: AuthSession,
  input: {
    environmentId: string;
    confirmationName: string;
    idempotencyKey: string;
    scenario: FakeScenario;
  },
): Promise<{ accepted: MutationAccepted; created: boolean }> {
  const existing = await sql<{ id: string }[]>`
    SELECT id FROM operations
    WHERE requested_by_user_id = ${actor.userId}
      AND idempotency_key = ${input.idempotencyKey}
    LIMIT 1
  `;
  if (existing[0]) {
    return {
      accepted: { version: OPERATIONS_DTO_VERSION, operationId: existing[0].id },
      created: false,
    };
  }

  const operationId = randomUUID();
  try {
    await sql.begin(async (transaction) => {
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
          idempotency_key, input_snapshot
        )
        VALUES (
          ${operationId}, ${input.environmentId}, 'delete_environment', 'queued',
          ${actor.userId}, ${input.idempotencyKey},
          ${transaction.json({
            scenario: input.scenario,
            confirmedName: input.confirmationName,
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
            confirmed: true,
          })}
        )
      `;
    });
  } catch (error) {
    throw error;
  }
  return {
    accepted: { version: OPERATIONS_DTO_VERSION, operationId },
    created: true,
  };
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
): Promise<{ alreadyCompleted: boolean; attempts: number }> {
  return sql.begin(async (transaction) => {
    await transaction`
      UPDATE operations
      SET status = 'running', started_at = COALESCE(started_at, now()),
          state_version = state_version + 1, updated_at = now()
      WHERE id = ${operationId} AND status IN ('queued', 'running')
    `;
    const rows = await transaction<{ status: string; attempt_count: number }[]>`
      INSERT INTO operation_steps (
        id, operation_id, step_order, kind, logical_key, status, attempt_count
      )
      VALUES (${randomUUID()}, ${operationId}, ${order}, ${key}, ${key}, 'running', 1)
      ON CONFLICT (operation_id, logical_key) DO UPDATE SET
        status = CASE
          WHEN operation_steps.status = 'succeeded' THEN 'succeeded'
          ELSE 'running'
        END,
        attempt_count = CASE
          WHEN operation_steps.status = 'succeeded' THEN operation_steps.attempt_count
          ELSE operation_steps.attempt_count + 1
        END,
        started_at = COALESCE(operation_steps.started_at, now()),
        updated_at = now()
      RETURNING status, attempt_count
    `;
    return {
      alreadyCompleted: rows[0]?.status === "succeeded",
      attempts: rows[0]?.attempt_count ?? 0,
    };
  });
}

export async function finishStep(
  sql: DatabaseSql,
  operationId: string,
  key: string,
  outcome:
    | { status: "succeeded" }
    | { status: "failed"; code: string; message: string; retryClass: RetryClass },
): Promise<void> {
  await sql`
    UPDATE operation_steps
    SET status = ${outcome.status},
        error_code = ${outcome.status === "failed" ? outcome.code : null},
        error_message_redacted = ${
          outcome.status === "failed" ? String(redactBounded(outcome.message)) : null
        },
        retry_class = ${outcome.status === "failed" ? outcome.retryClass : "none"},
        finished_at = CASE WHEN ${outcome.status} = 'succeeded' THEN now() ELSE finished_at END,
        updated_at = now()
    WHERE operation_id = ${operationId} AND logical_key = ${key}
  `;
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
