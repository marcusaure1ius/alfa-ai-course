import { createDisposableDatabase } from "./disposable-database";

export default async function globalSetup(): Promise<() => Promise<void>> {
  const database = await createDisposableDatabase();

  process.env.DATABASE_URL = database.databaseUrl;
  process.env.INTEGRATION_TEST_DATABASE_URL = database.databaseUrl;

  // Среда прогона детерминирована и не зависит от ambient shell/CI окружения.
  process.env.AUTH_SECRET ??=
    "integration-example-not-a-secret-32-characters";
  process.env.APP_ORIGIN ??= "http://localhost:3000";
  process.env.VERCEL_ENV ??= "development";

  return database.drop;
}
