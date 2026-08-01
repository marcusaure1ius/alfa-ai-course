import { describe, expect, it } from "vitest";

import type { StudentCourse } from "@/server/course/contracts";
import {
  displayStudentName,
  getCourseProgress,
  studentInitial,
} from "./student-course";

const course: StudentCourse = {
  id: "course",
  slug: "neurokurs",
  title: "Neurokurs",
  description: "",
  sections: [
    {
      id: "section",
      slug: "start",
      title: "Начало",
      position: 0,
      materials: [
        {
          id: "one",
          slug: "one",
          kind: "article",
          title: "Понять",
          summary: "",
          position: 0,
          estimatedMinutes: 5,
          completedAt: "2026-07-30T10:00:00.000Z",
        },
        {
          id: "two",
          slug: "two",
          kind: "practice",
          title: "Сделать",
          summary: "",
          position: 1,
          estimatedMinutes: 10,
          completedAt: null,
        },
      ],
    },
  ],
};

describe("student course view model", () => {
  it("chooses the first unfinished material as the one main action", () => {
    expect(getCourseProgress(course)).toMatchObject({
      state: "in_progress",
      completed: 1,
      total: 2,
      percent: 50,
      current: { id: "two" },
      previous: { id: "one" },
      next: null,
    });
  });

  it("returns an empty state when the course has no published materials", () => {
    expect(
      getCourseProgress({
        ...course,
        sections: [{ ...course.sections[0]!, materials: [] }],
      }),
    ).toEqual({
      state: "empty",
      completed: 0,
      total: 0,
      percent: 0,
      current: null,
      previous: null,
      next: null,
    });
  });

  it("returns a terminal state without inventing a current material", () => {
    const completedCourse: StudentCourse = {
      ...course,
      sections: course.sections.map((section) => ({
        ...section,
        materials: section.materials.map((material) => ({
          ...material,
          completedAt: "2026-08-01T10:00:00.000Z",
        })),
      })),
    };

    expect(getCourseProgress(completedCourse)).toEqual({
      state: "complete",
      completed: 2,
      total: 2,
      percent: 100,
      current: null,
      previous: null,
      next: null,
    });
  });

  it("derives a compact profile label without inventing personal data", () => {
    expect(displayStudentName("alexey@example.test")).toBe("alexey");
    expect(studentInitial("alexey@example.test")).toBe("A");
  });
});
