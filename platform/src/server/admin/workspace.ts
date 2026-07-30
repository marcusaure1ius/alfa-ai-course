import "server-only";

import type { DatabaseSql } from "@/server/db/client";

export type AdminAttentionItem = {
  key: string;
  title: string;
  detail: string;
  href: string;
  count: number;
  tone: "neutral" | "warning";
};

export type AdminActivityItem = {
  id: string;
  action: string;
  occurredAt: string;
};

export type AdminOverview = {
  students: number;
  activeStudents: number;
  publishedMaterials: number;
  totalMaterials: number;
  activeTools: number;
  attention: AdminAttentionItem[];
  activity: AdminActivityItem[];
};

const actionLabels: Record<string, string> = {
  "course.created": "Создан курс",
  "course.section.created": "Добавлен раздел",
  "course.material.created": "Создан материал",
  "course.material.updated": "Обновлён материал",
  "course.publication.changed": "Изменена публикация курса",
  "course.section.publication.changed": "Изменена публикация раздела",
  "course.access.granted": "Открыт доступ ученику",
  "course.access.revoked": "Отозван доступ ученика",
};

export async function getAdminOverview(sql: DatabaseSql): Promise<AdminOverview> {
  const [counts, activity] = await Promise.all([
    sql<
      Array<{
        students: number;
        active_students: number;
        published_materials: number;
        total_materials: number;
        active_tools: number;
        draft_materials: number;
        students_without_course: number;
        failed_operations: number;
      }>
    >`
      SELECT
        (SELECT count(*)::int FROM users WHERE role_id = 'student') AS students,
        (
          SELECT count(DISTINCT membership.user_id)::int
          FROM course_memberships AS membership
          JOIN users ON users.id = membership.user_id
          WHERE membership.status = 'active' AND users.status = 'active'
        ) AS active_students,
        (
          SELECT count(*)::int FROM course_materials WHERE status = 'published'
        ) AS published_materials,
        (SELECT count(*)::int FROM course_materials) AS total_materials,
        (
          SELECT count(*)::int FROM environments
          WHERE status IN ('creating', 'active')
        ) AS active_tools,
        (
          SELECT count(*)::int FROM course_materials WHERE status = 'draft'
        ) AS draft_materials,
        (
          SELECT count(*)::int
          FROM users
          WHERE role_id = 'student'
            AND NOT EXISTS (
              SELECT 1 FROM course_memberships
              WHERE course_memberships.user_id = users.id
                AND course_memberships.status = 'active'
            )
        ) AS students_without_course,
        (
          SELECT count(*)::int FROM operations
          WHERE status IN ('failed', 'manual_confirmation_required')
        ) AS failed_operations
    `,
    sql<Array<{ id: string; action: string; occurred_at: Date }>>`
      SELECT id, action, occurred_at
      FROM audit_events
      WHERE action LIKE 'course.%'
      ORDER BY occurred_at DESC
      LIMIT 6
    `,
  ]);
  const row = counts[0] ?? {
    students: 0,
    active_students: 0,
    published_materials: 0,
    total_materials: 0,
    active_tools: 0,
    draft_materials: 0,
    students_without_course: 0,
    failed_operations: 0,
  };
  const attention: AdminAttentionItem[] = [];
  if (row.failed_operations > 0) {
    attention.push({
      key: "operations",
      title: "Операции требуют решения",
      detail: "Есть неуспешные или остановленные операции.",
      href: "/admin/operations",
      count: row.failed_operations,
      tone: "warning",
    });
  }
  if (row.students_without_course > 0) {
    attention.push({
      key: "students",
      title: "Ученики без курса",
      detail: "Доступ ещё не выдан.",
      href: "/admin/students",
      count: row.students_without_course,
      tone: "neutral",
    });
  }
  if (row.draft_materials > 0) {
    attention.push({
      key: "materials",
      title: "Черновики материалов",
      detail: "Можно проверить и опубликовать.",
      href: "/admin/content",
      count: row.draft_materials,
      tone: "neutral",
    });
  }
  return {
    students: row.students,
    activeStudents: row.active_students,
    publishedMaterials: row.published_materials,
    totalMaterials: row.total_materials,
    activeTools: row.active_tools,
    attention,
    activity: activity.map((item) => ({
      id: item.id,
      action: actionLabels[item.action] ?? "Обновление курса",
      occurredAt: item.occurred_at.toISOString(),
    })),
  };
}

