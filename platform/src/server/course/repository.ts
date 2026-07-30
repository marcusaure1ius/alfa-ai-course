import "server-only";

import { randomUUID } from "node:crypto";

import type { AuthSession } from "../auth/service";
import type { DatabaseSql, DatabaseTransactionSql } from "../db/client";
import { assertSafeCourseMarkdown } from "./content-safety";
import type {
  MaterialKind,
  PublicationStatus,
  StudentCourse,
  StudentMaterial,
} from "./contracts";

type RequestAuditContext = {
  requestId?: string;
};

export class CourseContentError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "INVALID_SECTION"
      | "POSITION_CONFLICT",
  ) {
    super(code);
  }
}

async function appendAudit(
  sql: DatabaseSql | DatabaseTransactionSql,
  actorUserId: string,
  action: string,
  subjectType: string,
  subjectId: string,
  context: RequestAuditContext = {},
): Promise<void> {
  await sql`
    INSERT INTO audit_events (
      id, actor_user_id, action, subject_type, subject_id, outcome, request_id, metadata
    )
    VALUES (
      ${randomUUID()}, ${actorUserId}, ${action}, ${subjectType}, ${subjectId},
      'success', ${context.requestId ?? null}, '{}'::jsonb
    )
  `;
}

function requireAdminActor(actor: AuthSession): void {
  if (actor.role !== "admin") throw new CourseContentError("FORBIDDEN");
}

function publicationFields(status: PublicationStatus, actorUserId: string) {
  return status === "published"
    ? { publishedAt: new Date(), publishedByUserId: actorUserId }
    : { publishedAt: null, publishedByUserId: null };
}

export async function createCourse(
  sql: DatabaseSql,
  actor: AuthSession,
  input: { slug: string; title: string; description?: string },
): Promise<string> {
  requireAdminActor(actor);
  const id = randomUUID();
  await sql`
    INSERT INTO courses (
      id, slug, title, description, created_by_user_id, updated_by_user_id
    )
    VALUES (
      ${id}, ${input.slug}, ${input.title}, ${input.description ?? ''},
      ${actor.userId}, ${actor.userId}
    )
  `;
  await appendAudit(sql, actor.userId, "course.created", "course", id);
  return id;
}

export async function createSection(
  sql: DatabaseSql,
  actor: AuthSession,
  input: { courseId: string; slug: string; title: string; position: number },
): Promise<string> {
  requireAdminActor(actor);
  const id = randomUUID();
  await sql`
    INSERT INTO course_sections (
      id, course_id, slug, title, position, created_by_user_id, updated_by_user_id
    )
    VALUES (
      ${id}, ${input.courseId}, ${input.slug}, ${input.title}, ${input.position},
      ${actor.userId}, ${actor.userId}
    )
  `;
  await appendAudit(sql, actor.userId, "course.section.created", "course_section", id);
  return id;
}

type MaterialWrite = {
  courseId: string;
  sectionId: string;
  slug: string;
  kind: MaterialKind;
  title: string;
  summary: string;
  bodyMarkdown: string;
  position: number;
  estimatedMinutes?: number | null;
  status?: PublicationStatus;
};

