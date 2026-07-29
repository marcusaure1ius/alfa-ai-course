import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { GET as adminPage } from "@/app/admin/route";
import { GET as adminApi } from "@/app/api/admin/access-check/route";
import { GET as csrfEndpoint } from "@/app/api/auth/csrf/route";
import { POST as loginEndpoint } from "@/app/api/auth/login/route";
import { POST as logoutEndpoint } from "@/app/api/auth/logout/route";
import { SESSION_COOKIE_NAME } from "./config";
import { hashOpaqueToken } from "./crypto";
import {
  blockUser,
  bootstrapAdmin,
  changeUserRole,
  createUser,
  getSessionByToken,
  loginWithPassword,
} from "./service";
import { getDatabase, type DatabaseSql } from "../db/client";
import { runMigrations } from "../db/migrate";
import {
  getOperationTimeline,
  OperationConflictError,
  reserveCreateOperation,
  reserveDeleteOperation,
} from "../operations/repository";
import { createEnvironmentWorkflow } from "@/workflows/infrastructure/create";
import { deleteEnvironmentWorkflow } from "@/workflows/infrastructure/delete";
import {
  createServerStep,
  reserveIpStep,
} from "@/workflows/infrastructure/steps";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://platform:local-example-not-a-secret@127.0.0.1:55432/course_platform";

process.env.DATABASE_URL = databaseUrl;
process.env.AUTH_SECRET = "integration-example-not-a-secret-32-characters";
process.env.APP_ORIGIN = "http://localhost:3000";
process.env.VERCEL_ENV = "development";

let sql: DatabaseSql;

beforeAll(async () => {
  sql = getDatabase();
  await runMigrations(sql);
});

beforeEach(async () => {
  await sql`
    TRUNCATE TABLE
      audit_events,
      auth_rate_limits,
      auth_factors,
      auth_sessions,
      operation_steps,
      operations,
      provider_resources,
      domain_allocations,
      software_installations,
      environments,
      infrastructure_profiles,
      provider_connections,
      auth_bootstrap_state,
      users
    CASCADE
  `;
  await sql`INSERT INTO auth_bootstrap_state (singleton) VALUES (true)`;
});

afterAll(async () => {
  await sql.end();
});

async function provisionUsers() {
  const admin = await bootstrapAdmin(sql, {
    email: "admin@example.test",
    password: "correct horse battery staple",
  });
  const adminLogin = await loginWithPassword(sql, {
    email: admin.email,
    password: "correct horse battery staple",
  });
  if (!adminLogin.ok) {
    throw new Error("Admin login failed in fixture.");
  }
  const studentId = await createUser(sql, adminLogin.session, {
    email: "student@example.test",
    password: "another correct horse battery staple",
  });
  const studentLogin = await loginWithPassword(sql, {
    email: "student@example.test",
    password: "another correct horse battery staple",
  });
  if (!studentLogin.ok) {
    throw new Error("Student login failed in fixture.");
  }
  return { admin, adminLogin, studentId, studentLogin };
}

