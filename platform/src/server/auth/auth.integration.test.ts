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
  });

  it("rate limits repeated invalid logins without storing supplied passwords", async () => {
    await bootstrapAdmin(sql, {
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
