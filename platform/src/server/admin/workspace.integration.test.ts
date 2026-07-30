import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, type DatabaseSql } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";

import {
  getAdminMaterials,
  getAdminOverview,
  getAdminStudents,
} from "./workspace";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://platform:local-example-not-a-secret@127.0.0.1:55432/course_platform";

let sql: DatabaseSql;
let adminId: string;
let studentId: string;
let courseId: string;

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
  adminId = randomUUID();
  studentId = randomUUID();
  courseId = randomUUID();
  const sectionId = randomUUID();
  await sql`
    INSERT INTO users (id, email, password_hash, role_id)
    VALUES
      (${adminId}, 'admin-workspace@example.test', 'not-used', 'admin'),
      (${studentId}, 'student-workspace@example.test', 'not-used', 'student')
  `;
  await sql`
    INSERT INTO courses (
      id, slug, title, status, created_by_user_id, updated_by_user_id,
      published_by_user_id, published_at
    )
    VALUES (
      ${courseId}, 'workspace-course', 'Рабочий курс', 'published',
      ${adminId}, ${adminId}, ${adminId}, now()
    )
  `;
  await sql`
    INSERT INTO course_sections (
      id, course_id, slug, title, position, status,
      created_by_user_id, updated_by_user_id, published_by_user_id, published_at
    )
    VALUES (
      ${sectionId}, ${courseId}, 'start', 'Старт', 0, 'published',
      ${adminId}, ${adminId}, ${adminId}, now()
    )
  `;
  await sql`
    INSERT INTO course_materials (
      id, course_id, section_id, slug, title, position, status,
      created_by_user_id, updated_by_user_id, published_by_user_id, published_at
    )
    VALUES
      (
        ${randomUUID()}, ${courseId}, ${sectionId}, 'published', 'Опубликован',
        0, 'published', ${adminId}, ${adminId}, ${adminId}, now()
      ),
      (
        ${randomUUID()}, ${courseId}, ${sectionId}, 'draft', 'Черновик',
        1, 'draft', ${adminId}, ${adminId}, NULL, NULL
      )
  `;
});

afterAll(async () => {
  await sql.end();
});

describe("admin workspace read models", () => {
  it("shows only real attention counts", async () => {
    const overview = await getAdminOverview(sql);
    expect(overview).toMatchObject({
      students: 1,
      activeStudents: 0,
      publishedMaterials: 1,
      totalMaterials: 2,
      activeTools: 0,
    });
    expect(overview.attention.map((item) => [item.key, item.count])).toEqual([
      ["students", 1],
      ["materials", 1],
    ]);
  });

  it("reflects course access and content without synthetic rows", async () => {
    await sql`
      INSERT INTO course_memberships (
        course_id, user_id, status, granted_by_user_id
      )
      VALUES (${courseId}, ${studentId}, 'active', ${adminId})
    `;
    const [students, materials] = await Promise.all([
      getAdminStudents(sql),
      getAdminMaterials(sql),
    ]);
    expect(students).toEqual([
      expect.objectContaining({
        email: "student-workspace@example.test",
        courseTitle: "Рабочий курс",
        publishedMaterials: 1,
      }),
    ]);
    expect(materials.map((material) => material.status)).toEqual([
      "published",
      "draft",
    ]);
  });
});
