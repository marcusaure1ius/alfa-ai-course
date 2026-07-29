import { getDatabase } from "../src/server/db/client";
import { runMigrations } from "../src/server/db/migrate";

async function main(): Promise<void> {
  const sql = getDatabase();

  try {
    const result = await runMigrations(sql);
    const applied = result.applied.length > 0 ? result.applied.join(", ") : "нет";
    console.log(`Миграции применены: ${applied}. Уже были применены: ${result.alreadyApplied.length}.`);
  } finally {
    await sql.end();
  }
}

void main();
