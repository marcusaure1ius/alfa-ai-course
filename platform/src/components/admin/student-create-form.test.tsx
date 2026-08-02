// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudentCreateForm } from "./student-create-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(cleanup);

describe("StudentCreateForm", () => {
  it("explains that a draft course stays unavailable until publication", () => {
    render(
      <StudentCreateForm
        courses={[
          { id: "published", title: "Готовый курс", status: "published" },
          { id: "draft", title: "Новый курс", status: "draft" },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Добавить ученика" }));

    const course = screen.getByLabelText("Курс");
    expect(screen.getByRole("option", { name: "Новый курс — черновик" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();

    fireEvent.change(course, { target: { value: "draft" } });

    expect(screen.getByRole("status").textContent).toContain(
      "Курс ещё не опубликован. Аккаунт создастся, но ученик не увидит программу и материалы, пока вы не опубликуете курс.",
    );
    expect(course.getAttribute("aria-describedby")).toBe(
      "student-course-help student-course-draft-warning",
    );

    fireEvent.change(course, { target: { value: "published" } });

    expect(screen.queryByRole("status")).toBeNull();
    expect(course.getAttribute("aria-describedby")).toBe("student-course-help");
  });
});
