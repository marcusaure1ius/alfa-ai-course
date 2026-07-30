import "server-only";

import postgres, { type Sql, type TransactionSql } from "postgres";

type DatabaseSql = Sql<Record<string, never>>;
type DatabaseTransactionSql = TransactionSql<Record<string, never>>;

declare global {
  var coursePlatformSql: DatabaseSql | undefined;
}

export function createDatabaseClient(databaseUrl: string): DatabaseSql {
  if (!databaseUrl.startsWith("postgres://") && !databaseUrl.startsWith("postgresql://")) {
    throw new Error("DATABASE_URL должен быть PostgreSQL connection string.");
  }

  return postgres(databaseUrl, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
}

export function getDatabase(): DatabaseSql {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL не настроен.");
  }

  globalThis.coursePlatformSql ??= createDatabaseClient(databaseUrl);
  return globalThis.coursePlatformSql;
}

export type { DatabaseSql, DatabaseTransactionSql };
