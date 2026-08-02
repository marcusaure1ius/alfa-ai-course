import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AuthSession } from "@/server/auth/service";
import { createDatabaseClient, type DatabaseSql } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";

import {
  authorizeN8nGatewayRequest,
  createN8nGatewayExchangeResponse,
  exchangeN8nGatewayTicket,
  issueN8nGatewayTicket,
  N8N_GATE_COOKIE,
} from "./n8n-gateway";
import { setStudentN8nAccess } from "./student-access";
import { setToolServiceAccess } from "./service-access";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://platform:local-example-not-a-secret@127.0.0.1:55432/course_platform";

let sql: DatabaseSql;
let admin: AuthSession;
let students: [AuthSession, AuthSession];
let environmentId: string;

function gatewayToken(cookie: string): string {
  const value = cookie.split(";", 1)[0]?.split("=", 2)[1];
  if (!value || !cookie.startsWith(`${N8N_GATE_COOKIE}=`)) {
    throw new Error("Gateway cookie missing");
  }
  return value;
}

async function exchange(actor: AuthSession, now: Date): Promise<string> {
  const issued = await issueN8nGatewayTicket(sql, actor, undefined, now);
  const result = await exchangeN8nGatewayTicket(
    sql,
    issued.ticket,
    "n8n.example.test",
    new Date(now.getTime() + 1_000),
  );
  return gatewayToken(result.cookie);
}

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
  const adminId = randomUUID();
  const studentIds = [randomUUID(), randomUUID()] as const;
  const courseId = randomUUID();
  environmentId = randomUUID();
  await sql`
    INSERT INTO users (id, email, password_hash, role_id)
    VALUES
      (${adminId}, 'gateway-admin@example.test', 'unused', 'admin'),
      (${studentIds[0]}, 'gateway-one@example.test', 'unused', 'student'),
      (${studentIds[1]}, 'gateway-two@example.test', 'unused', 'student')
  `;
  await sql`
    INSERT INTO courses (
      id, slug, title, status, created_by_user_id, updated_by_user_id,
      published_by_user_id, published_at
    ) VALUES (
      ${courseId}, 'gateway-course', 'Gateway', 'published',
      ${adminId}, ${adminId}, ${adminId}, now()
    )
  `;
  await sql`
    INSERT INTO course_memberships (course_id, user_id, status, granted_by_user_id)
    VALUES
      (${courseId}, ${studentIds[0]}, 'active', ${adminId}),
      (${courseId}, ${studentIds[1]}, 'active', ${adminId})
  `;
  await sql`
    INSERT INTO environments (
      id, tool_type, name, owner_user_id, status, public_url
    ) VALUES (
      ${environmentId}, 'n8n', 'Gateway n8n', ${adminId}, 'active',
      'https://n8n.example.test'
    )
  `;
  await sql`
    INSERT INTO software_installations (
      id, environment_id, profile_name, profile_version, software_version,
      status, health_status
    ) VALUES (
      ${randomUUID()}, ${environmentId}, 'starter-kit', 'test', '2.29.10',
      'ready', 'healthy'
    )
  `;
  await sql`
    INSERT INTO tool_service_settings (tool_type, student_access_enabled)
    VALUES ('n8n', true)
  `;
  await sql`
    INSERT INTO tool_access (
      tool_type, user_id, environment_id, status, expires_at,
      license_evidence_mode, license_evidence_reference, granted_by_user_id,
      n8n_identity_id, n8n_identity_email, gateway_generation
    ) VALUES
      (
        'n8n', ${studentIds[0]}, ${environmentId}, 'active',
        now() + interval '30 days', 'product_owner_risk_acceptance',
        'gateway-test', ${adminId}, 'n8n-user-one', 'gateway-one@example.test',
        ${randomUUID()}
      ),
      (
        'n8n', ${studentIds[1]}, ${environmentId}, 'active',
        now() + interval '30 days', 'product_owner_risk_acceptance',
        'gateway-test', ${adminId}, 'n8n-user-two', 'gateway-two@example.test',
        ${randomUUID()}
      )
  `;
  const session = (userId: string, email: string, role: "admin" | "student") => ({
    sessionId: randomUUID(),
    userId,
    email,
    role,
    expiresAt: new Date(Date.now() + 60_000),
    reauthenticatedAt: new Date(),
    mfaAuthenticatedAt: null,
  });
  admin = session(adminId, "gateway-admin@example.test", "admin");
  students = [
    session(studentIds[0], "gateway-one@example.test", "student"),
    session(studentIds[1], "gateway-two@example.test", "student"),
  ];
});

