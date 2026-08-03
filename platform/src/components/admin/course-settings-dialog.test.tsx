// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CourseSettingsDialog } from "./course-settings-dialog";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const course = {
  id: "course-1",
  title: "Нейрокурс",
  slug: "neurokurs",
  description: "Закрытое рабочее пространство курса",
  status: "published" as const,
};

function renderDialog() {
  render(
    <CourseSettingsDialog
      course={course}
      sectionCount={2}
      taskCount={5}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Настроить" }));
}

function mockSuccessfulRequest() {
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ csrfToken: "csrf-token" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  refresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CourseSettingsDialog", () => {
  it("opens a platform form with every editable course field", () => {
    renderDialog();

    expect(screen.getByRole("heading", { name: "Настройки курса" })).toBeTruthy();
    expect(screen.getByLabelText("Название")).toHaveProperty(
      "value",
      "Нейрокурс",
    );
    expect(screen.getByLabelText("Адрес курса")).toHaveProperty(
      "value",
      "neurokurs",
    );
    expect(screen.getByLabelText("Описание")).toHaveProperty(
      "value",
      "Закрытое рабочее пространство курса",
    );
    expect(screen.getByRole("combobox", { name: "Видимость" })).toBeTruthy();
    expect(screen.queryByText("Slug")).toBeNull();
  });

  it("saves the edited metadata through the protected course endpoint", async () => {
    mockSuccessfulRequest();
    renderDialog();

    fireEvent.change(screen.getByLabelText("Название"), {
      target: { value: "Нейрокурс для команды" },
    });
    fireEvent.change(screen.getByLabelText("Описание"), {
      target: { value: "Обновлённое описание" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const request = vi.mocked(fetch).mock.calls[1];
    expect(request?.[0]).toBe("/api/admin/courses/course-1");
    expect(request?.[1]).toEqual(
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({
      title: "Нейрокурс для команды",
      slug: "neurokurs",
      description: "Обновлённое описание",
      status: "published",
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("requires the exact course title before destructive deletion", async () => {
    mockSuccessfulRequest();
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Удалить курс" }));

    expect(screen.getByText(/2 раздела, 5 заданий/)).toBeTruthy();
    const removeButton = screen.getByRole("button", {
      name: "Удалить навсегда",
    });
    expect(removeButton).toHaveProperty("disabled", true);

    fireEvent.change(
      screen.getByLabelText("Введите «Нейрокурс» для подтверждения"),
      { target: { value: "Нейрокурс" } },
    );
    expect(removeButton).toHaveProperty("disabled", false);
    fireEvent.click(removeButton);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/admin/courses/course-1",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ confirmationTitle: "Нейрокурс" }),
      }),
    );
    expect(refresh).toHaveBeenCalledOnce();
  });
});
