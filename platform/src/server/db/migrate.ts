import "server-only";

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { DatabaseSql } from "./client";

const migrationsDirectory = fileURLToPath(
  new URL("./migrations/", import.meta.url),
);
const optionalProductionSeed = "0015_seed_sborka_kursa.sql";

export type MigrationResult = {
  applied: string[];
  alreadyApplied: string[];
  skipped: string[];
};

async function migrationFilenames(): Promise<string[]> {
  return (await readdir(migrationsDirectory))
    .filter((filename) => /^\d+.*\.sql$/.test(filename))
    .sort();
}

async function migrationChecksum(filename: string): Promise<string> {
  const source = await readFile(`${migrationsDirectory}/${filename}`, "utf8");
  return createHash("sha256").update(source).digest("hex");
}

/**
 * Проверяет, что схема базы уже содержит все миграции этого дерева, и НИЧЕГО
 * не меняет: ни одной DDL-команды, включая создание schema_migrations.
 *
 * Нужна операционным скриптам (выдача fixture, smoke-прогоны). Схему меняет
 * только migration gate `npm run db:migrate` перед сборкой платформы; если бы
 * операционный скрипт применял миграции сам, он мог бы обогнать деплой и
 * оставить боевую базу со схемой, которой ещё нет в рантайме.
 */
export async function assertSchemaUpToDate(sql: DatabaseSql): Promise<void> {
  const registry = await sql<{ present: boolean }[]>`
    SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present
  `;
  if (!registry[0]?.present) {
    throw new Error(
      "В базе нет таблицы schema_migrations: миграции ни разу не применялись. " +
        "Операционные скрипты схему не меняют — выполните npm run db:migrate " +
        "(или дождитесь деплоя платформы) и повторите.",
    );
  }

  const recorded = new Map(
    (
      await sql<{ filename: string; checksum: string }[]>`
        SELECT filename, checksum FROM schema_migrations
      `
    ).map((row) => [row.filename, row.checksum]),
  );

  const missing: string[] = [];
  const changed: string[] = [];
  for (const filename of await migrationFilenames()) {
    const checksum = await migrationChecksum(filename);
    const applied = recorded.get(filename);
    if (applied === undefined) missing.push(filename);
    else if (applied !== checksum) changed.push(filename);
  }

  if (missing.length > 0 || changed.length > 0) {
    const details = [
      missing.length > 0 ? `не применены: ${missing.join(", ")}` : null,
      changed.length > 0 ? `изменены после применения: ${changed.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("; ");
    throw new Error(
      `Схема базы отстаёт от кода (${details}). Операционные скрипты схему не ` +
        "меняют — примените миграции штатным путём (npm run db:migrate или " +
        "деплой платформы) и повторите.",
    );
  }
}

export async function runMigrations(
  sql: DatabaseSql,
): Promise<MigrationResult> {
  const filenames = await migrationFilenames();
  const result: MigrationResult = {
    applied: [],
    alreadyApplied: [],
    skipped: [],
  };

  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      checksum char(64) NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  for (const filename of filenames) {
    const source = await readFile(`${migrationsDirectory}/${filename}`, "utf8");
    const checksum = await migrationChecksum(filename);

    await sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(490050)`;
      const existing = await transaction<{ checksum: string }[]>`
        SELECT checksum
        FROM schema_migrations
        WHERE filename = ${filename}
      `;

      if (existing.length > 0) {
        if (existing[0]?.checksum !== checksum) {
          throw new Error(`Миграция ${filename} изменена после применения.`);
        }
        result.alreadyApplied.push(filename);
        return;
      }

      // T-0108 is a one-off production data release whose immutable checksum is
      // already recorded in production. Fresh installs and CI do not contain
      // its exact admin/student prerequisites and must permanently skip it
      // instead of failing now or importing it later after account creation.
      if (filename === optionalProductionSeed) {
        const prerequisites = await transaction<{ ready: boolean }[]>`
          SELECT
            EXISTS (
              SELECT 1 FROM users
              WHERE role_id = 'admin' AND status = 'active'
            )
            AND EXISTS (
              SELECT 1 FROM users
              WHERE lower(email) = 'test-student@neurokurs.ru'
                AND role_id = 'student'
                AND status = 'active'
            ) AS ready
        `;

        if (!prerequisites[0]?.ready) {
          await transaction`
            INSERT INTO schema_migrations (filename, checksum)
            VALUES (${filename}, ${checksum})
          `;
          result.skipped.push(filename);
          return;
        }
      }

      await transaction.unsafe(source);
      await transaction`
        INSERT INTO schema_migrations (filename, checksum)
        VALUES (${filename}, ${checksum})
      `;
      result.applied.push(filename);
    });
  }

  return result;
}
