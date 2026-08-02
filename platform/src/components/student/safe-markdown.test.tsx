// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  COURSE_MARKDOWN_SUBSET,
  hasCourseMarkdownContent,
  parseCourseMarkdown,
  SafeMarkdown,
} from "./safe-markdown";

afterEach(cleanup);

describe("SafeMarkdown", () => {
  it("keeps heading hierarchy and builds local navigation", () => {
    const parsed = parseCourseMarkdown(
      "# Контекст\n\nТекст.\n\n## Следующий шаг\n\n- Один\n- Два",
    );
    expect(parsed.toc).toEqual([
      { id: "контекст", label: "Контекст", level: 2 },
      { id: "следующий-шаг", label: "Следующий шаг", level: 2 },
    ]);
    render(<SafeMarkdown source={"# Контекст\n\nТекст."} />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Контекст" }),
    ).toBeTruthy();
  });

  it("adds stable suffixes to repeated heading anchors", () => {
    const parsed = parseCourseMarkdown(
      "## Практика\n\nПервый шаг.\n\n## Практика\n\nВторой шаг.\n\n## Практика",
    );

    expect(parsed.toc).toEqual([
      { id: "практика", label: "Практика", level: 2 },
      { id: "практика-2", label: "Практика", level: 2 },
      { id: "практика-3", label: "Практика", level: 2 },
    ]);
  });

  it("avoids collisions with naturally suffixed headings", () => {
    const parsed = parseCourseMarkdown(
      "## Практика\n\n## Практика-2\n\n## Практика\n\n## Практика-2",
    );

    expect(parsed.toc.map((item) => item.id)).toEqual([
      "практика",
      "практика-2",
      "практика-3",
      "практика-2-2",
    ]);
  });

  it("does not turn an unsupported link protocol into an anchor", () => {
    const { container } = render(
      <SafeMarkdown source="[опасная ссылка](javascript:alert(1))" />,
    );
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("опасная ссылка");
  });

  it("rejects protocol-relative and credential-bearing links", () => {
    const { container } = render(
      <SafeMarkdown
        source={
          "[внешняя](//example.test/path) [секрет](https://user:password@example.test/path)"
        }
      />,
    );
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("внешняя");
    expect(container.textContent).toContain("секрет");
  });

  it("keeps plain and language-tagged fences separate from following content", () => {
    const source = [
      "```",
      "plain text",
      "```",
      "",
      "```bash",
      "npm run test",
      "```",
      "",
      "## После кода",
      "",
      "Обычный текст.",
      "",
      "```json",
      '{\"ok\":true}',
      "```",
    ].join("\n");
    const { container } = render(<SafeMarkdown source={source} />);

    expect(container.querySelectorAll("pre")).toHaveLength(3);
    expect(container.querySelector('pre[data-language="bash"]')?.textContent).toBe(
      "npm run test",
    );
    expect(container.querySelector('pre[data-language="json"]')?.textContent).toBe(
      '{"ok":true}',
    );
    expect(
      screen.getByRole("heading", { name: "После кода", level: 2 }),
    ).toBeTruthy();
    expect(screen.getByText("Обычный текст.")).toBeTruthy();
  });

  it("renders an unclosed fence as bounded code through the end of source", () => {
    const { container } = render(
      <SafeMarkdown source={"```bash\necho one\necho two"} />,
    );
    expect(container.querySelectorAll("pre")).toHaveLength(1);
    expect(container.querySelector("code")?.textContent).toBe(
      "echo one\necho two",
    );
  });

  it("renders the documented table subset in its own scroll region", () => {
    expect(COURSE_MARKDOWN_SUBSET).toContain("pipe-tables");
    render(
      <SafeMarkdown
        source={
          "| Шаг | Результат |\n| --- | --- |\n| Проверить | Работает |\n| Повторить | Готово |"
        }
      />,
    );

    const tableRegion = screen.getByRole("region", {
      name: "Таблица материала",
    });
    expect(tableRegion.querySelector("table")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Шаг" })).toBeTruthy();
    expect(screen.getByText("Работает")).toBeTruthy();
  });

  it("shows an explicit state for an empty published body", () => {
    expect(hasCourseMarkdownContent("  \n")).toBe(false);
    expect(hasCourseMarkdownContent("Готовый материал")).toBe(true);
    render(<SafeMarkdown source={"  \n"} />);
    expect(
      screen.getByText(
        "Содержимое материала готовится. Оно появится здесь после публикации.",
      ),
    ).toBeTruthy();
  });

  it("renders source as React nodes without injecting markup", () => {
    const { container } = render(
      <SafeMarkdown source={"`<img src=x onerror=alert(1)>`"} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});
