// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CourseCreateForm } from "./course-create-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(cleanup);

function openForm() {
  render(<CourseCreateForm />);
  fireEvent.click(screen.getByRole("button", { name: "Создать курс" }));
}

describe("CourseCreateForm", () => {
  it("uses plain-language labels and generates the address from the title", () => {
    openForm();

    fireEvent.change(screen.getByLabelText("Название"), {
      target: { value: "Нейрокурс: быстрый старт" },
    });

    expect(screen.queryByText("Slug")).toBeNull();
    expect(screen.getByLabelText("Адрес курса")).toHaveProperty(
      "value",
      "neyrokurs-bystryy-start",
    );
    const titleHelp = screen.getByText("Так курс увидят ученики");
    const addressHelp = screen.getByText("Автоматически — можно изменить");
    expect(titleHelp.className).toContain("whitespace-nowrap");
    expect(addressHelp.className).toContain("whitespace-nowrap");
  });

  it("preserves a manually edited address when the title changes", () => {
    openForm();
    const title = screen.getByLabelText("Название");
    const address = screen.getByLabelText("Адрес курса");

    fireEvent.change(title, { target: { value: "Первое название" } });
    fireEvent.change(address, { target: { value: "special-course" } });
    fireEvent.change(title, { target: { value: "Новое название" } });

    expect(address).toHaveProperty("value", "special-course");
  });

  it("re-enables automatic generation after the address is cleared", () => {
    openForm();
    const title = screen.getByLabelText("Название");
    const address = screen.getByLabelText("Адрес курса");

    fireEvent.change(title, { target: { value: "Первое название" } });
    fireEvent.change(address, { target: { value: "special-course" } });
    fireEvent.change(address, { target: { value: "" } });
    fireEvent.change(title, { target: { value: "Новый курс" } });

    expect(address).toHaveProperty("value", "novyy-kurs");
  });

  it("keeps both lead fields on the same three-row grid", () => {
    openForm();
    const titleField = screen.getByLabelText("Название").parentElement;
    const addressField = screen.getByLabelText("Адрес курса").parentElement;

    expect(titleField?.className).toContain(
      "grid-rows-[1.25rem_3rem_minmax(2.5rem,auto)]",
    );
    expect(addressField?.className).toContain(
      "grid-rows-[1.25rem_3rem_minmax(2.5rem,auto)]",
    );
  });
});
