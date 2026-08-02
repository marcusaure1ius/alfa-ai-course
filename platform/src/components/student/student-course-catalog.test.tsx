// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import type { StudentCourse } from "@/server/course/contracts";

import { StudentCourseCatalog } from "./student-course-catalog";

afterEach(cleanup);

const courses: StudentCourse[] = [
  {
    id: "agents",
    slug: "ai-agents",
    title: "ИИ-агенты: от идеи до первого рабочего сценария",
    description: "Практический курс по созданию первого ИИ-агента.",
    sections: [
      {
        id: "start",
        slug: "start",
        title: "Подготовка",
        position: 0,
        materials: [
          {
            id: "intro",
            slug: "intro",
            kind: "article",
            title: "Что такое ИИ-агент",
            summary: "Введение",
            position: 0,
            estimatedMinutes: 7,
            completedAt: null,
          },
        ],
      },
    ],
  },
  {
    id: "automation",
    slug: "automation",
    title: "Автоматизация процессов",
    description: "Второй доступный курс.",
    sections: [],
  },
];

describe("StudentCourseCatalog", () => {
  it("renders every course as a selectable program entry", () => {
    const { container } = render(<StudentCourseCatalog courses={courses} />);

    expect(
      screen.getByRole("heading", { name: "Мои курсы" }),
    ).toBeTruthy();
    expect(
      container.querySelector('a[href="/student/program?course=ai-agents"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('a[href="/student/program?course=automation"]'),
    ).toBeTruthy();
    expect(screen.getByText("Далее: Что такое ИИ-агент")).toBeTruthy();
    expect(screen.getByText("Программа готовится")).toBeTruthy();
    expect(screen.getByText("1 раздел")).toBeTruthy();
    expect(screen.getByText("Скоро начнётся")).toBeTruthy();
  });

  it("has no automated accessibility violations", async () => {
    const { container } = render(<StudentCourseCatalog courses={courses} />);
    const results = await axe(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
