import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { hashOpaqueToken } from "../auth/crypto";
import type { AuthSession } from "../auth/service";
import { createDatabaseClient, type DatabaseSql } from "../db/client";
import { runMigrations } from "../db/migrate";
import { MUTATION_COMMAND_VERSION } from "./contracts";
import {
  authorizeMutationStep,
  reserveCreateOperation,
  resumeInterruptedInstallOperation,
} from "./repository";

import { requireIntegrationDatabaseUrl } from "../../../test/integration/database";

const databaseUrl = requireIntegrationDatabaseUrl();

let sql: DatabaseSql;
let actor: AuthSession;

beforeAll(async () => {
  sql = createDatabaseClient(databaseUrl);
  await runMigrations(sql);
});

beforeEach(async () => {
  await sql`
    TRUNCATE TABLE audit_events, auth_rate_limits, auth_factors, auth_sessions,
      operation_steps, operations, provider_resources, domain_allocations,
      software_installations, environments, infrastructure_profiles,
      provider_connections, auth_bootstrap_state, users CASCADE
  `;
  const userId = randomUUID();
  actor = {
    sessionId: randomUUID(),
    userId,
    email: "mutation-admin@example.test",
    role: "admin",
    expiresAt: new Date(Date.now() + 60_000),
    reauthenticatedAt: new Date(),
    mfaAuthenticatedAt: null,
  };
  await sql`
    INSERT INTO users (id, email, password_hash, role_id)
    VALUES (${userId}, ${actor.email}, 'not-used', 'admin')
  `;
  await sql`
    INSERT INTO auth_sessions (id, user_id, token_hash, expires_at)
    VALUES (
      ${actor.sessionId}, ${userId},
      ${hashOpaqueToken(`mutation-session-${actor.sessionId}`)},
      ${actor.expiresAt}
    )
  `;
});

afterAll(async () => {
  await sql.end();
});

async function createOperation(): Promise<string> {
  const reserved = await reserveCreateOperation(sql, actor, {
    name: "Основная среда",
    idempotencyKey: `mutation-guard-${randomUUID()}`,
    scenario: "success",
  });
  return reserved.accepted.operationId;
}

function createCommand(operationId: string) {
  return {
    version: MUTATION_COMMAND_VERSION,
    operationId,
    action: "create" as const,
    resourceKind: "server" as const,
  };
}