export type AdminStudentListItem = {
  id: string;
  email: string;
  status: "active" | "blocked";
  createdAt: string;
  courseTitle: string | null;
  courseId: string | null;
  completedMaterials: number;
  publishedMaterials: number;
};

export async function getAdminStudents(
  sql: DatabaseSql,
): Promise<AdminStudentListItem[]> {
  const rows = await sql<
    Array<{
      id: string;
      email: string;
      status: "active" | "blocked";
      created_at: Date;
      course_title: string | null;
      course_id: string | null;
      completed_materials: number;
      published_materials: number;
    }>
  >`
    SELECT
      users.id, users.email, users.status, users.created_at,
      course.title AS course_title, course.id AS course_id,
      count(progress.material_id) FILTER (WHERE progress.completed_at IS NOT NULL)::int
        AS completed_materials,
      count(DISTINCT material.id)::int AS published_materials
    FROM users
    LEFT JOIN course_memberships AS membership
      ON membership.user_id = users.id AND membership.status = 'active'
    LEFT JOIN courses AS course ON course.id = membership.course_id
    LEFT JOIN course_materials AS material
      ON material.course_id = course.id AND material.status = 'published'
    LEFT JOIN material_progress AS progress
      ON progress.material_id = material.id AND progress.user_id = users.id
    WHERE users.role_id = 'student'
    GROUP BY users.id, course.id, course.title
    ORDER BY users.created_at DESC
  `;
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    courseTitle: row.course_title,
    courseId: row.course_id,
    completedMaterials: row.completed_materials,
    publishedMaterials: row.published_materials,
  }));
}

export type AdminCourseOption = {
  id: string;
  title: string;
  status: "draft" | "published";
};

export async function getAdminCourses(
  sql: DatabaseSql,
): Promise<AdminCourseOption[]> {
  return sql<AdminCourseOption[]>`
    SELECT id, title, status
    FROM courses
    ORDER BY created_at
  `;
}

export async function getAdminStudent(
  sql: DatabaseSql,
  studentId: string,
): Promise<AdminStudentListItem | null> {
  const students = await getAdminStudents(sql);
  return students.find((student) => student.id === studentId) ?? null;
}

export type AdminMaterialItem = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  kind: "article" | "practice";
  status: "draft" | "published";
  version: number;
  position: number;
  estimatedMinutes: number | null;
  updatedAt: string;
  sectionId: string;
  sectionTitle: string;
  courseId: string;
  courseTitle: string;
};

export async function getAdminMaterials(
  sql: DatabaseSql,
): Promise<AdminMaterialItem[]> {
  const rows = await sql<
    Array<{
      id: string;
      slug: string;
      title: string;
      summary: string;
      body_markdown: string;
      kind: "article" | "practice";
      status: "draft" | "published";
      version: number;
      position: number;
      estimated_minutes: number | null;
      updated_at: Date;
      section_id: string;
      section_title: string;
      course_id: string;
      course_title: string;
    }>
  >`
    SELECT
      material.id, material.slug, material.title, material.summary,
      material.body_markdown, material.kind, material.status, material.version,
      material.position, material.estimated_minutes, material.updated_at,
      section.id AS section_id, section.title AS section_title,
      course.id AS course_id, course.title AS course_title
    FROM course_materials AS material
    JOIN course_sections AS section ON section.id = material.section_id
    JOIN courses AS course ON course.id = material.course_id
    ORDER BY course.created_at, section.position, material.position
  `;
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    bodyMarkdown: row.body_markdown,
    kind: row.kind,
    status: row.status,
    version: row.version,
    position: row.position,
    estimatedMinutes: row.estimated_minutes,
    updatedAt: row.updated_at.toISOString(),
    sectionId: row.section_id,
    sectionTitle: row.section_title,
    courseId: row.course_id,
    courseTitle: row.course_title,
  }));
}

export async function getAdminMaterial(
  sql: DatabaseSql,
  materialId: string,
): Promise<AdminMaterialItem | null> {
  const materials = await getAdminMaterials(sql);
  return materials.find((material) => material.id === materialId) ?? null;
}
