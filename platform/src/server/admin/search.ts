import "server-only";

import type { AdminSearchResult } from "@/lib/admin-search";
import { toolDefinitions } from "@/lib/tool-catalog";
import type { DatabaseSql } from "@/server/db/client";

const RESULT_LIMIT = 6;

function normalizeQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 120);
}

function publicationLabel(status: "draft" | "published"): string {
  return status === "published" ? "Опубликован" : "Черновик";
}

export async function getAdminSearchResults(
  sql: DatabaseSql,
  value: string,
): Promise<{ query: string; results: AdminSearchResult[] }> {
  const query = normalizeQuery(value);
  if (query.length < 2) return { query, results: [] };

  const pattern = `%${query}%`;
  const prefix = `${query}%`;
  const [courses, sections, materials, students, environments] =
    await Promise.all([
      sql<
        Array<{
          id: string;
          title: string;
          description: string;
          status: "draft" | "published";
        }>
      >`
        SELECT id, title, description, status
        FROM courses
        WHERE title ILIKE ${pattern}
          OR description ILIKE ${pattern}
          OR slug ILIKE ${pattern}
        ORDER BY
          CASE
            WHEN lower(title) = lower(${query}) THEN 0
            WHEN title ILIKE ${prefix} THEN 1
            ELSE 2
          END,
          updated_at DESC
        LIMIT ${RESULT_LIMIT}
      `,
      sql<
        Array<{
          id: string;
          title: string;
          status: "draft" | "published";
          course_id: string;
          course_title: string;
        }>
      >`
        SELECT
          section.id, section.title, section.status,
          course.id AS course_id, course.title AS course_title
        FROM course_sections AS section
        JOIN courses AS course ON course.id = section.course_id
        WHERE section.title ILIKE ${pattern}
          OR section.slug ILIKE ${pattern}
        ORDER BY
          CASE
            WHEN lower(section.title) = lower(${query}) THEN 0
            WHEN section.title ILIKE ${prefix} THEN 1
            ELSE 2
          END,
          course.created_at,
          section.position
        LIMIT ${RESULT_LIMIT}
      `,
      sql<
        Array<{
          id: string;
          title: string;
          kind: "article" | "practice";
          status: "draft" | "published";
          course_title: string;
          section_title: string;
        }>
      >`
        SELECT
          material.id, material.title, material.kind, material.status,
          course.title AS course_title, section.title AS section_title
        FROM course_materials AS material
        JOIN courses AS course ON course.id = material.course_id
        JOIN course_sections AS section ON section.id = material.section_id
        WHERE material.title ILIKE ${pattern}
          OR material.slug ILIKE ${pattern}
          OR material.summary ILIKE ${pattern}
          OR material.body_markdown ILIKE ${pattern}
        ORDER BY
          CASE
            WHEN lower(material.title) = lower(${query}) THEN 0
            WHEN material.title ILIKE ${prefix} THEN 1
            ELSE 2
          END,
          material.updated_at DESC
        LIMIT ${RESULT_LIMIT}
      `,
      sql<
        Array<{
          id: string;
          email: string;
          status: "active" | "blocked";
        }>
      >`
        SELECT id, email, status
        FROM users
        WHERE role_id = 'student'
          AND email ILIKE ${pattern}
        ORDER BY
          CASE
            WHEN lower(email) = lower(${query}) THEN 0
            WHEN email ILIKE ${prefix} THEN 1
            ELSE 2
          END,
          created_at DESC
        LIMIT ${RESULT_LIMIT}
      `,
      sql<
        Array<{
          id: string;
          name: string;
          status: string;
        }>
      >`
        SELECT id, name, status
        FROM environments
        WHERE status <> 'deleted'
          AND (name ILIKE ${pattern} OR public_url ILIKE ${pattern})
        ORDER BY
          CASE
            WHEN lower(name) = lower(${query}) THEN 0
            WHEN name ILIKE ${prefix} THEN 1
            ELSE 2
          END,
          updated_at DESC
        LIMIT ${RESULT_LIMIT}
      `,
    ]);

  const normalizedQuery = query.toLocaleLowerCase("ru");
  const tools = toolDefinitions
    .filter((tool) =>
      `${tool.name} ${tool.description}`
        .toLocaleLowerCase("ru")
        .includes(normalizedQuery),
    )
    .slice(0, RESULT_LIMIT);

  return {
    query,
    results: [
      ...courses.map((course) => ({
        id: course.id,
        kind: "course" as const,
        title: course.title,
        detail: `Курс · ${publicationLabel(course.status)}`,
        href: `/admin/program?course=${encodeURIComponent(course.id)}`,
      })),
      ...sections.map((section) => ({
        id: section.id,
        kind: "section" as const,
        title: section.title,
        detail: `${section.course_title} · Раздел`,
        href: `/admin/program/sections/${encodeURIComponent(section.id)}`,
      })),
      ...materials.map((material) => ({
        id: material.id,
        kind: "material" as const,
        title: material.title,
        detail: `${material.course_title} / ${material.section_title} · ${
          material.kind === "practice" ? "Практика" : "Теория"
        }`,
        href: `/admin/content/materials/${encodeURIComponent(material.id)}`,
      })),
      ...students.map((student) => ({
        id: student.id,
        kind: "student" as const,
        title: student.email,
        detail: student.status === "active" ? "Ученик · Активен" : "Ученик · Заблокирован",
        href: `/admin/students/${encodeURIComponent(student.id)}`,
      })),
      ...tools.map((tool) => ({
        id: tool.id,
        kind: "tool" as const,
        title: tool.name,
        detail: tool.description,
        href: tool.setupHref,
      })),
      ...environments.map((environment) => ({
        id: environment.id,
        kind: "environment" as const,
        title: environment.name,
        detail: `Среда n8n · ${environment.status}`,
        href: `/admin/tools/n8n/instances/${encodeURIComponent(environment.id)}`,
      })),
    ],
  };
}
