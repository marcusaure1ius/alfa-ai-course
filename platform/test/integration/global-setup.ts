import { randomBytes } from "node:crypto";

import postgres from "postgres";

import {
  assertSafeTestServerUrl,
  buildDisposableDatabaseUrl,
  DISPOSABLE_DATABASE_PREFIX,
} from "./database-guard";

const DEFAULT_TEST_SERVER_URL =
  "postgresql://platform:local-example-not-a-secret@127.0.0.1:55432/course_platform";

function createAdminClient(serverUrl: string) {
  return postgres(serverUrl, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
  });
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  const serverUrl = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_SERVER_URL;
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

  const disposableUrl = buildDisposableDatabaseUrl(serverUrl, databaseName);
  process.env.DATABASE_URL = disposableUrl;
  process.env.INTEGRATION_TEST_DATABASE_URL = disposableUrl;

  // Среда прогона детерминирована и не зависит от ambient shell/CI окружения.
  process.env.AUTH_SECRET ??=
    "integration-example-not-a-secret-32-characters";
  process.env.APP_ORIGIN ??= "http://localhost:3000";
  process.env.VERCEL_ENV ??= "development";

  return async () => {
    const teardown = createAdminClient(serverUrl);
    try {
      await teardown.unsafe(
        `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
      );
    } finally {
      await teardown.end();
    }
  };
}
