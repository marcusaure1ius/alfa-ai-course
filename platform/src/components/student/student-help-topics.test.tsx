// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import {
  StudentHelpTopics,
  type StudentHelpTopic,
} from "./student-help-topics";

const topics: StudentHelpTopic[] = [
  {
    id: "course-access",
    title: "Курс ещё не открылся",
    description: "В обзоре нет программы.",
    steps: ["Обновите обзор.", "Войдите снова."],
    expected: "Программа появится.",
    fallback: "Передайте адрес аккаунта без пароля.",
    action: { href: "/student", label: "Проверить обзор" },
  },
  {
    id: "tool-problem",
    title: `Инструмент ${"с очень длинным названием ".repeat(8)}не открывается`,
    description: "Сервис показывает ошибку.",
    steps: ["Запишите точный текст ошибки."],
    expected: "Инструмент откроется.",
    fallback: "Подготовьте безопасное описание.",
    action: { href: "/student/tools", label: "Открыть инструменты" },
  },
];

beforeEach(() => {
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 1;
  });
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

describe("StudentHelpTopics", () => {
  it("opens and focuses a stable deep-linked topic", async () => {
    window.history.replaceState(null, "", "/student/help#tool-problem");
    render(<StudentHelpTopics topics={topics} />);

    const trigger = screen.getByRole("button", {
      name: /Инструмент с очень длинным названием/,
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(trigger);
    expect(screen.getByRole("heading", { name: "Что проверить" })).toBeTruthy();
    expect(screen.getByText("Ожидаемый результат")).toBeTruthy();
    expect(screen.getByText("Если не помогло")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Открыть инструменты" }).getAttribute(
        "href",
      ),
    ).toBe("/student/tools");
  });

  it("uses semantic heading buttons and keeps one topic open", () => {
    render(<StudentHelpTopics topics={topics} />);
    const course = screen.getByRole("button", { name: /Курс ещё не открылся/ });
    const tool = screen.getByRole("button", {
      name: /Инструмент с очень длинным названием/,
    });

    expect(course.closest("h2")).toBeTruthy();
    expect(course.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(course);
    expect(course.getAttribute("aria-expanded")).toBe("true");
    expect(window.location.hash).toBe("#course-access");
    fireEvent.click(tool);
    expect(course.getAttribute("aria-expanded")).toBe("false");
    expect(tool.getAttribute("aria-expanded")).toBe("true");
  });

  it("has no automated accessibility violations", async () => {
    const { container } = render(<StudentHelpTopics topics={topics} />);
    fireEvent.click(screen.getByRole("button", { name: /Курс ещё не открылся/ }));
    const results = await axe(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
