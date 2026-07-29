import "server-only";

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { DatabaseSql } from "./client";

const migrationsDirectory = fileURLToPath(new URL("./migrations/", import.meta.url));

export type MigrationResult = {
  applied: string[];
  alreadyApplied: string[];
};

export async function runMigrations(sql: DatabaseSql): Promise<MigrationResult> {
  const filenames = (await readdir(migrationsDirectory))
    .filter((filename) => /^\d+.*\.sql$/.test(filename))
    .sort();
  const result: MigrationResult = { applied: [], alreadyApplied: [] };

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
