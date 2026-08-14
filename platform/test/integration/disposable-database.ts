import { randomBytes } from "node:crypto";

import postgres from "postgres";

import {
  assertSafeTestServerUrl,
  buildDisposableDatabaseUrl,
  DISPOSABLE_DATABASE_PREFIX,
} from "./database-guard";

export const DEFAULT_TEST_SERVER_URL =
  "postgresql://platform:local-example-not-a-secret@127.0.0.1:55432/course_platform";

export type DisposableDatabase = {
  databaseName: string;
  databaseUrl: string;
  drop: () => Promise<void>;
};

function createAdminClient(serverUrl: string) {
  return postgres(serverUrl, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
  });
}

/**
 * Единственный способ получить базу для деструктивных тестов: создаётся
 * одноразовая БД на loopback-сервере и удаляется вызовом drop(). Любой
 * не-loopback сервер отклоняется до первого подключения.
 */
export async function createDisposableDatabase(
  serverUrl: string = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_SERVER_URL,
): Promise<DisposableDatabase> {
  assertSafeTestServerUrl(serverUrl);

  const databaseName = `${DISPOSABLE_DATABASE_PREFIX}${randomBytes(8).toString("hex")}`;
  const admin = createAdminClient(serverUrl);
  try {
    await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
  } catch (error) {
    throw new Error(
      "Не удалось создать одноразовую тестовую базу. Проверьте, что локальный " +
        "PostgreSQL запущен: docker compose -f compose.dev.yml up -d " +
        `(сервер: ${serverUrl.replace(/\/\/[^@]*@/, "//***@")}).`,
      { cause: error },
    );
  } finally {
    await admin.end();
  }

  return {
    databaseName,
    databaseUrl: buildDisposableDatabaseUrl(serverUrl, databaseName),
    async drop() {
      const teardown = createAdminClient(serverUrl);
      try {
        await teardown.unsafe(
          `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
        );
      } finally {
        await teardown.end();
      }
    },
  };
}
