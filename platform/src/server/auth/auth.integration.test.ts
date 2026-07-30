import { createHash } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET as adminApi } from "@/app/api/admin/access-check/route";
import { POST as timewebConnectionEndpoint } from "@/app/api/admin/timeweb/connection-test/route";
import { GET as csrfEndpoint } from "@/app/api/auth/csrf/route";
import { POST as loginEndpoint } from "@/app/api/auth/login/route";
import { POST as logoutEndpoint } from "@/app/api/auth/logout/route";
import { SESSION_COOKIE_NAME } from "./config";
import { hashOpaqueToken } from "./crypto";
import { createTotpCode } from "./mfa";
import {
  blockUser,
  bootstrapAdmin,
  changeUserRole,
  createUser,
  enrollAdminTotp,
  getSessionByToken,
  loginWithPassword,
} from "./service";
import {
  createDatabaseClient,
  getDatabase,
  type DatabaseSql,
} from "../db/client";
import { runMigrations } from "../db/migrate";
import {
  beginStep,
  finishOperation,
  finishStep,
  getOperationTimeline,
  operationEnvironmentId,
  OperationConflictError,
  reserveCreateOperation,
  reserveDeleteOperation,
  transitionEnvironment,
} from "../operations/repository";
import { FakeTimewebAdapter } from "../providers/timeweb/fake";
import {
  createInfrastructureLifecycleAdapter,
  markProviderMutationStarted,
  providerMutationStarted,
} from "../providers/timeweb/lifecycle";
import { createEnvironmentWorkflow } from "@/workflows/infrastructure/create";
import { deleteEnvironmentWorkflow } from "@/workflows/infrastructure/delete";
import { proxy as adminPagePolicy } from "@/proxy";
import {
  createServerStep,
  reconcileServerStep,
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

  it("requires and verifies an encrypted TOTP challenge for production admin", async () => {
    const previousEnvironment = process.env.VERCEL_ENV;
    const previousKey = process.env.AUTH_FACTOR_ENCRYPTION_KEY;
    const factorEncryptionKey = Buffer.alloc(32, 11).toString("base64url");
    const totpSecret = "JBSWY3DPEHPK3PXP";
    process.env.VERCEL_ENV = "production";
    process.env.AUTH_FACTOR_ENCRYPTION_KEY = factorEncryptionKey;
    try {
      await bootstrapAdmin(sql, {
        email: "admin@example.test",
        password: "correct horse battery staple",
        totpSecret,
        totpCode: createTotpCode(totpSecret),
        factorEncryptionKey,
      });
      await expect(
        loginWithPassword(sql, {
          email: "admin@example.test",
          password: "correct horse battery staple",
        }),
      ).resolves.toEqual({ ok: false, reason: "mfa_required" });
      const accepted = await loginWithPassword(sql, {
        email: "admin@example.test",
        password: "correct horse battery staple",
        mfaCode: createTotpCode(totpSecret),
      });
      expect(accepted.ok).toBe(true);
      if (!accepted.ok) {
        throw new Error("Production TOTP login was rejected.");
      }
      expect(accepted.session.mfaAuthenticatedAt).toBeInstanceOf(Date);
      const factors = await sql<{ secret_ciphertext: string }[]>`
        SELECT secret_ciphertext FROM auth_factors
      `;
      expect(factors[0]?.secret_ciphertext).not.toContain(totpSecret);
    } finally {
      if (previousEnvironment === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = previousEnvironment;
      if (previousKey === undefined) delete process.env.AUTH_FACTOR_ENCRYPTION_KEY;
      else process.env.AUTH_FACTOR_ENCRYPTION_KEY = previousKey;
    }
  });

  it("verifies the first TOTP code before enrolling an admin factor", async () => {
    const factorEncryptionKey = Buffer.alloc(32, 12).toString("base64url");
    const totpSecret = "JBSWY3DPEHPK3PXP";
    await bootstrapAdmin(sql, {
      email: "admin@example.test",
      password: "correct horse battery staple",
    });

    await expect(
      enrollAdminTotp(sql, {
        email: "admin@example.test",
        totpSecret,
        totpCode: "000000",
        factorEncryptionKey,
      }),
    ).rejects.toThrow("Первый TOTP code не прошёл проверку.");
    expect(
      await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM auth_factors
      `,
    ).toEqual([{ count: 0 }]);

    await expect(
      enrollAdminTotp(sql, {
        email: "admin@example.test",
        totpSecret,
        totpCode: createTotpCode(totpSecret),
        factorEncryptionKey,
      }),
    ).resolves.toBeUndefined();
    expect(
      await sql<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM auth_factors
        WHERE verified_at IS NOT NULL
      `,
    ).toEqual([{ count: 1 }]);
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

    const responses = [
      await adminPagePolicy(
        new NextRequest("http://localhost:3000/admin", {
          headers: {
            cookie: `${SESSION_COOKIE_NAME}=${studentLogin.token}`,
          },
        }),
      ),
      await adminApi(
        new Request("http://localhost:3000/api/admin/access-check", {
          headers: {
            cookie: `${SESSION_COOKIE_NAME}=${studentLogin.token}`,
          },
        }),
      ),
    ];
    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "Доступ запрещён." });
    }
  });

  it("keeps the Timeweb connection test admin-only and fake outside production", async () => {
    const { adminLogin, studentLogin } = await provisionUsers();
    const csrfResponse = csrfEndpoint();
    const csrfBody = (await csrfResponse.json()) as { csrfToken: string };
    const csrfCookiePair = csrfResponse.headers.get("set-cookie")?.split(";")[0] ?? "";

    const requestFor = (token: string) =>
      new Request("http://localhost:3000/api/admin/timeweb/connection-test", {
        method: "POST",
        headers: {
          cookie: `${csrfCookiePair}; ${SESSION_COOKIE_NAME}=${token}`,
          origin: "http://localhost:3000",
          "x-csrf-token": csrfBody.csrfToken,
        },
      });

    const denied = await timewebConnectionEndpoint(requestFor(studentLogin.token));
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: "Доступ запрещён." });

    const accepted = await timewebConnectionEndpoint(requestFor(adminLogin.token));
    expect(accepted.status).toBe(200);
    const body = await accepted.json();
    expect(body).toMatchObject({
      version: "timeweb-read-v2",
      ok: true,
      mode: "fake",
      status: "fake",
    });
    expect(JSON.stringify(body)).not.toMatch(/authorization|credential|root_pass/i);
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
        name: "Другая payload",
        idempotencyKey: "create-same-key-0001",
        scenario: "timeout_after_create",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
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

    await expect(
      reserveDeleteOperation(sql, adminLogin.session, {
        environmentId: await operationEnvironmentId(
          sql,
          reserved.accepted.operationId,
        ),
        confirmationName: "Основная среда",
        confirmedLoss: true,
        idempotencyKey: "create-success-key-01",
        scenario: "success",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });

    const resources = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM provider_resources
      WHERE lifecycle_status = 'active'
    `;
    expect(resources[0]?.count).toBe(3);
    const timeline = await getOperationTimeline(sql, reserved.accepted.operationId);
    expect(timeline?.status).toBe("succeeded");
    expect(timeline?.steps.map((step) => step.key)).toEqual([
      "reserve_public_ip",
      "configure_dns",
      "create_server",
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

  it("allows only one concurrent worker to invoke the create provider step", async () => {
    const { adminLogin } = await provisionUsers();
    const reserved = await reserveCreateOperation(sql, adminLogin.session, {
      name: "Основная среда",
      idempotencyKey: "concurrent-step-key-01",
      scenario: "success",
    });
    const command = {
      operationId: reserved.accepted.operationId,
      scenario: "success" as const,
    };
    await reserveIpStep(command);
    const secondSql = createDatabaseClient(databaseUrl);
    try {
      const claims = await Promise.all([
        beginStep(sql, command.operationId, "create_server", 20),
        beginStep(secondSql, command.operationId, "create_server", 20),
      ]);
      expect(claims.filter((claim) => claim.claimed)).toHaveLength(1);
      expect(claims.filter((claim) => !claim.claimed)).toHaveLength(1);
      const environmentId = await operationEnvironmentId(sql, command.operationId);
      await Promise.all(
        claims.map(async (claim) => {
          if (!claim.claimed || !claim.executionToken) return;
          await new FakeTimewebAdapter(
            sql,
            command.operationId,
            environmentId,
            "success",
          ).createServer();
          await finishStep(
            sql,
            command.operationId,
            "create_server",
            claim.executionToken,
            { status: "succeeded" },
          );
        }),
      );
      const rows = await secondSql<{ calls: number; servers: number }[]>`
        SELECT
          count(DISTINCT fake_provider_events.event_key) FILTER (
            WHERE fake_provider_events.event_key LIKE 'create_server_call:%'
          )::int AS calls,
          count(DISTINCT provider_resources.id) FILTER (
            WHERE provider_resources.resource_kind = 'server'
          )::int AS servers
        FROM operations
        LEFT JOIN fake_provider_events
          ON fake_provider_events.operation_id = operations.id
        LEFT JOIN provider_resources
          ON provider_resources.environment_id = operations.environment_id
        WHERE operations.id = ${command.operationId}
        GROUP BY operations.id
      `;
      expect(rows[0]).toEqual({ calls: 1, servers: 1 });
    } finally {
      await secondSql.end();
    }
  });

  it("serializes concurrent delete replays to one actor/key result", async () => {
    const { adminLogin } = await provisionUsers();
    const create = await reserveCreateOperation(sql, adminLogin.session, {
      name: "Основная среда",
      idempotencyKey: "create-before-race-01",
      scenario: "success",
    });
    await createEnvironmentWorkflow({
      operationId: create.accepted.operationId,
      scenario: "success",
    });
    const environment = await sql<{ id: string }[]>`
      SELECT environment_id AS id FROM operations WHERE id = ${create.accepted.operationId}
    `;
    const input = {
      environmentId: environment[0]!.id,
      confirmationName: "Основная среда",
      confirmedLoss: true as const,
      idempotencyKey: "delete-concurrent-key-01",
      scenario: "success" as const,
    };
    const secondSql = createDatabaseClient(databaseUrl);
    try {
      const [first, second] = await Promise.all([
        reserveDeleteOperation(sql, adminLogin.session, input),
        reserveDeleteOperation(secondSql, adminLogin.session, input),
      ]);
      expect(first.accepted.operationId).toBe(second.accepted.operationId);
      expect([first.created, second.created].sort()).toEqual([false, true]);
    } finally {
      await secondSql.end();
    }
  });

  it.each(["dns_failure", "tls_failure"] as const)(
    "stops safely and marks the environment degraded on %s",
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
      expect(rows[0]).toEqual({
        status: "degraded",
        servers: scenario === "dns_failure" ? 0 : 1,
      });
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
      confirmedLoss: true,
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

  it("constructs a production delete adapter without a create provider plan", async () => {
    const { adminLogin } = await provisionUsers();
    const create = await reserveCreateOperation(sql, adminLogin.session, {
      name: "Production cleanup fixture",
      idempotencyKey: "production-delete-adapter-01",
      scenario: "success",
    });
    await createEnvironmentWorkflow({
      operationId: create.accepted.operationId,
      scenario: "success",
    });
    const environment = await sql<{ id: string }[]>`
      SELECT environment_id AS id
      FROM operations
      WHERE id = ${create.accepted.operationId}
    `;
    await sql`
      UPDATE provider_resources
      SET provider = 'timeweb',
          provider_resource_id = CASE
            WHEN resource_kind = 'server' THEN '54321'
            ELSE '11111111-2222-4333-8444-555555555555'
          END,
          public_metadata = CASE
            WHEN resource_kind = 'public_ip'
            THEN '{"address":"203.0.113.10","monthlyRoubles":180}'::jsonb
            ELSE '{"monthlyRoubles":700}'::jsonb
          END
      WHERE environment_id = ${environment[0]!.id}
        AND resource_kind IN ('server', 'public_ip')
    `;
    const deletion = await reserveDeleteOperation(sql, adminLogin.session, {
      environmentId: environment[0]!.id,
      confirmationName: "Production cleanup fixture",
      confirmedLoss: true,
      idempotencyKey: "production-delete-adapter-02",
      scenario: "success",
    });

    const previous = {
      VERCEL_ENV: process.env.VERCEL_ENV,
      PLATFORM_PROVIDER: process.env.PLATFORM_PROVIDER,
      TIMEWEB_API_TOKEN: process.env.TIMEWEB_API_TOKEN,
      TIMEWEB_MUTATIONS_ENABLED: process.env.TIMEWEB_MUTATIONS_ENABLED,
      TIMEWEB_CAPABILITIES_VERIFIED:
        process.env.TIMEWEB_CAPABILITIES_VERIFIED,
      TIMEWEB_SMOKE_EXCLUSIVE_ACCOUNT:
        process.env.TIMEWEB_SMOKE_EXCLUSIVE_ACCOUNT,
      TIMEWEB_SMOKE_EXCLUSIVE_DNS_HOSTNAME:
        process.env.TIMEWEB_SMOKE_EXCLUSIVE_DNS_HOSTNAME,
    };
    process.env.VERCEL_ENV = "production";
    process.env.PLATFORM_PROVIDER = "timeweb";
    process.env.TIMEWEB_API_TOKEN = "synthetic-test-token";
    process.env.TIMEWEB_MUTATIONS_ENABLED = "true";
    process.env.TIMEWEB_CAPABILITIES_VERIFIED = "true";
    process.env.TIMEWEB_SMOKE_EXCLUSIVE_ACCOUNT = "true";
    process.env.TIMEWEB_SMOKE_EXCLUSIVE_DNS_HOSTNAME = "true";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      process.env.PLATFORM_PROVIDER = "fake";
      await expect(
        createInfrastructureLifecycleAdapter({
          operationId: deletion.accepted.operationId,
          scenario: "success",
        }),
      ).rejects.toMatchObject({ code: "PROVIDER_MODE_DRIFT" });
      process.env.PLATFORM_PROVIDER = "timeweb";
      const lifecycle = await createInfrastructureLifecycleAdapter({
        operationId: deletion.accepted.operationId,
        scenario: "success",
      });
      await lifecycle.deleteOwnedResource({
        externalId: "54321",
        kind: "server",
        environmentId: environment[0]!.id,
      });
      await lifecycle.deleteOwnedResource({
        externalId: "11111111-2222-4333-8444-555555555555",
        kind: "public_ip",
        environmentId: environment[0]!.id,
      });
      expect(fetchMock).toHaveBeenCalledTimes(4);
    } finally {
      vi.unstubAllGlobals();
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("distinguishes a retryable preflight failure from an ambiguous provider mutation", async () => {
    const { adminLogin } = await provisionUsers();
    const create = await reserveCreateOperation(sql, adminLogin.session, {
      name: "t0056-marker-regression",
      idempotencyKey: "production-marker-regression-01",
      scenario: "success",
      providerPlan: {
        version: "timeweb-provisioning-v3",
        deploymentMode: "plain-vps",
        checkedAt: new Date().toISOString(),
        presetId: 101,
        operatingSystemId: 202,
        operatingSystemLabel: "ubuntu 24.04 x86_64",
        region: "ru-1",
        regionLabel: "Санкт-Петербург",
        availabilityZone: "spb-1",
        monthlyServerRoubles: 149,
        hourlyServerRoubles: 0.2,
        cpu: 1,
        ramMb: 1024,
        diskMb: 15_360,
        diskType: "ssd",
        bandwidthMbps: 100,
        backupsEnabled: false,
        backupInterval: "week",
        backupCopyCount: 1,
        publicIpv4: true,
        monthlyPublicIpRoubles: 180,
        monthlyTotalRoubles: 329,
        projectId: 303,
        sshKeyId: 404,
      },
    });
    const operationId = create.accepted.operationId;
    const first = await beginStep(sql, operationId, "create_server", 20);
    expect(first.claimed).toBe(true);
    expect(await providerMutationStarted(sql, operationId)).toBe(false);
    await finishStep(sql, operationId, "create_server", first.executionToken!, {
      status: "failed",
      code: "PROVIDER_PREFLIGHT_RETRY",
      message: "redacted preflight failure",
      retryClass: "transient",
    });

    const retry = await beginStep(sql, operationId, "create_server", 20);
    expect(retry.claimed).toBe(true);
    expect(await providerMutationStarted(sql, operationId)).toBe(false);
    await expect(
      markProviderMutationStarted(sql, operationId, first.executionToken!),
    ).rejects.toMatchObject({ code: "STEP_STATE_INVALID" });
    await markProviderMutationStarted(
      sql,
      operationId,
      retry.executionToken!,
    );
    expect(await providerMutationStarted(sql, operationId)).toBe(true);
    await finishStep(sql, operationId, "create_server", retry.executionToken!, {
      status: "failed",
      code: "TIMEOUT_AFTER_MUTATION",
      message: "redacted ambiguous outcome",
      retryClass: "unknown_outcome",
    });
    const replay = await beginStep(sql, operationId, "create_server", 20);

    const previous = {
      VERCEL_ENV: process.env.VERCEL_ENV,
      PLATFORM_PROVIDER: process.env.PLATFORM_PROVIDER,
      TIMEWEB_API_TOKEN: process.env.TIMEWEB_API_TOKEN,
      TIMEWEB_MUTATIONS_ENABLED: process.env.TIMEWEB_MUTATIONS_ENABLED,
      TIMEWEB_CAPABILITIES_VERIFIED:
        process.env.TIMEWEB_CAPABILITIES_VERIFIED,
      TIMEWEB_SMOKE_EXCLUSIVE_ACCOUNT:
        process.env.TIMEWEB_SMOKE_EXCLUSIVE_ACCOUNT,
      TIMEWEB_SMOKE_EXCLUSIVE_DNS_HOSTNAME:
        process.env.TIMEWEB_SMOKE_EXCLUSIVE_DNS_HOSTNAME,
    };
    process.env.VERCEL_ENV = "production";
    process.env.PLATFORM_PROVIDER = "timeweb";
    process.env.TIMEWEB_API_TOKEN = "synthetic-test-token";
    process.env.TIMEWEB_MUTATIONS_ENABLED = "true";
    process.env.TIMEWEB_CAPABILITIES_VERIFIED = "true";
    process.env.TIMEWEB_SMOKE_EXCLUSIVE_ACCOUNT = "true";
    process.env.TIMEWEB_SMOKE_EXCLUSIVE_DNS_HOSTNAME = "true";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ meta: { total: 0 }, servers: [] }),
      );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const lifecycle = await createInfrastructureLifecycleAdapter(
        { operationId, scenario: "success" },
        { createExecutionToken: replay.executionToken! },
      );
      await expect(lifecycle.createServer()).rejects.toMatchObject({
        code: "UNKNOWN_SERVER_OUTCOME",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("GET");
    } finally {
      vi.unstubAllGlobals();
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("releases reconcile after a transient owned-IP lookup failure", async () => {
    const previous = {
      VERCEL_ENV: process.env.VERCEL_ENV,
      PLATFORM_PROVIDER: process.env.PLATFORM_PROVIDER,
      TIMEWEB_API_TOKEN: process.env.TIMEWEB_API_TOKEN,
      TIMEWEB_MUTATIONS_ENABLED: process.env.TIMEWEB_MUTATIONS_ENABLED,
      TIMEWEB_CAPABILITIES_VERIFIED:
        process.env.TIMEWEB_CAPABILITIES_VERIFIED,
      TIMEWEB_SMOKE_EXCLUSIVE_ACCOUNT:
        process.env.TIMEWEB_SMOKE_EXCLUSIVE_ACCOUNT,
      TIMEWEB_SMOKE_EXCLUSIVE_DNS_HOSTNAME:
        process.env.TIMEWEB_SMOKE_EXCLUSIVE_DNS_HOSTNAME,
      AUTH_FACTOR_ENCRYPTION_KEY: process.env.AUTH_FACTOR_ENCRYPTION_KEY,
    };
    const totpSecret = "JBSWY3DPEHPK3PXP";
    const factorEncryptionKey = Buffer.alloc(32, 7).toString("base64url");
    process.env.VERCEL_ENV = "production";
    process.env.PLATFORM_PROVIDER = "timeweb";
    process.env.TIMEWEB_API_TOKEN = "synthetic-test-token";
    process.env.TIMEWEB_MUTATIONS_ENABLED = "true";
    process.env.TIMEWEB_CAPABILITIES_VERIFIED = "true";
    process.env.TIMEWEB_SMOKE_EXCLUSIVE_ACCOUNT = "true";
    process.env.TIMEWEB_SMOKE_EXCLUSIVE_DNS_HOSTNAME = "true";
    process.env.AUTH_FACTOR_ENCRYPTION_KEY = factorEncryptionKey;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ server: { id: 54321, status: "on" } }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const admin = await bootstrapAdmin(sql, {
        email: "production-admin@example.test",
        password: "correct horse battery staple",
        totpSecret,
        totpCode: createTotpCode(totpSecret),
        factorEncryptionKey,
      });
      const login = await loginWithPassword(sql, {
        email: admin.email,
        password: "correct horse battery staple",
        mfaCode: createTotpCode(totpSecret),
      });
      if (!login.ok) throw new Error("Production MFA login failed.");
      const create = await reserveCreateOperation(sql, login.session, {
        name: "t0056-ip-retry-regression",
        idempotencyKey: "production-ip-retry-regression-01",
        scenario: "success",
        providerPlan: {
          version: "timeweb-provisioning-v3",
          deploymentMode: "plain-vps",
          checkedAt: new Date().toISOString(),
          presetId: 101,
          operatingSystemId: 202,
          operatingSystemLabel: "ubuntu 24.04 x86_64",
          region: "ru-2",
          regionLabel: "Новосибирск",
          availabilityZone: "nsk-1",
          monthlyServerRoubles: 207,
          hourlyServerRoubles: 0.28,
          cpu: 1,
          ramMb: 1024,
          diskMb: 15_360,
          diskType: "nvme",
          bandwidthMbps: 100,
          backupsEnabled: false,
          backupInterval: "week",
          backupCopyCount: 1,
          publicIpv4: true,
          monthlyPublicIpRoubles: 180,
          monthlyTotalRoubles: 387,
          projectId: 303,
          sshKeyId: 404,
        },
      });
      const environmentId = await operationEnvironmentId(
        sql,
        create.accepted.operationId,
      );
      await sql`
        INSERT INTO provider_resources (
          id, environment_id, operation_id, provider, resource_kind,
          provider_resource_id, ownership, lifecycle_status, public_metadata
        )
        VALUES (
          '11111111-2222-4333-8444-555555555555',
          ${environmentId}, ${create.accepted.operationId}, 'timeweb', 'server',
          '54321', 'platform', 'active', '{}'::jsonb
        )
      `;
      await sql`
        INSERT INTO provider_resources (
          id, environment_id, operation_id, provider, resource_kind,
          provider_resource_id, ownership, lifecycle_status, public_metadata
        )
        VALUES (
          '22222222-3333-4444-8555-666666666666',
          ${environmentId}, ${create.accepted.operationId}, 'timeweb', 'public_ip',
          '33333333-4444-4555-8666-777777777777',
          'platform', 'active', '{"address":"203.0.113.11"}'::jsonb
        )
      `;

      await expect(
        reconcileServerStep({
          operationId: create.accepted.operationId,
          scenario: "success",
        }),
      ).rejects.toThrow("Timeweb");
      const failed = await sql<
        { status: string; retry_class: string; attempt_count: number }[]
      >`
        SELECT status, retry_class, attempt_count
        FROM operation_steps
        WHERE operation_id = ${create.accepted.operationId}
          AND logical_key = 'provider_installing'
      `;
      expect(failed[0]).toEqual({
        status: "failed",
        retry_class: "transient",
        attempt_count: 1,
      });
      const retry = await beginStep(
        sql,
        create.accepted.operationId,
        "provider_installing",
        30,
      );
      expect(retry).toMatchObject({ claimed: true, attempts: 2 });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(
        fetchMock.mock.calls.map(([, init]) => init?.method),
      ).toEqual(["GET", "GET"]);
    } finally {
      vi.unstubAllGlobals();
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("blocks delete completion while a floating-IP mutation stays unresolved", async () => {
    const previous = {
      VERCEL_ENV: process.env.VERCEL_ENV,
      PLATFORM_PROVIDER: process.env.PLATFORM_PROVIDER,
      TIMEWEB_API_TOKEN: process.env.TIMEWEB_API_TOKEN,
      TIMEWEB_MUTATIONS_ENABLED: process.env.TIMEWEB_MUTATIONS_ENABLED,
      TIMEWEB_CAPABILITIES_VERIFIED:
        process.env.TIMEWEB_CAPABILITIES_VERIFIED,
      TIMEWEB_SMOKE_EXCLUSIVE_ACCOUNT:
        process.env.TIMEWEB_SMOKE_EXCLUSIVE_ACCOUNT,
      TIMEWEB_SMOKE_EXCLUSIVE_DNS_HOSTNAME:
        process.env.TIMEWEB_SMOKE_EXCLUSIVE_DNS_HOSTNAME,
      AUTH_FACTOR_ENCRYPTION_KEY: process.env.AUTH_FACTOR_ENCRYPTION_KEY,
    };
    const totpSecret = "JBSWY3DPEHPK3PXP";
    const factorEncryptionKey = Buffer.alloc(32, 9).toString("base64url");
    process.env.VERCEL_ENV = "production";
    process.env.PLATFORM_PROVIDER = "timeweb";
    process.env.TIMEWEB_API_TOKEN = "synthetic-test-token";
    process.env.TIMEWEB_MUTATIONS_ENABLED = "true";
    process.env.TIMEWEB_CAPABILITIES_VERIFIED = "true";
    process.env.TIMEWEB_SMOKE_EXCLUSIVE_ACCOUNT = "true";
    process.env.TIMEWEB_SMOKE_EXCLUSIVE_DNS_HOSTNAME = "true";
    process.env.AUTH_FACTOR_ENCRYPTION_KEY = factorEncryptionKey;

    const baselineId = "11111111-2222-4333-8444-555555555555";
    const unknownId = "22222222-3333-4444-8555-666666666666";
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        ips: [
          {
            id: baselineId,
            ip: "203.0.113.10",
            availability_zone: "nsk-1",
            resource_type: null,
            resource_id: null,
          },
          {
            id: unknownId,
            ip: "203.0.113.11",
            availability_zone: "nsk-1",
            resource_type: "server",
            resource_id: 98765,
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const admin = await bootstrapAdmin(sql, {
        email: "ambiguity-admin@example.test",
        password: "correct horse battery staple",
        totpSecret,
        totpCode: createTotpCode(totpSecret),
        factorEncryptionKey,
      });
      const login = await loginWithPassword(sql, {
        email: admin.email,
        password: "correct horse battery staple",
        mfaCode: createTotpCode(totpSecret),
      });
      if (!login.ok) throw new Error("Production MFA login failed.");

      const create = await reserveCreateOperation(sql, login.session, {
        name: "t0056-unresolved-ip",
        idempotencyKey: "production-unresolved-ip-create-01",
        scenario: "success",
        providerPlan: {
          version: "timeweb-provisioning-v3",
          deploymentMode: "plain-vps",
          checkedAt: new Date().toISOString(),
          presetId: 101,
          operatingSystemId: 202,
          operatingSystemLabel: "ubuntu 24.04 x86_64",
          region: "ru-2",
          regionLabel: "Новосибирск",
          availabilityZone: "nsk-1",
          monthlyServerRoubles: 207,
          hourlyServerRoubles: 0.28,
          cpu: 1,
          ramMb: 1024,
          diskMb: 15_360,
          diskType: "nvme",
          bandwidthMbps: 100,
          backupsEnabled: false,
          backupInterval: "week",
          backupCopyCount: 1,
          publicIpv4: true,
          monthlyPublicIpRoubles: 180,
          monthlyTotalRoubles: 387,
          projectId: 303,
          sshKeyId: 404,
        },
      });
      const createOperationId = create.accepted.operationId;
      const environmentId = await operationEnvironmentId(
        sql,
        createOperationId,
      );
      const reserve = await beginStep(
        sql,
        createOperationId,
        "reserve_public_ip",
        10,
      );
      await sql`
        UPDATE operation_steps
        SET logs_redacted = ${JSON.stringify({
          version: "public-ip-create-v1",
          baselineHashes: [
            createHash("sha256").update(baselineId).digest("hex"),
          ],
        })}
        WHERE operation_id = ${createOperationId}
          AND logical_key = 'reserve_public_ip'
      `;
      await finishStep(
        sql,
        createOperationId,
        "reserve_public_ip",
        reserve.executionToken!,
        {
          status: "failed",
          code: "UNKNOWN_PUBLIC_IP_OUTCOME",
          message: "Ambiguous provider response.",
          retryClass: "permanent",
        },
      );
      await finishOperation(sql, createOperationId, {
        status: "failed",
        code: "UNKNOWN_PUBLIC_IP_OUTCOME",
        message: "Ambiguous provider response.",
      });
      await transitionEnvironment(
        sql,
        createOperationId,
        "creating",
        "cleanup_required",
      );

      const deletion = await reserveDeleteOperation(sql, login.session, {
        environmentId,
        confirmationName: "t0056-unresolved-ip",
        confirmedLoss: true,
        idempotencyKey: "production-unresolved-ip-delete-01",
        scenario: "success",
      });
      await expect(
        deleteEnvironmentWorkflow({
          operationId: deletion.accepted.operationId,
          scenario: "success",
        }),
      ).resolves.toEqual({ status: "cleanup_required" });

      const state = await sql<
        {
          environment_status: string;
          operation_status: string;
          complete_steps: number;
          resources: number;
        }[]
      >`
        SELECT
          environments.status AS environment_status,
          operations.status AS operation_status,
          (
            SELECT count(*)::int
            FROM operation_steps
            WHERE operation_id = operations.id
              AND logical_key = 'complete_delete'
          ) AS complete_steps,
          (
            SELECT count(*)::int
            FROM provider_resources
            WHERE environment_id = environments.id
          ) AS resources
        FROM operations
        JOIN environments ON environments.id = operations.environment_id
        WHERE operations.id = ${deletion.accepted.operationId}
      `;
      expect(state[0]).toEqual({
        environment_status: "cleanup_required",
        operation_status: "failed",
        complete_steps: 0,
        resources: 0,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
