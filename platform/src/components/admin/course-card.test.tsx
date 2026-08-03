// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CourseCard } from "./course-card";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(cleanup);

const course = {
  id: "course-1",
  title: "Автоматизация бизнеса",
  slug: "avtomatizatsiya-biznesa",
  description: "Практический курс по созданию рабочих процессов",
  status: "draft" as const,
};

describe("CourseCard", () => {
  it("makes the whole course tile a link to its selected program", () => {
    render(
      <CourseCard
        course={course}
        sectionCount={2}
        materialCount={5}
        coverIndex={0}
      />,
    );

    const card = screen.getByRole("link", { name: "Автоматизация бизнеса" });
    expect(card.getAttribute("href")).toBe("/admin/program?course=course-1");
    expect(card.parentElement?.className).toContain("hover:-translate-y-1");
    expect(card.parentElement?.className).toContain(
      "motion-reduce:hover:translate-y-0",
    );
    expect(screen.getByRole("button", { name: "Настроить" })).toBeTruthy();
  });

  it("shows status, address and naturally grouped course counts", () => {
    render(
      <CourseCard
        course={course}
        sectionCount={2}
        materialCount={5}
        coverIndex={1}
      />,
    );

    expect(screen.getByText("Черновик")).toBeTruthy();
    expect(screen.getByText("/avtomatizatsiya-biznesa")).toBeTruthy();
    expect(screen.getByText("2 раздела")).toBeTruthy();
    expect(screen.getByText("5 заданий")).toBeTruthy();
  });

  it("uses the educational palette for course covers", () => {
    const { container } = render(
      <CourseCard
        course={course}
        sectionCount={0}
        materialCount={0}
        coverIndex={3}
      />,
    );

    expect(container.querySelector(".bg-chart-5")).toBeTruthy();
    expect(screen.getByText("0 разделов")).toBeTruthy();
    expect(screen.getByText("0 заданий")).toBeTruthy();
  });
});
