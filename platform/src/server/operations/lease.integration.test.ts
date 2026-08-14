import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AuthSession } from "../auth/service";
import { hashOpaqueToken } from "../auth/crypto";
import { createDatabaseClient, type DatabaseSql } from "../db/client";
import { runMigrations } from "../db/migrate";
import {
  beginStep,
  finishStep,
  reserveCreateOperation,
  StepLeaseLostError,
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
    TRUNCATE TABLE audit_events, operation_steps, operations,
      provider_resources, domain_allocations, software_installations,
      environments, auth_sessions, auth_factors, users CASCADE
  `;
  const userId = randomUUID();
  await sql`
    INSERT INTO users (id, email, password_hash, role_id)
    VALUES (${userId}, 'lease-admin@example.test', 'not-used', 'admin')
  `;
  actor = {
    sessionId: randomUUID(),
    userId,
    email: "lease-admin@example.test",
    role: "admin",
    expiresAt: new Date(Date.now() + 60_000),
    reauthenticatedAt: new Date(),
    mfaAuthenticatedAt: null,
  };
  await sql`
    INSERT INTO auth_sessions (id, user_id, token_hash, expires_at)
    VALUES (
      ${actor.sessionId}, ${actor.userId},
      ${hashOpaqueToken(`lease-session-${actor.sessionId}`)}, ${actor.expiresAt}
    )
  `;
});

afterAll(async () => {
  await sql.end();
});

describe("operation step lease fence", () => {
  it("prevents a stale worker from changing state after reclaim", async () => {
    const reserved = await reserveCreateOperation(sql, actor, {
      name: "Основная среда",
      idempotencyKey: "stale-worker-fence-01",
      scenario: "success",
    });
    const operationId = reserved.accepted.operationId;
    const stale = await beginStep(sql, operationId, "configure_dns", 30);
    expect(stale.claimed).toBe(true);
    await sql`
      UPDATE operation_steps
      SET lease_expires_at = now() - interval '1 second'
      WHERE operation_id = ${operationId} AND logical_key = 'configure_dns'
    `;
    const winner = await beginStep(sql, operationId, "configure_dns", 30);
    expect(winner.claimed).toBe(true);
    await finishStep(
      sql,
      operationId,
      "configure_dns",
      winner.executionToken!,
      { status: "succeeded" },
    );

    await expect(
      finishStep(
        sql,
        operationId,
        "configure_dns",
        stale.executionToken!,
        {
          status: "failed",
          code: "DNS_FAILED",
          message: "stale failure",
          retryClass: "permanent",
        },
      ),
    ).rejects.toBeInstanceOf(StepLeaseLostError);

    const state = await sql<
      { operation_status: string; environment_status: string; step_status: string }[]
    >`
      SELECT operations.status AS operation_status,
        environments.status AS environment_status,
        operation_steps.status AS step_status
      FROM operations
      JOIN environments ON environments.id = operations.environment_id
      JOIN operation_steps ON operation_steps.operation_id = operations.id
      WHERE operations.id = ${operationId}
        AND operation_steps.logical_key = 'configure_dns'
    `;
    expect(state[0]).toEqual({
      operation_status: "running",
      environment_status: "creating",
      step_status: "succeeded",
    });
  });
});
