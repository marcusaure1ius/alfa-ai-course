import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getRun, start } from "@workflow/core/runtime";

import { POST as createEndpoint } from "@/app/api/admin/infrastructure/environments/route";
import type { AuthSession } from "@/server/auth/service";
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/server/auth/config";
import { hashOpaqueToken } from "@/server/auth/crypto";
import { issueCsrfToken } from "@/server/auth/csrf";
import { createDatabaseClient, type DatabaseSql } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";
import { reserveCreateOperation } from "@/server/operations/repository";
import { createEnvironmentWorkflow } from "./create";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://platform:local-example-not-a-secret@127.0.0.1:55432/course_platform_t0052";
process.env.DATABASE_URL = databaseUrl;
process.env.AUTH_SECRET = "workflow-example-not-a-secret-32-characters";
process.env.APP_ORIGIN = "http://localhost:3000";
process.env.VERCEL_ENV = "development";

let sql: DatabaseSql;
let actor: AuthSession;
let sessionToken: string;

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
  await sql`
    INSERT INTO users (id, email, password_hash, role_id)
    VALUES (${userId}, 'workflow-admin@example.test', 'not-used-by-this-test', 'admin')
  `;
  actor = {
    sessionId: randomUUID(),
    userId,
    email: "workflow-admin@example.test",
    role: "admin",
    expiresAt: new Date(Date.now() + 60_000),
    reauthenticatedAt: new Date(),
  };
  sessionToken = `workflow-session-${randomUUID()}`;
  await sql`
    INSERT INTO auth_sessions (id, user_id, token_hash, expires_at)
    VALUES (
      ${actor.sessionId}, ${userId}, ${hashOpaqueToken(sessionToken)},
      ${actor.expiresAt}
    )
  `;
});

afterAll(async () => {
  await sql.end();
});

describe("Vercel Workflow orchestration", () => {
  it("returns 202 and one operation for repeated actor/idempotency requests", async () => {
    const csrf = issueCsrfToken();
    const request = () =>
      new Request("http://localhost:3000/api/admin/infrastructure/environments", {
        method: "POST",
        headers: {
          cookie: `${CSRF_COOKIE_NAME}=${csrf.nonce}; ${SESSION_COOKIE_NAME}=${sessionToken}`,
          origin: "http://localhost:3000",
          "content-type": "application/json",
          "x-csrf-token": csrf.token,
        },
        body: JSON.stringify({
          name: "API среда",
          idempotencyKey: "api-create-idempotency-01",
          simulation: "success",
        }),
      });
    const first = await createEndpoint(request());
    const second = await createEndpoint(request());
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    const firstBody = (await first.json()) as { operationId: string };
    const secondBody = (await second.json()) as { operationId: string };
    expect(secondBody.operationId).toBe(firstBody.operationId);

    const runs = await sql<{ workflow_run_id: string }[]>`
      SELECT workflow_run_id FROM operations WHERE id = ${firstBody.operationId}
    `;
    await expect(getRun(runs[0]!.workflow_run_id).returnValue).resolves.toEqual({
      status: "active",
    });
    expect(
      await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM operations
        WHERE requested_by_user_id = ${actor.userId}
          AND idempotency_key = 'api-create-idempotency-01'
      `,
    ).toEqual([{ count: 1 }]);
  });

  it("retries an unknown create outcome and reconciles to one server", async () => {
    const reserved = await reserveCreateOperation(sql, actor, {
      name: "Workflow среда",
      idempotencyKey: "workflow-timeout-key-01",
      scenario: "timeout_after_create",
    });
    const run = await start(createEnvironmentWorkflow, [
      {
        operationId: reserved.accepted.operationId,
        scenario: "timeout_after_create",
      },
    ]);
    await expect(run.returnValue).resolves.toEqual({ status: "active" });

    const rows = await sql<{ servers: number; attempts: number }[]>`
      SELECT
        count(DISTINCT provider_resources.id) FILTER (
          WHERE provider_resources.resource_kind = 'server'
        )::int AS servers,
        max(operation_steps.attempt_count) FILTER (
          WHERE operation_steps.logical_key = 'create_server'
        )::int AS attempts
      FROM operations
      LEFT JOIN provider_resources
        ON provider_resources.environment_id = operations.environment_id
      LEFT JOIN operation_steps ON operation_steps.operation_id = operations.id
      WHERE operations.id = ${reserved.accepted.operationId}
      GROUP BY operations.id
    `;
    expect(rows[0]).toEqual({ servers: 1, attempts: 2 });
  });
});