export async function createMaterial(
  sql: DatabaseSql,
  actor: AuthSession,
  input: MaterialWrite,
  context: RequestAuditContext = {},
): Promise<string> {
  requireAdminActor(actor);
  const bodyMarkdown = assertSafeCourseMarkdown(input.bodyMarkdown);
  const publication = publicationFields(input.status ?? "draft", actor.userId);
  const id = randomUUID();
  const section = await sql<{ present: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM course_sections
      WHERE id = ${input.sectionId} AND course_id = ${input.courseId}
    ) AS present
  `;
  if (!section[0]?.present) throw new CourseContentError("INVALID_SECTION");
  await sql`
    INSERT INTO course_materials (
      id, course_id, section_id, slug, kind, title, summary, body_markdown,
      position, estimated_minutes, status, created_by_user_id, updated_by_user_id,
      published_by_user_id, published_at
    )
    VALUES (
      ${id}, ${input.courseId}, ${input.sectionId}, ${input.slug}, ${input.kind},
      ${input.title}, ${input.summary}, ${bodyMarkdown}, ${input.position},
      ${input.estimatedMinutes ?? null}, ${input.status ?? "draft"},
      ${actor.userId}, ${actor.userId}, ${publication.publishedByUserId},
      ${publication.publishedAt}
    )
  `;
  await appendAudit(
    sql,
    actor.userId,
    "course.material.created",
    "course_material",
    id,
    context,
  );
  return id;
}

export async function updateMaterial(
  sql: DatabaseSql,
  actor: AuthSession,
  materialId: string,
  input: {
    sectionId: string;
    slug: string;
    kind: MaterialKind;
    title: string;
    summary: string;
    bodyMarkdown: string;
    position: number;
    estimatedMinutes?: number | null;
    status: PublicationStatus;
  },
  context: RequestAuditContext = {},
): Promise<void> {
  requireAdminActor(actor);
  const bodyMarkdown = assertSafeCourseMarkdown(input.bodyMarkdown);
  const publication = publicationFields(input.status, actor.userId);
  const rows = await sql<{ id: string }[]>`
    UPDATE course_materials AS material
    SET
      section_id = ${input.sectionId},
      slug = ${input.slug},
      kind = ${input.kind},
      title = ${input.title},
      summary = ${input.summary},
      body_markdown = ${bodyMarkdown},
      position = ${input.position},
      estimated_minutes = ${input.estimatedMinutes ?? null},
      status = ${input.status},
      version = material.version + 1,
      updated_by_user_id = ${actor.userId},
      published_by_user_id = ${publication.publishedByUserId},
      published_at = ${publication.publishedAt},
      updated_at = now()
    WHERE material.id = ${materialId}
      AND EXISTS (
        SELECT 1 FROM course_sections
        WHERE course_sections.id = ${input.sectionId}
          AND course_sections.course_id = material.course_id
      )
    RETURNING material.id
  `;
  if (!rows[0]) throw new CourseContentError("NOT_FOUND");
  await appendAudit(
    sql,
    actor.userId,
    "course.material.updated",
    "course_material",
    materialId,
    context,
  );
}

export async function setCoursePublication(
  sql: DatabaseSql,
  actor: AuthSession,
  courseId: string,
  status: PublicationStatus,
): Promise<void> {
  requireAdminActor(actor);
  const publication = publicationFields(status, actor.userId);
  const rows = await sql<Array<{ id: string }>>`
    UPDATE courses
    SET status = ${status}, version = version + 1,
      updated_by_user_id = ${actor.userId},
      published_by_user_id = ${publication.publishedByUserId},
      published_at = ${publication.publishedAt}, updated_at = now()
    WHERE id = ${courseId}
    RETURNING id
  `;
  if (!rows[0]) throw new CourseContentError("NOT_FOUND");
  await appendAudit(sql, actor.userId, "course.publication.changed", "course", courseId);
}

export async function setSectionPublication(
  sql: DatabaseSql,
  actor: AuthSession,
  sectionId: string,
  status: PublicationStatus,
): Promise<void> {
  requireAdminActor(actor);
  const publication = publicationFields(status, actor.userId);
  const rows = await sql<Array<{ id: string }>>`
    UPDATE course_sections
    SET status = ${status}, version = version + 1,
      updated_by_user_id = ${actor.userId},
      published_by_user_id = ${publication.publishedByUserId},
      published_at = ${publication.publishedAt}, updated_at = now()
    WHERE id = ${sectionId}
    RETURNING id
  `;
  if (!rows[0]) throw new CourseContentError("NOT_FOUND");
  await appendAudit(
    sql,
    actor.userId,
    "course.section.publication.changed",
    "course_section",
    sectionId,
  );
}

export async function reorderSectionMaterials(
  sql: DatabaseSql,
  actor: AuthSession,
  sectionId: string,
  materialIds: string[],
  context: RequestAuditContext = {},
): Promise<void> {
  requireAdminActor(actor);
  await sql.begin(async (transaction) => {
    const rows = await transaction<Array<{ id: string }>>`
      SELECT id
      FROM course_materials
      WHERE section_id = ${sectionId}
      ORDER BY position
      FOR UPDATE
    `;
    const existingIds = rows.map((row) => row.id);
    if (
      existingIds.length !== materialIds.length ||
      new Set(materialIds).size !== materialIds.length ||
      existingIds.some((id) => !materialIds.includes(id))
    ) {
      throw new CourseContentError("NOT_FOUND");
    }
    for (const [position, id] of materialIds.entries()) {
      await transaction`
        UPDATE course_materials
        SET position = ${position + materialIds.length},
          version = version + 1,
          updated_by_user_id = ${actor.userId},
          updated_at = now()
        WHERE id = ${id} AND section_id = ${sectionId}
      `;
    }
    await transaction`
      UPDATE course_materials
      SET position = position - ${materialIds.length}
      WHERE section_id = ${sectionId}
    `;
    await appendAudit(
      transaction,
      actor.userId,
      "course.materials.reordered",
      "course_section",
      sectionId,
      context,
    );
  });
}

export async function setStudentCourseAccess(
  sql: DatabaseSql,
  actor: AuthSession,
  input: { courseId: string; studentUserId: string; granted: boolean },
  context: RequestAuditContext = {},
): Promise<void> {
  requireAdminActor(actor);
  const student = await sql<{ present: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM users
      WHERE id = ${input.studentUserId} AND role_id = 'student'
    ) AS present
  `;
  if (!student[0]?.present) throw new CourseContentError("NOT_FOUND");
  await sql`
    INSERT INTO course_memberships (
      course_id, user_id, status, granted_by_user_id,
      revoked_by_user_id, revoked_at
    )
    VALUES (
      ${input.courseId}, ${input.studentUserId},
      ${input.granted ? 'active' : 'revoked'}, ${actor.userId},
      ${input.granted ? null : actor.userId},
      ${input.granted ? null : new Date()}
    )
    ON CONFLICT (course_id, user_id) DO UPDATE SET
      status = EXCLUDED.status,
      granted_by_user_id = CASE
        WHEN EXCLUDED.status = 'active' THEN EXCLUDED.granted_by_user_id
        ELSE course_memberships.granted_by_user_id
      END,
      granted_at = CASE
        WHEN EXCLUDED.status = 'active' THEN now()
        ELSE course_memberships.granted_at
      END,
      revoked_by_user_id = EXCLUDED.revoked_by_user_id,
      revoked_at = EXCLUDED.revoked_at,
      updated_at = now()
  `;
  await appendAudit(
    sql,
    actor.userId,
    input.granted ? "course.access.granted" : "course.access.revoked",
    "course_membership",
    `${input.courseId}:${input.studentUserId}`,
    context,
  );
}

