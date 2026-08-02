// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import type {
  StudentCourse,
  StudentMaterialSummary,
} from "@/server/course/contracts";

import { StudentProgramView } from "./student-program-view";

afterEach(cleanup);

function material(
  id: string,
  overrides: Partial<StudentMaterialSummary> = {},
): StudentMaterialSummary {
  return {
    id,
    slug: id,
    kind: "article",
    title: `Материал ${id}`,
    summary: "Короткое описание материала.",
    position: 0,
    estimatedMinutes: 5,
    completedAt: null,
    ...overrides,
  };
}

function course(
  sections: StudentCourse["sections"],
  overrides: Partial<StudentCourse> = {},
): StudentCourse {
  return {
    id: "course",
    slug: "course",
    title: "Сборка курса",
    description: "Последовательная программа интенсива.",
    sections,
    ...overrides,
  };
}

const partialCourse = course([
  {
    id: "start",
    slug: "start",
    title: "Подготовка",
    position: 0,
    materials: [
      material("done", {
        title: "Уже пройдено",
        completedAt: "2026-08-01T10:00:00.000Z",
      }),
      material("next", { title: "Следующий шаг", position: 1 }),
      material("later", { title: "Дальше по программе", position: 2 }),
    ],
  },
]);

describe("StudentProgramView", () => {
  it("renders one compact state for a course without published materials", () => {
    const { container } = render(StudentProgramView({ course: course([]) }));

    expect(
      screen.getByRole("heading", { name: "Программа готовится" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Разделы курса" }),
    ).toBeNull();
    expect(container.querySelector('a[href="/student/program"]')).toBeNull();
    expect(
      screen.getByRole("link", { name: "Все курсы" }).getAttribute("href"),
    ).toBe("/student");
    expect(container.querySelectorAll("section")).toHaveLength(1);
  });

  it("distinguishes completed, next and available materials with text", () => {
    const { container } = render(
      <StudentProgramView course={partialCourse} />,
    );

    expect(
      screen.getByRole("heading", { name: "Следующий шаг" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Открыть материал" }).getAttribute("href"),
    ).toBe("/student/materials/next");
    expect(screen.getByText("Завершено")).toBeTruthy();
    expect(screen.getByText("Следующий")).toBeTruthy();
    expect(screen.getByText("Доступно")).toBeTruthy();

    const current = container.querySelector('[aria-current="step"]');
    expect(current?.getAttribute("href")).toBe("/student/materials/next");
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText("1 из 3 завершено")).toBeNull();
  });

  it("shows a terminal state without inventing a current material", () => {
    const completeCourse: StudentCourse = {
      ...partialCourse,
      sections: partialCourse.sections.map((section) => ({
        ...section,
        materials: section.materials.map((item) => ({
          ...item,
          completedAt: "2026-08-01T10:00:00.000Z",
        })),
      })),
    };
    const { container } = render(
      <StudentProgramView course={completeCourse} />,
    );

    expect(
      screen.getByRole("heading", { name: "Все материалы пройдены" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Открыть материал" }),
    ).toBeNull();
    expect(container.querySelector('[aria-current="step"]')).toBeNull();
    expect(screen.getAllByText("Завершено")).toHaveLength(3);
  });

  it("keeps empty sections explicit inside a non-empty program", () => {
    render(
      <StudentProgramView
        course={course([
          {
            id: "empty",
            slug: "empty",
            title: "Раздел готовится",
            position: 0,
            materials: [],
          },
          {
            id: "ready",
            slug: "ready",
            title: "Доступный раздел",
            position: 1,
            materials: [material("ready-material")],
          },
        ])}
      />,
    );

    expect(
      screen.getByText("Материалы этого раздела ещё не опубликованы."),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Раздел готовится" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("navigation", {
        name: "Быстрый переход по разделам",
      }),
    ).toBeNull();
  });

  it("shows sections once and keeps a direct next action for 30+ materials", () => {
    const sections: StudentCourse["sections"] = Array.from(
      { length: 4 },
      (_, sectionIndex) => ({
        id: `section-${sectionIndex}`,
        slug: `section-${sectionIndex}`,
        title: `Большой раздел ${sectionIndex + 1}`,
        position: sectionIndex,
        materials: Array.from({ length: 8 }, (_, materialIndex) =>
          material(`s${sectionIndex}-m${materialIndex}`, {
            position: materialIndex,
          }),
        ),
      }),
    );
    render(<StudentProgramView course={course(sections)} />);

    expect(
      screen.queryByRole("navigation", {
        name: "Быстрый переход по разделам",
      }),
    ).toBeNull();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(4);
    expect(
      screen.getByRole("link", { name: "Открыть материал" }).getAttribute("href"),
    ).toBe("/student/materials/s0-m0");
  });

  it("has no automated accessibility violations", async () => {
    const { container } = render(
      <StudentProgramView course={partialCourse} />,
    );
    const results = await axe(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
