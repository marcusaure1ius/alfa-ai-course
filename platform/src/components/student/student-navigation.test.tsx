// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { StudentNavigation } from "./student-navigation";

let pathname = "/student";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  pathname = "/student";
});

function renderNavigation(courseCount = 1) {
  return render(<StudentNavigation courseCount={courseCount} />);
}

describe("StudentNavigation", () => {
  it("uses one course destination instead of competing overview and program links", () => {
    renderNavigation();

    const courses = screen.getByRole("link", { name: "Мои курсы" });
    expect(courses.getAttribute("href")).toBe("/student");
    expect(courses.getAttribute("aria-current")).toBe("page");
    expect(screen.queryByRole("link", { name: "Обзор" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Программа" })).toBeNull();
  });

  it("uses my courses as the stable parent entry on course and material routes", () => {
    pathname = "/student/materials/pervyy-shag";
    renderNavigation();

    const courses = screen.getByRole("link", { name: "Мои курсы" });
    expect(courses.getAttribute("aria-current")).toBe("page");

    cleanup();
    pathname = "/student/program";
    renderNavigation();
    expect(
      screen.getByRole("link", { name: "Мои курсы" }).getAttribute(
        "aria-current",
      ),
    ).toBe("page");
  });

  it("shows the course count without an out-of-context material progress", () => {
    renderNavigation(3);

    expect(screen.getByText("3 курса в доступе")).toBeTruthy();
    expect(screen.queryByText(/материал/)).toBeNull();
  });

  it("marks a section route without creating two active destinations", () => {
    pathname = "/student/tools/n8n";
    renderNavigation();

    const current = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toContain("Инструменты");
  });

  it("has no automated accessibility violations", async () => {
    const { container } = renderNavigation();
    const results = await axe(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