describe("database-backed authentication", () => {
  it("applies migrations idempotently and closes bootstrap after the first admin", async () => {
    const migrationResult = await runMigrations(sql);
    expect(migrationResult.alreadyApplied).toContain("0001_identity_and_control_plane.sql");

    const admin = await bootstrapAdmin(sql, {
      email: "Admin@Example.Test",
      password: "correct horse battery staple",
    });
    expect(admin.email).toBe("admin@example.test");
    await expect(
      bootstrapAdmin(sql, {
        email: "other@example.test",
        password: "another correct horse battery staple",
      }),
    ).rejects.toThrow("уже закрыт");

    const rows = await sql<{ password_hash: string }[]>`
      SELECT password_hash FROM users WHERE id = ${admin.id}
    `;
    expect(rows[0]?.password_hash).toMatch(/^\$argon2id\$/);
  });

  it("stores only a token hash and revokes a session on logout", async () => {
    await bootstrapAdmin(sql, {
      email: "admin@example.test",
      password: "correct horse battery staple",
    });
    const csrfResponse = csrfEndpoint();
    const csrfBody = (await csrfResponse.json()) as { csrfToken: string };
    const csrfCookiePair = csrfResponse.headers.get("set-cookie")?.split(";")[0];
    expect(csrfCookiePair).toBeTruthy();

    const loginResponse = await loginEndpoint(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          cookie: csrfCookiePair ?? "",
          origin: "http://localhost:3000",
          "content-type": "application/json",
          "x-csrf-token": csrfBody.csrfToken,
        },
        body: JSON.stringify({
          email: "admin@example.test",
          password: "correct horse battery staple",
        }),
      }),
    );
    expect(loginResponse.status).toBe(200);
    const sessionCookiePair = loginResponse.headers.get("set-cookie")?.split(";")[0];
    const token = sessionCookiePair?.split("=")[1];
    expect(token).toBeTruthy();

    const stored = await sql<{ token_hash: string }[]>`
      SELECT token_hash FROM auth_sessions
    `;
    expect(stored[0]?.token_hash).toBe(hashOpaqueToken(token ?? ""));
    expect(stored[0]?.token_hash).not.toBe(token);

    const logoutResponse = await logoutEndpoint(
      new Request("http://localhost:3000/api/auth/logout", {
        method: "POST",
        headers: {
          cookie: `${csrfCookiePair}; ${SESSION_COOKIE_NAME}=${token}`,
          origin: "http://localhost:3000",
          "x-csrf-token": csrfBody.csrfToken,
        },
      }),
    );
    expect(logoutResponse.status).toBe(200);
    expect(await getSessionByToken(sql, token ?? null)).toBeNull();
  });

  it("denies student privilege escalation and direct admin requests with 403", async () => {
    const { studentId, studentLogin } = await provisionUsers();
    await expect(
      changeUserRole(sql, studentLogin.session, studentId, "admin"),
    ).rejects.toThrow("FORBIDDEN");

    const roleRows = await sql<{ role_id: string }[]>`
      SELECT role_id FROM users WHERE id = ${studentId}
    `;
    expect(roleRows[0]?.role_id).toBe("student");

    for (const handler of [adminPage, adminApi]) {
      const response = await handler(
        new Request("http://localhost:3000/admin", {
          headers: {
            cookie: `${SESSION_COOKIE_NAME}=${studentLogin.token}`,
          },
        }),
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "Доступ запрещён." });
    }
  });

  it("revokes every active session when an admin blocks a user", async () => {
    const { adminLogin, studentId, studentLogin } = await provisionUsers();
    await blockUser(sql, adminLogin.session, studentId);

    expect(await getSessionByToken(sql, studentLogin.token)).toBeNull();
    expect(
      await loginWithPassword(sql, {
        email: "student@example.test",
        password: "another correct horse battery staple",
      }),
    ).toEqual({ ok: false, reason: "invalid_credentials" });
    const rows = await sql<{ status: string; active_sessions: number }[]>`
      SELECT
        users.status,
        count(auth_sessions.id) FILTER (WHERE auth_sessions.revoked_at IS NULL)::int
          AS active_sessions
      FROM users
      LEFT JOIN auth_sessions ON auth_sessions.user_id = users.id
      WHERE users.id = ${studentId}
      GROUP BY users.status
    `;
    expect(rows[0]).toMatchObject({ status: "blocked", active_sessions: 0 });

    const auditRows = await sql<
      {
        actor_user_id: string | null;
        subject_id: string;
        metadata: { reason: string };
      }[]
    >`
      SELECT actor_user_id, subject_id, metadata
      FROM audit_events
      WHERE action = 'auth.login.failed'
      ORDER BY occurred_at DESC
      LIMIT 1
    `;
    expect(auditRows[0]).toMatchObject({
      actor_user_id: null,
      subject_id: studentId,
      metadata: { reason: "blocked" },
    });
  });

  it("rate limits repeated invalid logins without storing supplied passwords", async () => {
    const admin = await bootstrapAdmin(sql, {
      email: "admin@example.test",
      password: "correct horse battery staple",
    });
    let result;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      result = await loginWithPassword(
        sql,
        { email: "admin@example.test", password: "definitely wrong password" },
        { ipAddress: "192.0.2.10" },
      );
    }
    expect(result).toEqual({ ok: false, reason: "rate_limited" });

    const auditRows = await sql<{ metadata: Record<string, unknown> }[]>`
      SELECT metadata FROM audit_events
    `;
    expect(JSON.stringify(auditRows)).not.toContain("definitely wrong password");

    const failedLoginRows = await sql<
      { actor_user_id: string | null; subject_id: string }[]
    >`
      SELECT actor_user_id, subject_id
      FROM audit_events
      WHERE action = 'auth.login.failed'
      ORDER BY occurred_at ASC
      LIMIT 1
    `;
    expect(failedLoginRows[0]).toEqual({
      actor_user_id: null,
      subject_id: admin.id,
    });
  });

  it("keeps audit events append-only", async () => {
    await bootstrapAdmin(sql, {
      email: "admin@example.test",
      password: "correct horse battery staple",
    });
    await expect(
      sql`UPDATE audit_events SET outcome = 'failure'`,
    ).rejects.toThrow("append-only");
    expect(
      await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM audit_events
      `,
    ).toEqual([{ count: 1 }]);
  });
});

describe("durable fake infrastructure lifecycle", () => {
  it("deduplicates actor/key and blocks a second active environment", async () => {
    const { adminLogin } = await provisionUsers();
    const first = await reserveCreateOperation(sql, adminLogin.session, {
      name: "Основная среда",
      idempotencyKey: "create-same-key-0001",
      scenario: "success",
    });
    const duplicate = await reserveCreateOperation(sql, adminLogin.session, {
      name: "Основная среда",
      idempotencyKey: "create-same-key-0001",
      scenario: "success",
    });
    expect(duplicate.accepted.operationId).toBe(first.accepted.operationId);
    expect(duplicate.created).toBe(false);
    await expect(
      reserveCreateOperation(sql, adminLogin.session, {
        name: "Вторая среда",
        idempotencyKey: "create-other-key-0002",
        scenario: "success",
      }),
    ).rejects.toBeInstanceOf(OperationConflictError);
  });

  it("runs the successful fake create state machine and exposes a safe timeline", async () => {
    const { adminLogin } = await provisionUsers();
    const reserved = await reserveCreateOperation(sql, adminLogin.session, {
      name: "Основная среда",
      idempotencyKey: "create-success-key-01",
      scenario: "success",
    });
    await expect(
      createEnvironmentWorkflow({
        operationId: reserved.accepted.operationId,
        scenario: "success",
      }),
    ).resolves.toEqual({ status: "active" });

    const resources = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM provider_resources
      WHERE lifecycle_status = 'active'
    `;
    expect(resources[0]?.count).toBe(3);
    const timeline = await getOperationTimeline(sql, reserved.accepted.operationId);
    expect(timeline?.status).toBe("succeeded");
    expect(timeline?.steps.map((step) => step.key)).toEqual([
      "reserve_public_ip",
      "create_server",
      "configure_dns",
      "verify_tls",
      "complete",
    ]);
    expect(JSON.stringify(timeline)).not.toMatch(/token|private_key|raw_response/i);
  });

  it("reconciles timeout-after-create without creating a second server", async () => {
    const { adminLogin } = await provisionUsers();
    const reserved = await reserveCreateOperation(sql, adminLogin.session, {
      name: "Основная среда",
      idempotencyKey: "create-timeout-key-01",
      scenario: "timeout_after_create",
    });
    const command = {
      operationId: reserved.accepted.operationId,
      scenario: "timeout_after_create" as const,
    };
    await reserveIpStep(command);
    await expect(createServerStep(command)).rejects.toThrow("reconciliation");
    await expect(createServerStep(command)).resolves.toBeUndefined();
    const rows = await sql<{ count: number; attempts: number }[]>`
      SELECT
        count(provider_resources.id)::int AS count,
        max(operation_steps.attempt_count)::int AS attempts
      FROM provider_resources
      JOIN operation_steps ON operation_steps.operation_id = ${command.operationId}
        AND operation_steps.logical_key = 'create_server'
      WHERE provider_resources.environment_id = (
        SELECT environment_id FROM operations WHERE id = ${command.operationId}
      )
        AND provider_resources.resource_kind = 'server'
      GROUP BY operation_steps.operation_id
    `;
    expect(rows[0]).toEqual({ count: 1, attempts: 2 });
  });

  it.each(["dns_failure", "tls_failure"] as const)(
    "keeps the server and marks the environment degraded on %s",
    async (scenario) => {
      const { adminLogin } = await provisionUsers();
      const reserved = await reserveCreateOperation(sql, adminLogin.session, {
        name: "Основная среда",
        idempotencyKey: `create-${scenario}-key`,
        scenario,
      });
      await expect(
        createEnvironmentWorkflow({
          operationId: reserved.accepted.operationId,
          scenario,
        }),
      ).resolves.toEqual({ status: "degraded" });
      const rows = await sql<{ status: string; servers: number }[]>`
        SELECT environments.status,
          count(provider_resources.id) FILTER (
            WHERE provider_resources.resource_kind = 'server'
              AND provider_resources.lifecycle_status = 'active'
          )::int AS servers
        FROM environments
        LEFT JOIN provider_resources ON provider_resources.environment_id = environments.id
        WHERE environments.id = (
          SELECT environment_id FROM operations WHERE id = ${reserved.accepted.operationId}
        )
        GROUP BY environments.status
      `;
      expect(rows[0]).toEqual({ status: "degraded", servers: 1 });
    },
  );

  it("classifies insufficient funds as permanent without creating resources", async () => {
    const { adminLogin } = await provisionUsers();
    const reserved = await reserveCreateOperation(sql, adminLogin.session, {
      name: "Основная среда",
      idempotencyKey: "create-no-funds-key-01",
      scenario: "insufficient_funds",
    });
    await expect(
      createEnvironmentWorkflow({
        operationId: reserved.accepted.operationId,
        scenario: "insufficient_funds",
      }),
    ).rejects.toThrow("Недостаточно средств");
    const rows = await sql<
      { operation_status: string; environment_status: string; resources: number }[]
    >`
      SELECT operations.status AS operation_status,
        environments.status AS environment_status,
        count(provider_resources.id)::int AS resources
      FROM operations
      JOIN environments ON environments.id = operations.environment_id
      LEFT JOIN provider_resources
        ON provider_resources.environment_id = environments.id
      WHERE operations.id = ${reserved.accepted.operationId}
      GROUP BY operations.status, environments.status
    `;
    expect(rows[0]).toEqual({
      operation_status: "failed",
      environment_status: "degraded",
      resources: 0,
    });
  });

  it("preserves a billable IP as cleanup_required during partial delete", async () => {
    const { adminLogin } = await provisionUsers();
    const create = await reserveCreateOperation(sql, adminLogin.session, {
      name: "Основная среда",
      idempotencyKey: "create-before-delete-01",
      scenario: "success",
    });
    await createEnvironmentWorkflow({
      operationId: create.accepted.operationId,
      scenario: "success",
    });
    const environment = await sql<{ id: string }[]>`
      SELECT environment_id AS id FROM operations WHERE id = ${create.accepted.operationId}
    `;
    const deletion = await reserveDeleteOperation(sql, adminLogin.session, {
      environmentId: environment[0]!.id,
      confirmationName: "Основная среда",
      idempotencyKey: "delete-partial-key-01",
      scenario: "partial_cleanup",
    });
    await expect(
      deleteEnvironmentWorkflow({
        operationId: deletion.accepted.operationId,
        scenario: "partial_cleanup",
      }),
    ).resolves.toEqual({ status: "cleanup_required" });
    const rows = await sql<{ status: string; active_ips: number }[]>`
      SELECT environments.status,
        count(provider_resources.id) FILTER (
          WHERE provider_resources.resource_kind = 'public_ip'
            AND provider_resources.lifecycle_status = 'active'
        )::int AS active_ips
      FROM environments
      LEFT JOIN provider_resources ON provider_resources.environment_id = environments.id
      WHERE environments.id = ${environment[0]!.id}
      GROUP BY environments.status
    `;
    expect(rows[0]).toEqual({ status: "cleanup_required", active_ips: 1 });
  });
});