describe("guarded Timeweb mutation authorization", () => {
  it("re-checks fresh reauthentication immediately before a provider call", async () => {
    const operationId = await createOperation();
    await sql`
      UPDATE auth_sessions
      SET reauthenticated_at = now() - interval '11 minutes'
      WHERE id = ${actor.sessionId}
    `;

    await expect(
      authorizeMutationStep(sql, createCommand(operationId)),
    ).rejects.toMatchObject({
      code: "STALE_REAUTH",
    });
  });

  it("keeps an already-authorized durable operation running after the interactive window expires", async () => {
    const operationId = await createOperation();
    await sql`
      UPDATE operations SET status = 'running' WHERE id = ${operationId}
    `;
    await sql`
      UPDATE auth_sessions
      SET reauthenticated_at = now() - interval '11 minutes',
          revoked_at = now()
      WHERE id = ${actor.sessionId}
    `;

    await expect(
      authorizeMutationStep(sql, createCommand(operationId)),
    ).resolves.toMatchObject({
      environmentId: expect.any(String),
    });
  });

  it("resumes only a released transient install step without creating a new operation", async () => {
    const createOperationId = await createOperation();
    const environment = await sql<{ id: string }[]>`
      SELECT environment_id AS id
      FROM operations
      WHERE id = ${createOperationId}
    `;
    const environmentId = environment[0]!.id;
    await sql`
      UPDATE operations SET status = 'succeeded' WHERE id = ${createOperationId}
    `;
    await sql`
      UPDATE environments SET status = 'active' WHERE id = ${environmentId}
    `;
    const installOperationId = randomUUID();
    await sql`
      INSERT INTO operations (
        id, environment_id, kind, status, requested_by_user_id,
        requested_by_session_id, idempotency_key, input_snapshot,
        workflow_run_id
      )
      VALUES (
        ${installOperationId}, ${environmentId}, 'install_environment',
        'running', ${actor.userId}, ${actor.sessionId},
        ${`resume-install-${randomUUID()}`},
        ${sql.json({
          scenario: "success",
          confirmed: true,
          confirmedName: "Основная среда",
        })},
        'old-failed-workflow-run'
      )
    `;
    await sql`
      INSERT INTO operation_steps (
        id, operation_id, step_order, kind, logical_key, status,
        attempt_count, retry_class, updated_at
      )
      VALUES (
        ${randomUUID()}, ${installOperationId}, 40, 'provider_installing',
        'provider_installing', 'failed', 3, 'transient',
        now() - interval '3 minutes'
      )
    `;

    await expect(
      resumeInterruptedInstallOperation(sql, actor, {
        environmentId,
        confirmationName: "Основная среда",
        confirmedLoss: true,
      }),
    ).resolves.toMatchObject({
      accepted: { operationId: installOperationId },
      resumed: true,
    });
    await expect(
      sql<{ count: number; workflow_run_id: string | null }[]>`
        SELECT count(*) OVER ()::int AS count, workflow_run_id
        FROM operations
        WHERE environment_id = ${environmentId}
          AND kind = 'install_environment'
      `,
    ).resolves.toEqual([{ count: 1, workflow_run_id: null }]);
  });

  it("requires a fresh session-bound MFA proof before a production provider call", async () => {
    const previousEnvironment = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = "production";
    try {
      await sql`
        INSERT INTO auth_factors (
          id, user_id, factor_type, label, secret_ciphertext, verified_at
        )
        VALUES (
          ${randomUUID()}, ${actor.userId}, 'totp', 'Test factor',
          'encrypted-test-value', now()
        )
      `;
      const operationId = await createOperation();

      await expect(
        authorizeMutationStep(sql, createCommand(operationId)),
      ).rejects.toMatchObject({
        code: "STALE_REAUTH",
      });

      await sql`
        UPDATE auth_sessions
        SET mfa_authenticated_at = now()
        WHERE id = ${actor.sessionId}
      `;
      await expect(
        authorizeMutationStep(sql, createCommand(operationId)),
      ).resolves.toMatchObject({
        environmentId: expect.any(String),
      });
    } finally {
      if (previousEnvironment === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = previousEnvironment;
    }
  });

  it("allows password-reauthenticated production mutations before MFA enrollment", async () => {
    const previousEnvironment = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = "production";
    try {
      const operationId = await createOperation();
      await expect(
        authorizeMutationStep(sql, createCommand(operationId)),
      ).resolves.toMatchObject({
        environmentId: expect.any(String),
      });
    } finally {
      if (previousEnvironment === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = previousEnvironment;
    }
  });

  it("rejects resources not owned by the platform", async () => {
    const operationId = await createOperation();
    const environment = await sql<{ id: string }[]>`
      SELECT environment_id AS id FROM operations WHERE id = ${operationId}
    `;
    await sql`
      INSERT INTO provider_resources (
        id, environment_id, operation_id, provider, resource_kind,
        provider_resource_id, ownership, lifecycle_status
      )
      VALUES (
        ${randomUUID()}, ${environment[0]!.id}, ${operationId}, 'timeweb',
        'server', '54321', 'external', 'active'
      )
    `;

    await expect(
      authorizeMutationStep(sql, createCommand(operationId)),
    ).rejects.toMatchObject({
      code: "WRONG_OWNERSHIP",
    });
  });

  it("resolves the exact provider ID from PostgreSQL, never from a command", async () => {
    const operationId = await createOperation();
    const environment = await sql<{ id: string }[]>`
      SELECT environment_id AS id FROM operations WHERE id = ${operationId}
    `;
    await sql`
      INSERT INTO provider_resources (
        id, environment_id, operation_id, provider, resource_kind,
        provider_resource_id, ownership, lifecycle_status
      )
      VALUES (
        ${randomUUID()}, ${environment[0]!.id}, ${operationId}, 'timeweb',
        'server', '54321', 'platform', 'active'
      )
    `;

    await expect(
      authorizeMutationStep(sql, createCommand(operationId)),
    ).resolves.toMatchObject({
      environmentId: environment[0]!.id,
      resource: {
        state: "active",
        value: {
          externalId: "54321",
          environmentId: environment[0]!.id,
          kind: "server",
        },
      },
    });
  });

  it("rejects replay after the operation leaves its expected state", async () => {
    const operationId = await createOperation();
    await sql`
      UPDATE operations SET status = 'succeeded' WHERE id = ${operationId}
    `;
    await sql`
      UPDATE environments SET status = 'active'
      WHERE id = (
        SELECT environment_id FROM operations WHERE id = ${operationId}
      )
    `;

    await expect(
      authorizeMutationStep(sql, createCommand(operationId)),
    ).rejects.toMatchObject({
      code: "INVALID_OPERATION",
    });
  });

  it("rejects unknown command versions before touching provider state", async () => {
    const operationId = await createOperation();
    await expect(
      authorizeMutationStep(sql, {
        ...createCommand(operationId),
        version: "attacker-controlled-version" as typeof MUTATION_COMMAND_VERSION,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_COMMAND",
    });
    await expect(
      authorizeMutationStep(sql, {
        ...createCommand(operationId),
        url: "https://attacker.invalid",
        method: "DELETE",
        payload: { arbitrary: true },
      } as never),
    ).rejects.toMatchObject({
      code: "INVALID_COMMAND",
    });
  });
});
