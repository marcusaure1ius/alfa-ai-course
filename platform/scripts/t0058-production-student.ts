import { randomBytes, randomUUID } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";

import { hashPassword } from "../src/server/auth/crypto";
import { getDatabase } from "../src/server/db/client";
import { assertSchemaUpToDate } from "../src/server/db/migrate";

const CONFIRMATION_FLAG = "--confirm-production-fixture";
const STUDENT_EMAIL = "t0058-student@neurokurs.invalid";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function printHelp(): void {
  console.log(`Подготовить повторяемого production-ученика для T-0058.

Использование:
  node --conditions=react-server --import tsx scripts/t0058-production-student.ts \\
    ${CONFIRMATION_FLAG} --output /absolute/path/fixture.json

Скрипт работает только при VERCEL_ENV=production, создаёт или обновляет один
синтетический student account, открывает ему доступ к опубликованному курсу и
записывает одноразовый пароль в новый файл с mode 0600. Пароль не печатается.`);
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    printHelp();
    return;
  }
  if (!process.argv.includes(CONFIRMATION_FLAG)) {
    throw new Error(`Требуется явный флаг ${CONFIRMATION_FLAG}.`);
  }
  if (process.env.VERCEL_ENV !== "production") {
    throw new Error("VERCEL_ENV должен иметь значение production.");
  }
  const outputPath = argument("--output");
  if (!outputPath?.startsWith("/")) {
    throw new Error("--output должен быть абсолютным путём нового файла.");
  }

  const sql = getDatabase();
  try {
    await assertSchemaUpToDate(sql);
    const admins = await sql<Array<{ id: string }>>`
      SELECT id FROM users
      WHERE role_id = 'admin' AND status = 'active'
      ORDER BY created_at ASC
      LIMIT 1
    `;
    const adminId = admins[0]?.id;
    if (!adminId) {
      throw new Error("Нужен активный admin.");
    }
    let courses = await sql<Array<{ id: string }>>`
      SELECT id FROM courses
      WHERE status = 'published'
      ORDER BY published_at DESC NULLS LAST, created_at ASC
      LIMIT 1
    `;
    if (!courses[0]) {
      courses = await sql<Array<{ id: string }>>`
        INSERT INTO courses (
          id, slug, title, description, status,
          created_by_user_id, updated_by_user_id,
          published_by_user_id, published_at
        )
        VALUES (
          ${randomUUID()}, 't0058-e2e', 'T-0058 E2E',
          'Синтетический production fixture для проверки student access.',
          'published', ${adminId}, ${adminId}, ${adminId}, now()
        )
        ON CONFLICT (slug) DO UPDATE SET
          status = 'published',
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          published_by_user_id = EXCLUDED.published_by_user_id,
          published_at = COALESCE(courses.published_at, now()),
          updated_at = now()
        RETURNING id
      `;
    }
    const courseId = courses[0]!.id;

    const password = randomBytes(32).toString("base64url");
    const passwordHash = await hashPassword(password);
    const users = await sql<Array<{ id: string }>>`
      INSERT INTO users (id, email, password_hash, role_id, status)
      VALUES (${randomUUID()}, ${STUDENT_EMAIL}, ${passwordHash}, 'student', 'active')
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role_id = 'student',
        status = 'active',
        blocked_at = null,
        updated_at = now()
      RETURNING id
    `;
    const studentId = users[0]?.id;
    if (!studentId) throw new Error("Student account не создан.");

    await sql`
      INSERT INTO course_memberships (
        course_id, user_id, status, granted_by_user_id,
        revoked_by_user_id, revoked_at
      )
      VALUES (${courseId}, ${studentId}, 'active', ${adminId}, null, null)
      ON CONFLICT (course_id, user_id) DO UPDATE SET
        status = 'active',
        granted_by_user_id = EXCLUDED.granted_by_user_id,
        revoked_by_user_id = null,
        revoked_at = null,
        updated_at = now()
    `;
    await sql`DELETE FROM auth_sessions WHERE user_id = ${studentId}`;

    await writeFile(
      outputPath,
      `${JSON.stringify({ email: STUDENT_EMAIL, password })}\n`,
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );
    await chmod(outputPath, 0o600);
    console.log("T-0058 production student подготовлен; credentials скрыты.");
  } finally {
    await sql.end();
  }
}

void main();
