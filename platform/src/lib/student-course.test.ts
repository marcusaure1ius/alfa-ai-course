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
      completed: 1,
      total: 2,
      percent: 50,
      current: { id: "two" },
      previous: { id: "one" },
      next: null,
    });
  });

  it("derives a compact profile label without inventing personal data", () => {
    expect(displayStudentName("alexey@example.test")).toBe("alexey");
    expect(studentInitial("alexey@example.test")).toBe("A");
  });
});
