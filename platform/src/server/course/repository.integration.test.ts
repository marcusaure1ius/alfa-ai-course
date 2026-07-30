import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AuthSession } from "../auth/service";
import { createDatabaseClient, type DatabaseSql } from "../db/client";
import { runMigrations } from "../db/migrate";
import {
  createCourse,
  createMaterial,
  createSection,
  getStudentCourse,
  getStudentMaterial,
  reorderSectionMaterials,
  saveMaterialProgress,
  setCoursePublication,
  setSectionPublication,
  setStudentCourseAccess,
  updateMaterial,
} from "./repository";

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
      (${adminId}, 'content-admin@example.test', 'not-used', 'admin'),
      (${studentId}, 'student@example.test', 'not-used', 'student')
  `;
  admin = {
    sessionId: randomUUID(),
    userId: adminId,
    email: "content-admin@example.test",
    role: "admin",
    expiresAt: new Date(Date.now() + 60_000),
    reauthenticatedAt: new Date(),
    mfaAuthenticatedAt: null,
  };
});

afterAll(async () => {
  await sql.end();
});

async function createPublishedCourseWithDraftMaterial() {
  const courseId = await createCourse(sql, admin, {
    slug: "neurokurs",
    title: "Neurokurs",
    description: "Закрытое рабочее пространство курса",
  });
  const sectionId = await createSection(sql, admin, {
    courseId,
    slug: "start",
    title: "Начало работы",
    position: 0,
  });
  const materialId = await createMaterial(sql, admin, {
    courseId,
    sectionId,
    slug: "first-step",
    kind: "article",
    title: "Сначала понять",
    summary: "Короткое введение",
    bodyMarkdown: "# Контекст\n\nРазберитесь в задаче.",
    position: 0,
    estimatedMinutes: 8,
  });
  await setCoursePublication(sql, admin, courseId, "published");
  await setSectionPublication(sql, admin, sectionId, "published");
  await setStudentCourseAccess(sql, admin, {
    courseId,
    studentUserId: studentId,
    granted: true,
  });
  return { courseId, sectionId, materialId };
}

describe("course content repository", () => {
  it("never returns a draft material to a student", async () => {
    await createPublishedCourseWithDraftMaterial();
    const course = await getStudentCourse(sql, studentId, "neurokurs");
    expect(course?.sections).toHaveLength(1);
    expect(course?.sections[0]?.materials).toEqual([]);
    await expect(
      getStudentMaterial(sql, studentId, "first-step"),
    ).resolves.toBeNull();
  });

  it("publishes an edited material with an incremented version and audit", async () => {
    const { materialId, sectionId } =
      await createPublishedCourseWithDraftMaterial();
    await updateMaterial(sql, admin, materialId, {
      sectionId,
      slug: "first-step",
      kind: "article",
      title: "Сначала понять",
      summary: "Короткое введение",
      bodyMarkdown: "# Контекст\n\nЗатем переходите к практике.",
      position: 0,
      estimatedMinutes: 9,
      status: "published",
    });

    const material = await getStudentMaterial(sql, studentId, "first-step");
    expect(material).toMatchObject({
      id: materialId,
      bodyMarkdown: "# Контекст\n\nЗатем переходите к практике.",
      estimatedMinutes: 9,
    });
    const stored = await sql<
      Array<{ version: number; status: string; published_by_user_id: string }>
    >`
      SELECT version, status, published_by_user_id
      FROM course_materials WHERE id = ${materialId}
    `;
    expect(stored[0]).toEqual({
      version: 2,
      status: "published",
      published_by_user_id: admin.userId,
    });
    const audit = await sql<Array<{ action: string }>>`
      SELECT action FROM audit_events
      WHERE subject_id = ${materialId}
      ORDER BY occurred_at
    `;
    expect(audit.map((event) => event.action)).toEqual([
      "course.material.created",
      "course.material.updated",
    ]);
  });

  it("revokes course and progress access immediately on the server", async () => {
    const { courseId, materialId, sectionId } =
      await createPublishedCourseWithDraftMaterial();
    await updateMaterial(sql, admin, materialId, {
      sectionId,
      slug: "first-step",
      kind: "article",
      title: "Сначала понять",
      summary: "",
      bodyMarkdown: "Готово.",
      position: 0,
      estimatedMinutes: null,
      status: "published",
    });
    await saveMaterialProgress(sql, studentId, {
      materialId,
      lastPosition: "context",
      completed: true,
    });
    expect(await getStudentMaterial(sql, studentId, "first-step")).not.toBeNull();

    await setStudentCourseAccess(sql, admin, {
      courseId,
      studentUserId: studentId,
      granted: false,
    });
    await expect(
      getStudentCourse(sql, studentId, "neurokurs"),
    ).resolves.toBeNull();
    await expect(
      getStudentMaterial(sql, studentId, "first-step"),
    ).resolves.toBeNull();
    await expect(
      saveMaterialProgress(sql, studentId, {
        materialId,
        lastPosition: "after-revoke",
        completed: false,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects raw HTML before writing a material", async () => {
    const { courseId, sectionId } =
      await createPublishedCourseWithDraftMaterial();
    await expect(
      createMaterial(sql, admin, {
        courseId,
        sectionId,
        slug: "unsafe",
        kind: "article",
        title: "Unsafe",
        summary: "",
        bodyMarkdown: "<img src=x onerror=alert(1)>",
        position: 1,
      }),
    ).rejects.toMatchObject({ code: "RAW_HTML" });
    const count = await sql<Array<{ count: number }>>`
      SELECT count(*)::int AS count
      FROM course_materials WHERE slug = 'unsafe'
    `;
    expect(count[0]?.count).toBe(0);
  });

  it("reorders a complete section atomically", async () => {
    const { courseId, sectionId, materialId } =
      await createPublishedCourseWithDraftMaterial();
    const secondId = await createMaterial(sql, admin, {
      courseId,
      sectionId,
      slug: "second-step",
      kind: "practice",
      title: "Затем сделать",
      summary: "",
      bodyMarkdown: "Практика.",
      position: 1,
    });
    await reorderSectionMaterials(sql, admin, sectionId, [secondId, materialId]);
    const order = await sql<Array<{ id: string; position: number; version: number }>>`
      SELECT id, position, version
      FROM course_materials
      WHERE section_id = ${sectionId}
      ORDER BY position
    `;
    expect(order).toEqual([
      { id: secondId, position: 0, version: 2 },
      { id: materialId, position: 1, version: 2 },
    ]);
  });

  it("rejects a cross-course material at the database boundary", async () => {
    const first = await createPublishedCourseWithDraftMaterial();
    const secondCourseId = await createCourse(sql, admin, {
      slug: "another-course",
      title: "Другой курс",
    });
    await expect(
      sql`
        INSERT INTO course_materials (
          id, course_id, section_id, slug, kind, title, position,
          created_by_user_id, updated_by_user_id
        )
        VALUES (
          ${randomUUID()}, ${secondCourseId}, ${first.sectionId}, 'cross-course',
          'article', 'Недопустимый материал', 12, ${admin.userId}, ${admin.userId}
        )
      `,
    ).rejects.toMatchObject({
      constraint_name: "course_materials_course_section_fkey",
    });
  });

  it("serializes a progress write behind a concurrent access revoke", async () => {
    const { courseId, materialId, sectionId } =
      await createPublishedCourseWithDraftMaterial();
    await updateMaterial(sql, admin, materialId, {
      sectionId,
      slug: "first-step",
      kind: "article",
      title: "Сначала понять",
      summary: "",
      bodyMarkdown: "Готово.",
      position: 0,
      estimatedMinutes: null,
      status: "published",
    });

    let releaseRevoke!: () => void;
    const revokeCanFinish = new Promise<void>((resolve) => {
      releaseRevoke = resolve;
    });
    let revokeStarted!: () => void;
    const revokeHasLock = new Promise<void>((resolve) => {
      revokeStarted = resolve;
    });
    const revoke = sql.begin(async (transaction) => {
      await transaction`
        UPDATE course_memberships
        SET status = 'revoked', revoked_by_user_id = ${admin.userId},
          revoked_at = now(), updated_at = now()
        WHERE course_id = ${courseId} AND user_id = ${studentId}
      `;
      revokeStarted();
      await revokeCanFinish;
    });
    await revokeHasLock;

    let progressSettled = false;
    const progress = saveMaterialProgress(sql, studentId, {
      materialId,
      lastPosition: "during-revoke",
      completed: false,
    }).finally(() => {
      progressSettled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(progressSettled).toBe(false);

    releaseRevoke();
    await revoke;
    await expect(progress).rejects.toMatchObject({ code: "NOT_FOUND" });
    const stored = await sql<Array<{ count: number }>>`
      SELECT count(*)::int AS count
      FROM material_progress
      WHERE material_id = ${materialId} AND user_id = ${studentId}
    `;
    expect(stored[0]?.count).toBe(0);
  });
});
