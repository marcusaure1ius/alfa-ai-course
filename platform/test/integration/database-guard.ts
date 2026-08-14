/**
 * Защита деструктивных тестов от рабочих баз данных.
 *
 * Инварианты класса, а не списка известных значений:
 * - тестовый PostgreSQL-сервер обязан слушать на loopback: любой внешний
 *   host (dev, staging, production, managed-провайдер) отклоняется по
 *   построению, независимо от его имени;
 * - TRUNCATE выполняется только в одноразовой базе, которую bootstrap сам
 *   создал под префиксом DISPOSABLE_DATABASE_PREFIX и удалит после прогона.
 */

export const DISPOSABLE_DATABASE_PREFIX = "course_platform_test_";

export class UnsafeTestDatabaseError extends Error {}

function parsePostgresUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UnsafeTestDatabaseError(
      "TEST_DATABASE_URL не разбирается как URL. Ожидается PostgreSQL connection string.",
    );
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new UnsafeTestDatabaseError(
      `TEST_DATABASE_URL имеет схему «${parsed.protocol}», ожидается postgres:// или postgresql://.`,
    );
  }
  return parsed;
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host === "::1") {
    return true;
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) {
    return false;
  }
  const octets = ipv4.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) {
    return false;
  }
  return octets[0] === 127;
}

export function assertSafeTestServerUrl(rawUrl: string): URL {
  const parsed = parsePostgresUrl(rawUrl);
  if (!isLoopbackHost(parsed.hostname)) {
    throw new UnsafeTestDatabaseError(
      `Тестовый PostgreSQL обязан быть на loopback (localhost, 127.0.0.0/8, ::1), получен host «${parsed.hostname}». ` +
        "Деструктивные тесты не запускаются против внешних серверов.",
    );
  }
  return parsed;
}

export function databaseNameFromUrl(url: URL): string {
  return decodeURIComponent(url.pathname.replace(/^\//, ""));
}

export function assertDisposableDatabaseUrl(rawUrl: string): URL {
  const parsed = assertSafeTestServerUrl(rawUrl);
  const databaseName = databaseNameFromUrl(parsed);
  if (!databaseName.startsWith(DISPOSABLE_DATABASE_PREFIX)) {
    throw new UnsafeTestDatabaseError(
      `База «${databaseName}» не является одноразовой тестовой базой ` +
        `(ожидается префикс «${DISPOSABLE_DATABASE_PREFIX}»). TRUNCATE в ней запрещён.`,
    );
  }
  return parsed;
}

export function buildDisposableDatabaseUrl(
  serverUrl: string,
  databaseName: string,
): string {
  const parsed = assertSafeTestServerUrl(serverUrl);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}
