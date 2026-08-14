import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, type DatabaseSql } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";

import {
  getAdminMaterials,
  getAdminOverview,
  getAdminStudents,
} from "./workspace";
import { getAdminSearchResults } from "./search";

import { requireIntegrationDatabaseUrl } from "../../../test/integration/database";

const databaseUrl = requireIntegrationDatabaseUrl();

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
        courseTitles: ["Рабочий курс"],
        courseIds: [courseId],
        publishedMaterials: 1,
      }),
    ]);
    expect(materials.map((material) => material.status)).toEqual([
      "published",
      "draft",
    ]);
  });

  it("returns one student with every active course membership", async () => {
    const secondCourseId = randomUUID();
    await sql`
      INSERT INTO courses (
        id, slug, title, status, created_by_user_id, updated_by_user_id,
        published_by_user_id, published_at
      )
      VALUES (
        ${secondCourseId}, 'second-course', 'Второй курс', 'published',
        ${adminId}, ${adminId}, ${adminId}, now()
      )
    `;
    await sql`
      INSERT INTO course_memberships (
        course_id, user_id, status, granted_by_user_id, granted_at
      )
      VALUES
        (${courseId}, ${studentId}, 'active', ${adminId}, now() - interval '1 minute'),
        (${secondCourseId}, ${studentId}, 'active', ${adminId}, now())
    `;

    const students = await getAdminStudents(sql);
    expect(students).toHaveLength(1);
    expect(students[0]).toMatchObject({
      courseIds: [courseId, secondCourseId],
      courseTitles: ["Рабочий курс", "Второй курс"],
    });
  });

  it("finds courses, sections, material bodies, students, and tools", async () => {
    await sql`
      UPDATE course_materials
      SET body_markdown = 'Практика по оркестрации рабочих процессов'
      WHERE slug = 'published'
    `;

    const [course, section, material, student, tool] = await Promise.all([
      getAdminSearchResults(sql, "Рабочий"),
      getAdminSearchResults(sql, "Старт"),
      getAdminSearchResults(sql, "оркестрации"),
      getAdminSearchResults(sql, "student-workspace"),
      getAdminSearchResults(sql, "n8n"),
    ]);

    expect(course.results).toEqual([
      expect.objectContaining({ kind: "course", title: "Рабочий курс" }),
    ]);
    expect(section.results).toEqual([
      expect.objectContaining({ kind: "section", title: "Старт" }),
    ]);
    expect(material.results).toEqual([
      expect.objectContaining({ kind: "material", title: "Опубликован" }),
    ]);
    expect(student.results).toEqual([
      expect.objectContaining({
        kind: "student",
        title: "student-workspace@example.test",
      }),
    ]);
    expect(tool.results).toEqual([
      expect.objectContaining({ kind: "tool", title: "n8n" }),
    ]);
  });
});
