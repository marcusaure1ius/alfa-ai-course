// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SectionCreateDialog, SectionEditDialog } from "./section-dialogs";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(cleanup);

const courses = [
  { id: "course-1", title: "Нейрокурс", status: "draft" as const },
];

function openCreateDialog() {
  render(<SectionCreateDialog courses={courses} sections={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "Добавить раздел" }));
}

describe("SectionCreateDialog", () => {
  it("uses plain-language labels and generates the address from the title", () => {
    openCreateDialog();

    fireEvent.change(screen.getByLabelText("Название"), {
      target: { value: "Первые шаги" },
    });

    expect(screen.queryByText("Slug")).toBeNull();
    expect(screen.getByLabelText("Адрес раздела")).toHaveProperty(
      "value",
      "pervye-shagi",
    );
    expect(screen.getByText("Так раздел увидят ученики").className)
      .toContain("whitespace-nowrap");
    expect(screen.getByText("Автоматически — можно изменить").className)
      .toContain("whitespace-nowrap");
  });

  it("preserves a manual address until the administrator clears it", () => {
    openCreateDialog();
    const title = screen.getByLabelText("Название");
    const address = screen.getByLabelText("Адрес раздела");

    fireEvent.change(title, { target: { value: "Первый раздел" } });
    fireEvent.change(address, { target: { value: "special-section" } });
    fireEvent.change(title, { target: { value: "Новое название" } });
    expect(address).toHaveProperty("value", "special-section");

    fireEvent.change(address, { target: { value: "" } });
    fireEvent.change(title, { target: { value: "Вводный раздел" } });
    expect(address).toHaveProperty("value", "vvodnyy-razdel");
  });

  it("keeps the selected course as a clear full-width first step", () => {
    openCreateDialog();

    const courseSelect = screen.getByRole("combobox", { name: "Курс" });
    expect(courseSelect.textContent).toContain("Нейрокурс");
    expect(courseSelect.dataset.slot).toBe("select-trigger");
    expect(courseSelect.className).toContain("h-12");
    expect(courseSelect.querySelector("svg")).toBeTruthy();
    expect(
      screen.getByText("Раздел появится в программе выбранного курса"),
    ).toBeTruthy();
  });
});

describe("SectionEditDialog", () => {
  it("uses the same address vocabulary when editing", () => {
    render(
      <SectionEditDialog
        section={{
          id: "section-1",
          slug: "pervye-shagi",
          title: "Первые шаги",
          courseId: "course-1",
          courseTitle: "Нейрокурс",
          position: 0,
          status: "draft",
          nextMaterialPosition: 0,
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Настроить" }));

    expect(screen.getByLabelText("Адрес раздела")).toHaveProperty(
      "value",
      "pervye-shagi",
    );
    expect(
      screen.getByRole("combobox", { name: "Видимость" }).dataset.slot,
    ).toBe("select-trigger");
    expect(screen.queryByText("Slug")).toBeNull();
  });
});
