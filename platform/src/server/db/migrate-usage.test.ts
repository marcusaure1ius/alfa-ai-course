import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Схему боевой базы меняет только migration gate. Операционный скрипт,
 * применяющий миграции сам, способен обогнать деплой и оставить прод со
 * схемой, которой ещё нет в рантайме (T-0148).
 *
 * Проверка ловит класс, а не известные файлы: любой НОВЫЙ скрипт, который
 * позовёт runMigrations, покраснит тест, пока его явно не внесут в список
 * разрешённых вместе с обоснованием.
 */
const platformRoot = fileURLToPath(new URL("../../..", import.meta.url));

/** Применять миграции вправе только gate и код, работающий с одноразовой БД. */
const ALLOWED = new Set([
  // Сам модуль миграций.
  "src/server/db/migrate.ts",
  // Migration gate: npm run db:migrate, он же шаг сборки платформы.
  "scripts/migrate.ts",
  // Сидер E2E: поднимает схему в одноразовой базе прогона, не в боевой.
  "test/e2e/seed.ts",
]);

const SCANNED_DIRECTORIES = ["scripts", "src", "test"];

function* walkFiles(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(fullPath);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      yield fullPath;
    }
  }
}

describe("применение миграций ограничено migration gate", () => {
  it("runMigrations не вызывается вне разрешённого списка", () => {
    const violations: string[] = [];
    for (const directory of SCANNED_DIRECTORIES) {
      for (const filePath of walkFiles(path.join(platformRoot, directory))) {
        const relativePath = path.relative(platformRoot, filePath);
        // Тесты работают с одноразовой базой прогона (T-0141) и схему боевой
        // базы затронуть не могут.
        if (/\.test\.(ts|tsx)$/.test(relativePath)) continue;
        if (ALLOWED.has(relativePath)) continue;
        if (readFileSync(filePath, "utf8").includes("runMigrations")) {
          violations.push(relativePath);
        }
      }
    }
    expect(
      violations,
      `Эти файлы применяют миграции сами: ${violations.join(", ")}. ` +
        "Операционным скриптам нужна assertSchemaUpToDate, а не runMigrations.",
    ).toEqual([]);
  });

  it("список разрешённых не протух: каждый файл существует и правда зовёт миграции", () => {
    for (const relativePath of ALLOWED) {
      const content = readFileSync(path.join(platformRoot, relativePath), "utf8");
      expect(content, `${relativePath} больше не использует runMigrations`).toContain(
        "runMigrations",
      );
    }
  });

  it("операционные скрипты проверяют схему вместо её изменения", () => {
    const operational = [
      "scripts/t0058-production-student.ts",
      "scripts/timeweb-plain-vps-smoke.ts",
      "scripts/timeweb-n8n-install-smoke.ts",
    ];
    for (const relativePath of operational) {
      const content = readFileSync(path.join(platformRoot, relativePath), "utf8");
      expect(content, `${relativePath} не проверяет схему`).toContain(
        "assertSchemaUpToDate",
      );
    }
  });
});
