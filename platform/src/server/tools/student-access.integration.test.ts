import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AuthSession } from "@/server/auth/service";
import { createDatabaseClient, type DatabaseSql } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";

import {
  getAdminStudentN8nAccess,
  getStudentN8nAccess,
  setStudentN8nAccess,
} from "./student-access";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://platform:local-example-not-a-secret@127.0.0.1:55432/course_platform";

const licenseGate = {
  ready: true as const,
  mode: "product_owner_risk_acceptance" as const,
  evidenceReference: "owner-decision:T-0058:2026-07-31",
};

const identityResolver = async (_origin: string, email: string) => ({
  id: `n8n:${email}`,
  email,
  pending: false,
});

let sql: DatabaseSql;
let admin: AuthSession;
let studentId: string;
let environmentId: string;

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
  studentId = randomUUID();
  environmentId = randomUUID();
  const courseId = randomUUID();
  await sql`
    INSERT INTO users (id, email, password_hash, role_id)
    VALUES
      (${adminId}, 'tools-admin@example.test', 'unused', 'admin'),
      (${studentId}, 'tools-student@example.test', 'unused', 'student')
  `;
  await sql`
    INSERT INTO courses (
      id, slug, title, status, created_by_user_id, updated_by_user_id,
      published_by_user_id, published_at
    )
    VALUES (
      ${courseId}, 'neurokurs', 'Neurokurs', 'published',
      ${adminId}, ${adminId}, ${adminId}, now()
    )
  `;
  await sql`
    INSERT INTO course_memberships (
      course_id, user_id, status, granted_by_user_id
    )
    VALUES (${courseId}, ${studentId}, 'active', ${adminId})
  `;
  await sql`
    INSERT INTO environments (id, name, owner_user_id, status, public_url)
    VALUES (
      ${environmentId}, 'Основная среда', ${adminId}, 'active',
      'https://n8n.example.test'
    )
  `;
  await sql`
    INSERT INTO software_installations (
      id, environment_id, profile_name, profile_version, software_version,
      status, health_status, installed_at, last_checked_at
    )
    VALUES (
      ${randomUUID()}, ${environmentId}, 'starter-kit', 'test-v1', '2.29.10',
      'ready', 'healthy', now(), now()
    )
  `;
  admin = {
    sessionId: randomUUID(),
    userId: adminId,
    email: "tools-admin@example.test",
    role: "admin",
    expiresAt: new Date(Date.now() + 60_000),
    reauthenticatedAt: new Date(),
    mfaAuthenticatedAt: null,
  };
});

afterAll(async () => {
  await sql.end();
});