afterAll(async () => {
  await sql.end();
});

describe("n8n gateway enforcement", () => {
  it("keeps two student identities and gateway sessions distinct", async () => {
    const now = new Date();
    const [first, second] = await Promise.all([
      exchange(students[0], now),
      exchange(students[1], now),
    ]);
    expect(first).not.toBe(second);
    await expect(
      authorizeN8nGatewayRequest(sql, first, "n8n.example.test", now, true),
    ).resolves.toBe(true);
    await expect(
      authorizeN8nGatewayRequest(sql, second, "n8n.example.test", now, true),
    ).resolves.toBe(true);
    await expect(
      sql<Array<{ n8n_identity_id: string }>>`
        SELECT n8n_identity_id FROM tool_access ORDER BY n8n_identity_id
      `,
    ).resolves.toEqual([
      { n8n_identity_id: "n8n-user-one" },
      { n8n_identity_id: "n8n-user-two" },
    ]);
  });

  it("blocks a saved session after revoke, expiry, or user deletion", async () => {
    const now = new Date();
    const token = await exchange(students[0], now);
    await sql`UPDATE tool_access SET status = 'revoked', revoked_at = now(), revoked_by_user_id = ${admin.userId} WHERE user_id = ${students[0].userId}`;
    await expect(
      authorizeN8nGatewayRequest(sql, token, "n8n.example.test", now, true),
    ).resolves.toBe(false);

    await sql`UPDATE tool_access SET status = 'active', revoked_at = null, revoked_by_user_id = null, expires_at = ${new Date(now.getTime() - 1_000)} WHERE user_id = ${students[0].userId}`;
    await expect(
      authorizeN8nGatewayRequest(sql, token, "n8n.example.test", now, true),
    ).resolves.toBe(false);

    await sql`UPDATE tool_access SET expires_at = ${new Date(now.getTime() + 60_000)} WHERE user_id = ${students[0].userId}`;
    await sql`UPDATE users SET status = 'blocked' WHERE id = ${students[0].userId}`;
    await expect(
      authorizeN8nGatewayRequest(sql, token, "n8n.example.test", now, true),
    ).resolves.toBe(false);
  });

  it("does not revive a session when expired access is renewed", async () => {
    const now = new Date();
    const identityResolver = async (_origin: string, email: string) => ({
      id: "n8n-user-one",
      email,
      pending: false,
    });
    const licenseGate = {
      ready: true as const,
      mode: "product_owner_risk_acceptance" as const,
      evidenceReference: "gateway-test",
    };
    await setStudentN8nAccess(
      sql,
      admin,
      {
        studentUserId: students[0].userId,
        environmentId,
        granted: true,
        expiresAt: new Date(now.getTime() + 60_000),
      },
      {},
      now,
      licenseGate,
      identityResolver,
    );
    const historicalToken = await exchange(students[0], now);
    const afterExpiry = new Date(now.getTime() + 61_000);
    await expect(
      authorizeN8nGatewayRequest(
        sql,
        historicalToken,
        "n8n.example.test",
        afterExpiry,
        true,
      ),
    ).resolves.toBe(false);

    await setStudentN8nAccess(
      sql,
      admin,
      {
        studentUserId: students[0].userId,
        environmentId,
        granted: true,
        expiresAt: new Date(afterExpiry.getTime() + 60_000),
      },
      {},
      afterExpiry,
      licenseGate,
      identityResolver,
    );
    await expect(
      authorizeN8nGatewayRequest(
        sql,
        historicalToken,
        "n8n.example.test",
        afterExpiry,
        true,
      ),
    ).resolves.toBe(false);
    const currentToken = await exchange(students[0], afterExpiry);
    await expect(
      authorizeN8nGatewayRequest(
        sql,
        currentToken,
        "n8n.example.test",
        afterExpiry,
        true,
      ),
    ).resolves.toBe(true);
  });

  it("does not revive a session when the license gate is turned off and on", async () => {
    const now = new Date();
    const historicalToken = await exchange(students[0], now);
    await expect(
      authorizeN8nGatewayRequest(
        sql,
        historicalToken,
        "n8n.example.test",
        now,
        false,
      ),
    ).resolves.toBe(false);
    await expect(
      authorizeN8nGatewayRequest(
        sql,
        historicalToken,
        "n8n.example.test",
        now,
        true,
      ),
    ).resolves.toBe(false);

    const serviceToken = await exchange(students[0], now);
    await setToolServiceAccess(sql, admin, { toolType: "n8n", enabled: false });
    await expect(
      authorizeN8nGatewayRequest(
        sql,
        serviceToken,
        "n8n.example.test",
        now,
        true,
      ),
    ).resolves.toBe(false);
    await setToolServiceAccess(sql, admin, { toolType: "n8n", enabled: true });
    await expect(
      authorizeN8nGatewayRequest(
        sql,
        serviceToken,
        "n8n.example.test",
        now,
        true,
      ),
    ).resolves.toBe(false);
    const currentToken = await exchange(students[0], now);
    await expect(
      authorizeN8nGatewayRequest(
        sql,
        currentToken,
        "n8n.example.test",
        now,
        true,
      ),
    ).resolves.toBe(true);
  });

  it("allows trusted admin owner setup but never issues that surface to students", async () => {
    await sql`UPDATE software_installations SET status = 'ready_owner_setup_required' WHERE environment_id = ${environmentId}`;
    await expect(issueN8nGatewayTicket(sql, students[0])).rejects.toMatchObject({
      code: "NOT_READY",
    });
    const adminToken = await exchange(admin, new Date());
    await expect(
      authorizeN8nGatewayRequest(
        sql,
        adminToken,
        "n8n.example.test",
        new Date(),
        false,
      ),
    ).resolves.toBe(true);
  });

  it("keeps one deterministic assignment and never revives its historical session", async () => {
    const now = new Date();
    const historicalToken = await exchange(students[0], now);
    await setStudentN8nAccess(sql, admin, {
      studentUserId: students[0].userId,
      environmentId,
      granted: false,
      expiresAt: null,
    });
    await setStudentN8nAccess(
      sql,
      admin,
      {
        studentUserId: students[0].userId,
        environmentId,
        granted: true,
        expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000),
      },
      {},
      now,
      {
        ready: true,
        mode: "product_owner_risk_acceptance",
        evidenceReference: "gateway-test",
      },
      async (_origin, email) => ({
        id: "n8n-user-one",
        email,
        pending: false,
      }),
    );
    await expect(
      authorizeN8nGatewayRequest(
        sql,
        historicalToken,
        "n8n.example.test",
        now,
        true,
      ),
    ).resolves.toBe(false);
    await expect(
      sql<Array<{ count: number }>>`
        SELECT count(*)::int AS count FROM tool_access
        WHERE tool_type = 'n8n' AND user_id = ${students[0].userId}
      `,
    ).resolves.toEqual([{ count: 1 }]);
    const currentToken = await exchange(students[0], now);
    await expect(
      authorizeN8nGatewayRequest(
        sql,
        currentToken,
        "n8n.example.test",
        now,
        true,
      ),
    ).resolves.toBe(true);
  });

  it("consumes tickets once and fails closed for an unknown host", async () => {
    const issued = await issueN8nGatewayTicket(sql, students[0]);
    expect(new URL(issued.exchangeUrl).search).toBe("");
    const response = createN8nGatewayExchangeResponse(issued);
    expect(response.headers.get("content-security-policy")).toContain(
      "form-action https://n8n.example.test",
    );
    await expect(response.text()).resolves.toContain('method="post"');
    await expect(
      exchangeN8nGatewayTicket(sql, issued.ticket, "wrong.example.test"),
    ).rejects.toMatchObject({ code: "INVALID_TICKET" });
    await expect(
      exchangeN8nGatewayTicket(sql, issued.ticket, "n8n.example.test"),
    ).resolves.toHaveProperty("cookie");
    await expect(
      exchangeN8nGatewayTicket(sql, issued.ticket, "n8n.example.test"),
    ).rejects.toMatchObject({ code: "INVALID_TICKET" });
  });
});
