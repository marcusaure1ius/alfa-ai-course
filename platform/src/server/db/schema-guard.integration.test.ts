import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabaseClient, type DatabaseSql } from "./client";
import { assertSchemaUpToDate, runMigrations } from "./migrate";

import {
  createDisposableDatabase,
  type DisposableDatabase,
} from "../../../test/integration/disposable-database";

/**
 * Suite поднимает СВОЮ одноразовую базу: он проверяет поведение на пустой и
 * на повреждённой схеме, поэтому не может делить базу прогона с остальными
 * тестами. Боевая база при этом недостижима по построению — guard одноразовой
 * базы пускает только loopback (T-0141).
 */
let database: DisposableDatabase;
let sql: DatabaseSql;

beforeAll(async () => {
  database = await createDisposableDatabase();
  sql = createDatabaseClient(database.databaseUrl);
}, 30_000);

afterAll(async () => {
  await sql?.end();
  await database?.drop();
});

describe("assertSchemaUpToDate", () => {
  it("на пустой базе отказывается работать и не создаёт реестр миграций", async () => {
    await expect(assertSchemaUpToDate(sql)).rejects.toThrow(
      /нет таблицы schema_migrations/,
    );

    const registry = await sql<{ present: boolean }[]>`
      SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present
    `;
    expect(registry[0]!.present).toBe(false);
  });

  it("проходит на актуальной схеме", async () => {
    await runMigrations(sql);
    await expect(assertSchemaUpToDate(sql)).resolves.toBeUndefined();
  });

  it("называет конкретный неприменённый файл и не применяет его сам", async () => {
    const [removed] = await sql<{ filename: string }[]>`
      DELETE FROM schema_migrations
      WHERE filename = (SELECT max(filename) FROM schema_migrations)
      RETURNING filename
    `;
    expect(removed?.filename).toBeTruthy();

    await expect(assertSchemaUpToDate(sql)).rejects.toThrow(
      new RegExp(`не применены: ${removed!.filename}`),
    );

    // Проверка обязана быть read-only: запись не восстановлена молча.
    const rows = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM schema_migrations
      WHERE filename = ${removed!.filename}
    `;
    expect(rows[0]!.count).toBe(0);

    await sql`
      INSERT INTO schema_migrations (filename, checksum)
      SELECT ${removed!.filename}, repeat('f', 64)
    `;
  });

  it("ловит миграцию, изменённую после применения", async () => {
    const [target] = await sql<{ filename: string }[]>`
      UPDATE schema_migrations
      SET checksum = repeat('0', 64)
      WHERE filename = (SELECT min(filename) FROM schema_migrations)
      RETURNING filename
    `;
    await expect(assertSchemaUpToDate(sql)).rejects.toThrow(
      new RegExp(`изменены после применения: ${target!.filename}`),
    );
  });
});