type StudentCourseRow = {
  course_id: string;
  course_slug: string;
  course_title: string;
  course_description: string;
  section_id: string;
  section_slug: string;
  section_title: string;
  section_position: number;
  material_id: string | null;
  material_slug: string | null;
  material_kind: MaterialKind | null;
  material_title: string | null;
  material_summary: string | null;
  material_position: number | null;
  estimated_minutes: number | null;
  completed_at: Date | null;
};

export async function getStudentCourse(
  sql: DatabaseSql,
  studentUserId: string,
  courseSlug: string,
): Promise<StudentCourse | null> {
  const rows = await sql<StudentCourseRow[]>`
    SELECT
      course.id AS course_id, course.slug AS course_slug,
      course.title AS course_title, course.description AS course_description,
      section.id AS section_id, section.slug AS section_slug,
      section.title AS section_title, section.position AS section_position,
      material.id AS material_id, material.slug AS material_slug,
      material.kind AS material_kind, material.title AS material_title,
      material.summary AS material_summary, material.position AS material_position,
      material.estimated_minutes, progress.completed_at
    FROM courses AS course
    JOIN course_memberships AS membership
      ON membership.course_id = course.id
      AND membership.user_id = ${studentUserId}
      AND membership.status = 'active'
    JOIN course_sections AS section
      ON section.course_id = course.id AND section.status = 'published'
    LEFT JOIN course_materials AS material
      ON material.section_id = section.id AND material.status = 'published'
    LEFT JOIN material_progress AS progress
      ON progress.material_id = material.id AND progress.user_id = ${studentUserId}
    WHERE course.slug = ${courseSlug} AND course.status = 'published'
    ORDER BY section.position, material.position
  `;
  const first = rows[0];
  if (!first) return null;
  const sections = new Map<string, StudentCourse["sections"][number]>();
  for (const row of rows) {
    let section = sections.get(row.section_id);
    if (!section) {
      section = {
        id: row.section_id,
        slug: row.section_slug,
        title: row.section_title,
        position: row.section_position,
        materials: [],
      };
      sections.set(row.section_id, section);
    }
    if (
      row.material_id &&
      row.material_slug &&
      row.material_kind &&
      row.material_title !== null &&
      row.material_summary !== null &&
      row.material_position !== null
    ) {
      section.materials.push({
        id: row.material_id,
        slug: row.material_slug,
        kind: row.material_kind,
        title: row.material_title,
        summary: row.material_summary,
        position: row.material_position,
        estimatedMinutes: row.estimated_minutes,
        completedAt: row.completed_at?.toISOString() ?? null,
      });
    }
  }
  return {
    id: first.course_id,
    slug: first.course_slug,
    title: first.course_title,
    description: first.course_description,
    sections: [...sections.values()],
  };
}

