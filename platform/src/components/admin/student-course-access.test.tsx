// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudentCourseAccess } from "./student-course-access";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(cleanup);

describe("StudentCourseAccess", () => {
  it("shows every active membership as revocable", () => {
    render(
      <StudentCourseAccess
        studentId="student-1"
        currentCourseIds={["course-1", "course-2"]}
        courses={[
          { id: "course-1", title: "Первый курс", status: "published" },
          { id: "course-2", title: "Второй курс", status: "published" },
          { id: "course-3", title: "Третий курс", status: "draft" },
        ]}
      />,
    );

    expect(
      screen.getAllByRole("button", { name: "Отозвать доступ" }),
    ).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Открыть доступ" }),
    ).toBeTruthy();
  });
});
