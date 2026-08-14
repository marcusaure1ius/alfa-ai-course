import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { formatCount, pluralWord } from "./plural";

const SECTION = { one: "раздел", few: "раздела", many: "разделов" };
const TASK = { one: "задание", few: "задания", many: "заданий" };

describe("formatCount", () => {
  it("склоняет по всей матрице русских форм", () => {
    const expectations: Array<[number, string, string]> = [
      [0, "0 разделов", "0 заданий"],
      [1, "1 раздел", "1 задание"],
      [2, "2 раздела", "2 задания"],
      [4, "4 раздела", "4 задания"],
      [5, "5 разделов", "5 заданий"],
      [11, "11 разделов", "11 заданий"],
      [12, "12 разделов", "12 заданий"],
      [14, "14 разделов", "14 заданий"],
      [21, "21 раздел", "21 задание"],
      [22, "22 раздела", "22 задания"],
      [25, "25 разделов", "25 заданий"],
      [111, "111 разделов", "111 заданий"],
      [122, "122 раздела", "122 задания"],
      [1001, "1001 раздел", "1001 задание"],
    ];
    for (const [count, sectionLabel, taskLabel] of expectations) {
      expect(formatCount(count, SECTION)).toBe(sectionLabel);
      expect(formatCount(count, TASK)).toBe(taskLabel);
    }
  });

  it("отрицательные значения склоняются по модулю", () => {
    expect(pluralWord(-1, SECTION)).toBe("раздел");
    expect(pluralWord(-2, SECTION)).toBe("раздела");
    expect(pluralWord(-5, SECTION)).toBe("разделов");
  });
});

function* walkSourceFiles(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walkSourceFiles(fullPath);
    } else if (
      /\.(ts|tsx)$/.test(entry.name) &&
      !/\.test\.(ts|tsx)$/.test(entry.name)
    ) {
      yield fullPath;
    }
  }
}

describe("единственная реализация склонения", () => {
  const srcRoot = fileURLToPath(new URL("..", import.meta.url));
  const allowed = path.join(srcRoot, "lib/plural.ts");

  function collectViolations(
    describeViolation: (content: string, relativePath: string) => string | null,
  ): string[] {
    const violations: string[] = [];
    for (const filePath of walkSourceFiles(srcRoot)) {
      if (filePath === allowed) continue;
      const found = describeViolation(
        readFileSync(filePath, "utf8"),
        path.relative(srcRoot, filePath),
      );
      if (found) violations.push(found);
    }
    return violations;
  }

  it("Intl.PluralRules не создаётся вне src/lib/plural.ts", () => {
    const violations = collectViolations((content, relativePath) =>
      content.includes("Intl.PluralRules") ? relativePath : null,
    );
    expect(violations, violations.join(", ")).toEqual([]);
  });

  it("нет тернарного выбора русской словоформы по count === 1", () => {
    const ternary = /[=!]==?\s*1\s*\?\s*["'`][^"'`\n]*[а-яё]/i;
    const violations = collectViolations((content, relativePath) => {
      const lines = content.split("\n");
      const hit = lines.findIndex((line) => ternary.test(line));
      return hit >= 0 ? `${relativePath}:${hit + 1}` : null;
    });
    expect(violations, violations.join(", ")).toEqual([]);
  });

  it("нет самодельного mod10/mod100 склонения", () => {
    const violations = collectViolations((content, relativePath) =>
      /%\s*10\b/.test(content) && /%\s*100\b/.test(content)
        ? relativePath
        : null,
    );
    expect(violations, violations.join(", ")).toEqual([]);
  });
});
