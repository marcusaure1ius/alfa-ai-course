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

  it.each([
    "mailto:teacher@example.test%0d%0aSubject:Hello",
    "mailto:teacher@example.test%0Abcc:attacker@example.test",
    "mailto:teacher@example.test?subject=Hello",
    "mailto:teacher@example.test#fragment",
  ])("rejects unsafe mailto value %s", (href) => {
    const resolved = resolveStudentSupportContact({
      courseTitle: "Курс",
      configuredContact: { label: "Написать преподавателю", href },
    });
    expect(resolved.state).toBe("malformed");
  });

  it("does not promise a future contact in the no-course state", () => {
    render(<StudentSupportContact courseTitle={null} configuredContact={null} />);
    expect(screen.getByText(/ответьте в том канале/)).toBeTruthy();
    expect(screen.queryByText(/контакт.*появится/iu)).toBeNull();
  });

  it("allows a bounded long contact label to wrap on mobile", () => {
    const label = "Очень длинное название безопасного канала поддержки преподавателя курса";
    render(
      <StudentSupportContact
        courseTitle="Курс"
        configuredContact={{ label, href: "https://support.example.test/course" }}
      />,
    );
    const link = screen.getByRole("link", { name: new RegExp(label) });
    expect(link.className).toContain("max-w-full");
    expect(link.className).toContain("whitespace-normal");
    expect(link.className).not.toContain("whitespace-nowrap");
  });
});