describe("student n8n tool access", () => {
  it("возвращает ученику только безопасный URL и состояние", async () => {
    const expiresAt = new Date("2026-08-30T23:59:59.000Z");
    await setStudentN8nAccess(
      sql,
      admin,
      { studentUserId: studentId, environmentId, granted: true, expiresAt },
      {},
      new Date("2026-07-31T12:00:00.000Z"),
      licenseGate,
      identityResolver,
    );

    const access = await getStudentN8nAccess(
      sql,
      studentId,
      new Date("2026-07-31T12:00:00.000Z"),
      licenseGate,
    );
    expect(access).toEqual({
      tool: "n8n",
      displayName: "n8n",
      state: "ready",
      canLaunch: true,
      launchUrl: "/api/student/tools/n8n/launch",
      expiresAt: expiresAt.toISOString(),
    });
    expect(Object.keys(access).sort()).toEqual([
      "canLaunch",
      "displayName",
      "expiresAt",
      "launchUrl",
      "state",
      "tool",
    ]);
  });

  it("скрывает URL после срока или при закрытом license gate", async () => {
    const expiresAt = new Date("2026-08-01T00:00:00.000Z");
    await setStudentN8nAccess(
      sql,
      admin,
      { studentUserId: studentId, environmentId, granted: true, expiresAt },
      {},
      new Date("2026-07-31T12:00:00.000Z"),
      licenseGate,
      identityResolver,
    );
    await expect(
      getStudentN8nAccess(
        sql,
        studentId,
        new Date("2026-08-02T00:00:00.000Z"),
        licenseGate,
      ),
    ).resolves.toMatchObject({
      state: "expired",
      canLaunch: false,
      launchUrl: null,
    });
    await expect(
      getStudentN8nAccess(sql, studentId, new Date("2026-07-31T13:00:00.000Z"), {
        ready: false,
        reason: "missing",
      }),
    ).resolves.toMatchObject({
      state: "license_blocked",
      canLaunch: false,
      launchUrl: null,
    });
  });

  it("обратимо закрывает запуск глобальным gate без изменения назначения", async () => {
    const expiresAt = new Date("2026-08-30T23:59:59.000Z");
    await setStudentN8nAccess(
      sql,
      admin,
      { studentUserId: studentId, environmentId, granted: true, expiresAt },
      {},
      new Date("2026-07-31T12:00:00.000Z"),
      licenseGate,
      identityResolver,
    );
    await sql`
      INSERT INTO tool_service_settings (tool_type, student_access_enabled)
      VALUES ('n8n', false)
      ON CONFLICT (tool_type) DO UPDATE SET student_access_enabled = false
    `;
    await expect(
      getStudentN8nAccess(
        sql,
        studentId,
        new Date("2026-07-31T13:00:00.000Z"),
        licenseGate,
      ),
    ).resolves.toMatchObject({
      state: "service_disabled",
      canLaunch: false,
      launchUrl: null,
      expiresAt: expiresAt.toISOString(),
    });
    await sql`
      UPDATE tool_service_settings
      SET student_access_enabled = true
      WHERE tool_type = 'n8n'
    `;
    await expect(
      getStudentN8nAccess(
        sql,
        studentId,
        new Date("2026-07-31T13:00:00.000Z"),
        licenseGate,
      ),
    ).resolves.toMatchObject({
      state: "ready",
      canLaunch: true,
      launchUrl: "/api/student/tools/n8n/launch",
      expiresAt: expiresAt.toISOString(),
    });
    await expect(
      sql<Array<{ status: string; environment_id: string }>>`
        SELECT status, environment_id
        FROM tool_access
        WHERE tool_type = 'n8n' AND user_id = ${studentId}
      `,
    ).resolves.toEqual([{ status: "active", environment_id: environmentId }]);
  });

  it("сохраняет evidence snapshot и позволяет немедленный отзыв", async () => {
    const expiresAt = new Date("2026-08-30T23:59:59.000Z");
    await setStudentN8nAccess(
      sql,
      admin,
      { studentUserId: studentId, environmentId, granted: true, expiresAt },
      {},
      new Date("2026-07-31T12:00:00.000Z"),
      licenseGate,
      identityResolver,
    );
    const stored = await sql<
      Array<{ license_evidence_mode: string; license_evidence_reference: string }>
    >`
      SELECT license_evidence_mode, license_evidence_reference
      FROM tool_access WHERE user_id = ${studentId}
    `;
    expect(stored[0]).toEqual({
      license_evidence_mode: "product_owner_risk_acceptance",
      license_evidence_reference: "owner-decision:T-0058:2026-07-31",
    });

    await setStudentN8nAccess(sql, admin, {
      studentUserId: studentId,
      environmentId,
      granted: false,
      expiresAt: null,
    });
    await expect(
      getStudentN8nAccess(sql, studentId, new Date(), licenseGate),
    ).resolves.toMatchObject({
      state: "locked",
      canLaunch: false,
      launchUrl: null,
    });
    await expect(getAdminStudentN8nAccess(sql, studentId)).resolves.toMatchObject({
      status: "revoked",
    });
  });

  it("не выдаёт доступ без license evidence", async () => {
    await expect(
      setStudentN8nAccess(
        sql,
        admin,
        {
          studentUserId: studentId,
          environmentId,
          granted: true,
          expiresAt: new Date("2026-08-30T23:59:59.000Z"),
        },
        {},
        new Date("2026-07-31T12:00:00.000Z"),
        { ready: false, reason: "missing" },
        identityResolver,
      ),
    ).rejects.toMatchObject({ code: "LICENSE_GATE" });
  });

  it("не отдаёт owner setup ученику и не назначает доступ до trusted admin setup", async () => {
    await sql`
      UPDATE software_installations
      SET status = 'ready_owner_setup_required'
      WHERE environment_id = ${environmentId}
    `;
    await expect(
      setStudentN8nAccess(
        sql,
        admin,
        {
          studentUserId: studentId,
          environmentId,
          granted: true,
          expiresAt: new Date("2026-08-30T23:59:59.000Z"),
        },
        {},
        new Date("2026-07-31T12:00:00.000Z"),
        licenseGate,
        identityResolver,
      ),
    ).rejects.toMatchObject({ code: "ENVIRONMENT_NOT_READY" });
    await expect(
      getStudentN8nAccess(
        sql,
        studentId,
        new Date("2026-07-31T12:00:00.000Z"),
        licenseGate,
      ),
    ).resolves.toMatchObject({
      state: "locked",
      canLaunch: false,
      launchUrl: null,
    });
  });
});
