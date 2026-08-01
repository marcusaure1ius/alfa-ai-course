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

function renderNavigation() {
  return render(
    <StudentNavigation
      courseTitle="Автоматизация бизнеса"
      progressLabel="1 из 3 материалов"
    />,
  );
}

describe("StudentNavigation", () => {
  it("keeps the overview reachable and marks it as the current page", () => {
    renderNavigation();

    const overview = screen.getByRole("link", { name: "Обзор" });
    expect(overview.getAttribute("href")).toBe("/student");
    expect(overview.getAttribute("aria-current")).toBe("page");
    expect(
      screen.getByRole("link", { name: "Программа" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("uses the overview as the stable parent entry on a material route", () => {
    pathname = "/student/materials/pervyy-shag";
    renderNavigation();

    const overview = screen.getByRole("link", { name: "Обзор" });
    expect(overview.getAttribute("href")).toBe("/student");
    expect(overview.getAttribute("aria-current")).toBe("page");
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
