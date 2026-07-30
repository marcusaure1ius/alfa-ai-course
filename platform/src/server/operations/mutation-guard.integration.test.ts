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
} from "./repository";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://platform:local-example-not-a-secret@127.0.0.1:55432/course_platform";

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

  it("requires a fresh session-bound MFA proof before a production provider call", async () => {
    const previousEnvironment = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = "production";
    try {
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
