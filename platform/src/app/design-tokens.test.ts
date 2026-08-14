import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Механизм, а не список случаев:
 * - каждый токен `--*-ink` обязан давать ≥ 4.5:1 на каждой фактической
 *   поверхности своей темы — новый ink-токен или сдвиг палитры проверяются
 *   автоматически;
 * - для каждого токена с ink-парой запрещена text-утилита декоративного
 *   значения (`text-brand`, `text-status-ready`, …) во всём src — заведомо
 *   новый consumer не может воспользоваться неконтрастным цветом.
 */

const platformRoot = fileURLToPath(new URL("../..", import.meta.url));
const globalsCss = readFileSync(
  path.join(platformRoot, "src/app/globals.css"),
  "utf8",
);

const SURFACE_TOKENS = [
  "background",
  "card",
  "popover",
  "secondary",
  "muted",
  "accent",
  "sidebar",
  "sidebar-accent",
  "brand-soft",
] as const;

function collectVariables(source: string, selector: string): Map<string, string> {
  const variables = new Map<string, string>();
  const blockPattern = new RegExp(
    `${selector.replace(/[.:]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
    "g",
  );
  for (const block of source.matchAll(blockPattern)) {
    for (const declaration of block[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) {
      variables.set(declaration[1], declaration[2].trim());
    }
  }
  return variables;
}

const lightTheme = collectVariables(globalsCss, ":root");
const darkTheme = new Map([
  ...lightTheme,
  ...collectVariables(globalsCss, ".dark"),
]);

function parseOpaqueHex(value: string, tokenName: string): [number, number, number] {
  const match = value.match(/^#([0-9a-f]{6})$/i);
  if (!match) {
    throw new Error(
      `Токен --${tokenName} должен быть непрозрачным hex #rrggbb, получено «${value}».`,
    );
  }
  const hex = match[1];
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrastRatio(foreground: string, background: string, label: string): number {
  const fg = relativeLuminance(parseOpaqueHex(foreground, label));
  const bg = relativeLuminance(parseOpaqueHex(background, label));
  const [lighter, darker] = fg > bg ? [fg, bg] : [bg, fg];
  return (lighter + 0.05) / (darker + 0.05);
}

const inkTokenNames = [...lightTheme.keys()].filter((name) =>
  name.endsWith("-ink"),
);

describe("контраст ink-токенов", () => {
  it("палитра содержит ink-токены (парсер CSS не сломан)", () => {
    expect(inkTokenNames.length).toBeGreaterThanOrEqual(2);
    for (const surface of SURFACE_TOKENS) {
      expect(lightTheme.has(surface), `нет токена --${surface}`).toBe(true);
    }
  });

  for (const [themeName, theme] of [
    ["light", lightTheme],
    ["dark", darkTheme],
  ] as const) {
    it(`каждый ink-токен даёт ≥ 4.5:1 на каждой поверхности (${themeName})`, () => {
      const failures: string[] = [];
      for (const ink of inkTokenNames) {
        const inkValue = theme.get(ink);
        expect(inkValue, `нет значения --${ink} в теме ${themeName}`).toBeDefined();
        for (const surface of SURFACE_TOKENS) {
          const surfaceValue = theme.get(surface);
          expect(surfaceValue, `нет значения --${surface}`).toBeDefined();
          const ratio = contrastRatio(
            inkValue as string,
            surfaceValue as string,
            `${ink}/${surface}`,
          );
          if (ratio < 4.5) {
            failures.push(
              `--${ink} на --${surface} (${themeName}): ${ratio.toFixed(2)}:1`,
            );
          }
        }
      }
      expect(failures, failures.join("; ")).toEqual([]);
    });
  }
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

describe("декоративные токены не используются как цвет текста", () => {
  it("для каждого токена с ink-парой text-утилита без -ink запрещена", () => {
    const decorativeBases = inkTokenNames
      .map((name) => name.replace(/-ink$/, ""))
      .filter((base) => lightTheme.has(base));
    expect(decorativeBases.length).toBeGreaterThanOrEqual(2);

    const violations: string[] = [];
    for (const filePath of walkSourceFiles(path.join(platformRoot, "src"))) {
      const content = readFileSync(filePath, "utf8");
      for (const base of decorativeBases) {
        const forbidden = new RegExp(`\\btext-${base}(?![\\w-])`);
        content.split("\n").forEach((line, index) => {
          if (forbidden.test(line)) {
            violations.push(
              `${path.relative(platformRoot, filePath)}:${index + 1} использует text-${base}; ` +
                `для текста используйте text-${base}-ink`,
            );
          }
        });
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
