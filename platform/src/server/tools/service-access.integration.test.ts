import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AuthSession } from "@/server/auth/service";
import { createDatabaseClient, type DatabaseSql } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";

import { setToolServiceAccess, ToolServiceAccessError } from "./service-access";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://platform:local-example-not-a-secret@127.0.0.1:55432/course_platform";

let sql: DatabaseSql;
let admin: AuthSession;
let studentId: string;

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
  await sql`
    INSERT INTO users (id, email, password_hash, role_id)
    VALUES
      (${adminId}, 'gate-admin@example.test', 'unused', 'admin'),
      (${studentId}, 'gate-student@example.test', 'unused', 'student')
  `;
  await sql`
    INSERT INTO tool_service_settings (tool_type, student_access_enabled)
    VALUES ('n8n', true)
  `;
  admin = {
    sessionId: randomUUID(),
    userId: adminId,
    email: "gate-admin@example.test",
    role: "admin",
    expiresAt: new Date(Date.now() + 60_000),
    reauthenticatedAt: new Date(),
    mfaAuthenticatedAt: null,
  };
});

afterAll(async () => {
  await sql.end();
});

describe("tool service access gate", () => {
  it("is reversible, idempotent and audits every admin decision", async () => {
    const environmentId = randomUUID();
    await sql`
      INSERT INTO environments (id, tool_type, name, owner_user_id, status)
      VALUES (${environmentId}, 'n8n', 'Основная среда', ${admin.userId}, 'active')
    `;
    await sql`
      INSERT INTO tool_access (
        tool_type, user_id, environment_id, status, expires_at,
        license_evidence_mode, license_evidence_reference, granted_by_user_id
      )
      VALUES (
        'n8n', ${studentId}, ${environmentId}, 'active', now() + interval '30 days',
        'product_owner_risk_acceptance', 'owner-decision:test', ${admin.userId}
      )
    `;

    await expect(
      setToolServiceAccess(sql, admin, { toolType: "n8n", enabled: false }),
    ).resolves.toMatchObject({ changed: true, affectedAssignments: 1 });
    await expect(
      setToolServiceAccess(sql, admin, { toolType: "n8n", enabled: false }),
    ).resolves.toMatchObject({ changed: false, affectedAssignments: 1 });
    await expect(
      setToolServiceAccess(sql, admin, { toolType: "n8n", enabled: true }),
    ).resolves.toMatchObject({ changed: true, affectedAssignments: 1 });

    const [assignment, settings, audit] = await Promise.all([
      sql<Array<{ status: string }>>`SELECT status FROM tool_access WHERE user_id = ${studentId}`,
      sql<Array<{ student_access_enabled: boolean }>>`SELECT student_access_enabled FROM tool_service_settings WHERE tool_type = 'n8n'`,
      sql<Array<{ action: string; metadata: Record<string, unknown> }>>`
        SELECT action, metadata FROM audit_events ORDER BY occurred_at
      `,
    ]);
    expect(assignment).toEqual([{ status: "active" }]);
    expect(settings).toEqual([{ student_access_enabled: true }]);
    expect(audit).toHaveLength(3);
    expect(audit.map((event) => event.action)).toEqual([
      "tool.student_access.disabled",
      "tool.student_access.disabled",
      "tool.student_access.enabled",
    ]);
    expect(audit[1]?.metadata).toMatchObject({ changed: false });
  });

  it("rejects non-admin actors and unknown tool types", async () => {
    await expect(
      setToolServiceAccess(sql, { ...admin, role: "student" }, { toolType: "n8n", enabled: false }),
    ).rejects.toBeInstanceOf(ToolServiceAccessError);
    await expect(
      setToolServiceAccess(sql, admin, { toolType: "notebook", enabled: false }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("stores access for a no-environment tool without a fake environment", async () => {
    await sql`
      INSERT INTO tool_service_settings (tool_type, student_access_enabled)
      VALUES ('notebook', true)
    `;
    await sql`
      INSERT INTO tool_access (
        tool_type, user_id, environment_id, status, expires_at,
        license_evidence_mode, license_evidence_reference, granted_by_user_id
      )
      VALUES (
        'notebook', ${studentId}, null, 'active', now() + interval '30 days',
        null, null, ${admin.userId}
      )
    `;
    await expect(
      sql<Array<{ environment_id: string | null }>>`
        SELECT environment_id FROM tool_access WHERE tool_type = 'notebook'
      `,
    ).resolves.toEqual([{ environment_id: null }]);
  });
});