type StudentMaterialRow = {
  id: string;
  slug: string;
  kind: MaterialKind;
  title: string;
  summary: string;
  body_markdown: string;
  position: number;
  estimated_minutes: number | null;
  course_id: string;
  course_slug: string;
  course_title: string;
  section_id: string;
  section_slug: string;
  section_title: string;
  completed_at: Date | null;
  last_position: string | null;
};

export async function getStudentMaterial(
  sql: DatabaseSql,
  studentUserId: string,
  materialSlug: string,
): Promise<StudentMaterial | null> {
  const rows = await sql<StudentMaterialRow[]>`
    SELECT
      material.id, material.slug, material.kind, material.title,
      material.summary, material.body_markdown, material.position,
      material.estimated_minutes,
      course.id AS course_id, course.slug AS course_slug,
      course.title AS course_title,
      section.id AS section_id, section.slug AS section_slug,
      section.title AS section_title,
      progress.completed_at, progress.last_position
    FROM course_materials AS material
    JOIN courses AS course
      ON course.id = material.course_id AND course.status = 'published'
    JOIN course_sections AS section
      ON section.id = material.section_id AND section.status = 'published'
    JOIN course_memberships AS membership
      ON membership.course_id = course.id
      AND membership.user_id = ${studentUserId}
      AND membership.status = 'active'
    LEFT JOIN material_progress AS progress
      ON progress.material_id = material.id AND progress.user_id = ${studentUserId}
    WHERE material.slug = ${materialSlug} AND material.status = 'published'
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    bodyMarkdown: row.body_markdown,
    position: row.position,
    estimatedMinutes: row.estimated_minutes,
    completedAt: row.completed_at?.toISOString() ?? null,
    lastPosition: row.last_position,
    course: { id: row.course_id, slug: row.course_slug, title: row.course_title },
    section: {
      id: row.section_id,
      slug: row.section_slug,
      title: row.section_title,
    },
  };
}

export async function saveMaterialProgress(
  sql: DatabaseSql,
  studentUserId: string,
  input: { materialId: string; lastPosition?: string | null; completed: boolean },
): Promise<void> {
  const accessible = await sql<{ present: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM course_materials AS material
      JOIN courses AS course
        ON course.id = material.course_id AND course.status = 'published'
      JOIN course_sections AS section
        ON section.id = material.section_id AND section.status = 'published'
      JOIN course_memberships AS membership
        ON membership.course_id = course.id
        AND membership.user_id = ${studentUserId}
        AND membership.status = 'active'
      WHERE material.id = ${input.materialId} AND material.status = 'published'
    ) AS present
  `;
  if (!accessible[0]?.present) throw new CourseContentError("NOT_FOUND");
  await sql`
    INSERT INTO material_progress (
      material_id, user_id, last_position, completed_at
    )
    VALUES (
      ${input.materialId}, ${studentUserId}, ${input.lastPosition ?? null},
      ${input.completed ? new Date() : null}
    )
    ON CONFLICT (material_id, user_id) DO UPDATE SET
      last_position = EXCLUDED.last_position,
      completed_at = EXCLUDED.completed_at,
      updated_at = now()
  `;
}
