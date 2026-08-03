import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { ToolDefinition } from "@/lib/tool-catalog";
import type { AuthSession } from "@/server/auth/service";
import { createDatabaseClient, type DatabaseSql } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";

import { grantStudentToolAssignment } from "./assignment";

const databaseUrl = process.env.DATABASE_URL ??
  "postgresql://platform:local-example-not-a-secret@127.0.0.1:55432/course_platform";

const definitions: ToolDefinition[] = [
  {
    id: "automation",
    name: "Automation",
    description: "Environment-backed",
    setupHref: "/admin/tools/automation",
    studentHref: "/student/tools/automation",
    capabilities: { environment: "required", studentAccess: true, studentLaunch: true },
  },
  {
    id: "notebook",
    name: "Notebook",
    description: "No environment",
    setupHref: "/admin/tools/notebook",
    studentHref: "/student/tools/notebook",
    capabilities: { environment: "none", studentAccess: true, studentLaunch: false },
  },
  {
    id: "sandbox",
    name: "Sandbox",
    description: "Optional environment",
    setupHref: "/admin/tools/sandbox",
    studentHref: "/student/tools/sandbox",
    capabilities: { environment: "optional", studentAccess: true, studentLaunch: true },
  },
];

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
  const courseId = randomUUID();
  await sql`
    INSERT INTO users (id, email, password_hash, role_id)
    VALUES
      (${adminId}, 'assignment-admin@example.test', 'unused', 'admin'),
      (${studentId}, 'assignment-student@example.test', 'unused', 'student')
  `;
  await sql`
    INSERT INTO courses (
      id, slug, title, status, created_by_user_id, updated_by_user_id,
      published_by_user_id, published_at
    )
    VALUES (
      ${courseId}, 'assignment-course', 'Курс', 'published',
      ${adminId}, ${adminId}, ${adminId}, now()
    )
  `;
  await sql`
    INSERT INTO course_memberships (course_id, user_id, status, granted_by_user_id)
    VALUES (${courseId}, ${studentId}, 'active', ${adminId})
  `;
  admin = {
    sessionId: randomUUID(), userId: adminId, email: "assignment-admin@example.test",
    role: "admin", expiresAt: new Date(Date.now() + 60_000),
    reauthenticatedAt: new Date(), mfaAuthenticatedAt: null,
  };
});

afterAll(async () => sql.end());

describe("generic tool assignment", () => {
  it("grants an environmentless service without a fake environment", async () => {
    await grantStudentToolAssignment(
      sql,
      admin,
      {
        toolType: "notebook",
        studentUserId: studentId,
        environmentId: null,
        expiresAt: new Date("2026-09-01T00:00:00.000Z"),
      },
      { definitions, now: new Date("2026-08-02T00:00:00.000Z") },
    );
    await expect(sql<Array<{ environment_id: string | null }>>`
      SELECT environment_id FROM tool_access WHERE tool_type = 'notebook'
    `).resolves.toEqual([{ environment_id: null }]);
  });

  it("requires a matching environment for an environment-backed service", async () => {
    await expect(grantStudentToolAssignment(
      sql,
      admin,
      {
        toolType: "automation", studentUserId: studentId,
        environmentId: null, expiresAt: new Date("2026-09-01T00:00:00.000Z"),
      },
      { definitions, now: new Date("2026-08-02T00:00:00.000Z") },
    )).rejects.toMatchObject({ code: "INVALID_ENVIRONMENT" });
  });

  it("allows an optional-environment service without inventing infrastructure", async () => {
    await grantStudentToolAssignment(
      sql,
      admin,
      {
        toolType: "sandbox", studentUserId: studentId,
        environmentId: null, expiresAt: new Date("2026-09-01T00:00:00.000Z"),
      },
      { definitions, now: new Date("2026-08-02T00:00:00.000Z") },
    );
    await expect(sql<Array<{ environment_id: string | null }>>`
      SELECT environment_id FROM tool_access WHERE tool_type = 'sandbox'
    `).resolves.toEqual([{ environment_id: null }]);
  });
});
