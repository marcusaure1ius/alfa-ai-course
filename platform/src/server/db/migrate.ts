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

export async function runMigrations(
  sql: DatabaseSql,
): Promise<MigrationResult> {
  const filenames = (await readdir(migrationsDirectory))
    .filter((filename) => /^\d+.*\.sql$/.test(filename))
    .sort();
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
    const checksum = createHash("sha256").update(source).digest("hex");

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
