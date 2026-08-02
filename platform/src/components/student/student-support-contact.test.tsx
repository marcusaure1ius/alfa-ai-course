// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  resolveStudentSupportContact,
  StudentSupportContact,
} from "./student-support-contact";

afterEach(cleanup);

describe("StudentSupportContact", () => {
  it("exposes only a validated configured contact", () => {
    expect(
      resolveStudentSupportContact({
        courseTitle: "Курс",
        configuredContact: {
          label: "Написать преподавателю",
          href: "mailto:teacher@example.test",
        },
      }),
    ).toEqual({
      state: "configured",
      courseTitle: "Курс",
      label: "Написать преподавателю",
      href: "mailto:teacher@example.test",
    });
    render(
      <StudentSupportContact
        courseTitle="Курс"
        configuredContact={{
          label: "Написать преподавателю",
          href: "https://support.example.test/course",
        }}
      />,
    );
    expect(
      screen
        .getByRole("link", { name: /Написать преподавателю/ })
        .getAttribute("href"),
    ).toBe("https://support.example.test/course");
  });

  it.each([
    ["missing", "Курс", null],
    [
      "malformed",
      "Курс",
      { label: "Поддержка", href: "https://user:secret@example.test" },
    ],
    ["no_course", null, null],
  ] as const)("renders %s without a fictional action", (state, courseTitle, configuredContact) => {
    const resolved = resolveStudentSupportContact({
      courseTitle,
      configuredContact,
    });
    expect(resolved.state).toBe(state);
    const { container } = render(
      <StudentSupportContact
        courseTitle={courseTitle}
        configuredContact={configuredContact}
      />,
    );
    expect(container.querySelector("a")).toBeNull();
    expect(screen.getByText(/канал|Контакт/)).toBeTruthy();
  });
});
