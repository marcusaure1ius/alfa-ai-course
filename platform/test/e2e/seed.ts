/**
 * Наполняет одноразовую E2E-базу минимальными данными: администратор,
 * ученик с доступом, опубликованный курс с разделом и двумя материалами.
 *
 * Запускается только из Playwright globalSetup с env, указывающим на
 * одноразовую базу; fail-closed guard отклоняет любую другую базу.
 */
import { randomUUID } from "node:crypto";

import type { AuthSession } from "../../src/server/auth/service";
import { bootstrapAdmin, createUser } from "../../src/server/auth/service";
import {
  createCourse,
  createMaterial,
  createSection,
  setCoursePublication,
  setSectionPublication,
  setStudentCourseAccess,
} from "../../src/server/course/repository";
import { createDatabaseClient } from "../../src/server/db/client";
import { runMigrations } from "../../src/server/db/migrate";
import { requireIntegrationDatabaseUrl } from "../integration/database";
import { E2E_ADMIN, E2E_COURSE, E2E_STUDENT } from "./credentials";

async function main() {
  const sql = createDatabaseClient(requireIntegrationDatabaseUrl());
  try {
    await runMigrations(sql);

    const admin = await bootstrapAdmin(sql, {
      email: E2E_ADMIN.email,
      password: E2E_ADMIN.password,
    });
    const adminSession: AuthSession = {
      sessionId: randomUUID(),
      userId: admin.id,
      email: admin.email,
      role: "admin",
      expiresAt: new Date(Date.now() + 3_600_000),
      reauthenticatedAt: new Date(),
      mfaAuthenticatedAt: null,
    };

    const studentId = await createUser(sql, adminSession, {
      email: E2E_STUDENT.email,
      password: E2E_STUDENT.password,
      role: "student",
    });

    const courseId = await createCourse(sql, adminSession, {
      slug: E2E_COURSE.slug,
      title: E2E_COURSE.title,
      description: "Курс для браузерного смоук-прогона.",
    });
    const sectionId = await createSection(sql, adminSession, {
      courseId,
      slug: "start",
      title: "Начало работы",
      position: 1,
    });
    for (const [position, material] of [
      {
        slug: "welcome",
        title: "Добро пожаловать",
        summary: "Первое знакомство с пространством.",
      },
      {
        slug: "first-step",
        title: "Первый шаг",
        summary: "Небольшая практика.",
      },
    ].entries()) {
      await createMaterial(sql, adminSession, {
        courseId,
        sectionId,
        slug: material.slug,
        kind: "article",
        title: material.title,
        summary: material.summary,
        bodyMarkdown: `## ${material.title}\n\nУчебный текст для смоук-проверки.`,
        position: position + 1,
        status: "published",
      });
    }
    await setSectionPublication(sql, adminSession, sectionId, "published");
    await setCoursePublication(sql, adminSession, courseId, "published");
    await setStudentCourseAccess(sql, adminSession, {
      courseId,
      studentUserId: studentId,
      granted: true,
    });

    console.log("E2E-база наполнена: admin, student, опубликованный курс.");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
