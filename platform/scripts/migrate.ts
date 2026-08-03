import { createDatabaseClient } from "../src/server/db/client";
import { runMigrations } from "../src/server/db/migrate";

function printHelp(): void {
  console.log(`Применить versioned PostgreSQL migrations.

Использование:
  npm run db:migrate
  npm run db:migrate -- --help

Переменные:
  DATABASE_URL_UNPOOLED  direct connection только для migrations (приоритет)
  DATABASE_URL           fallback connection

Команда не печатает connection strings или другие secrets.`);
}

async function main(): Promise<void> {
  const arguments_ = process.argv.slice(2);
  if (arguments_.includes("--help")) {
    printHelp();
    return;
  }
  if (arguments_.length > 0) {
    throw new Error(`Неизвестный аргумент: ${arguments_[0]}`);
  }
  const databaseUrl =
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL_UNPOOLED или DATABASE_URL должны быть настроены.",
    );
  }
  const sql = createDatabaseClient(databaseUrl);

  try {
    const result = await runMigrations(sql);
    const applied =
      result.applied.length > 0 ? result.applied.join(", ") : "нет";
    const skipped =
      result.skipped.length > 0 ? result.skipped.join(", ") : "нет";
    console.log(
      `Миграции применены: ${applied}. Пропущены как необязательные: ${skipped}. Уже были применены: ${result.alreadyApplied.length}.`,
    );
  } finally {
    await sql.end();
  }
}

void main();
