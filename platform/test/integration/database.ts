import { assertDisposableDatabaseUrl } from "./database-guard";

/**
 * Единственный разрешённый источник connection string для деструктивных
 * integration/workflow тестов. Переменную выставляет только глобальный
 * bootstrap (test/integration/global-setup.ts), создающий одноразовую базу.
 */
export function requireIntegrationDatabaseUrl(): string {
  const url = process.env.INTEGRATION_TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "Одноразовая тестовая база не создана: INTEGRATION_TEST_DATABASE_URL отсутствует. " +
        "Запускайте деструктивные тесты только через npm run test:integration " +
        "или npm run test:workflow — их конфигурация выполняет безопасный bootstrap.",
    );
  }
  assertDisposableDatabaseUrl(url);
  return url;
}
