// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { parseCourseMarkdown, SafeMarkdown } from "./safe-markdown";

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

  it("does not turn an unsupported link protocol into an anchor", () => {
    const { container } = render(
      <SafeMarkdown source="[опасная ссылка](javascript:alert(1))" />,
    );
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("опасная ссылка");
  });

  it("renders source as React nodes without injecting markup", () => {
    const { container } = render(
      <SafeMarkdown source={"`<img src=x onerror=alert(1)>`"} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});
