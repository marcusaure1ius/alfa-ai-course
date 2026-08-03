// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TaskCreateDialog } from "./task-create-dialog";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

function renderDialog() {
  render(
    <TaskCreateDialog
      courseId="course-1"
      sectionId="section-1"
      sectionTitle="Начало работы"
      nextPosition={2}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Создать задание" }));
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  push.mockReset();
  refresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TaskCreateDialog", () => {
  it("uses task vocabulary and derives its context from the current section", () => {
    renderDialog();

    expect(screen.getByRole("heading", { name: "Новое задание" })).toBeTruthy();
    expect(screen.getByText(/в разделе «Начало работы»/)).toBeTruthy();
    expect(screen.queryByLabelText("Курс")).toBeNull();
    expect(screen.queryByLabelText("Раздел")).toBeNull();
    expect(screen.queryByText("Материал")).toBeNull();
    expect(screen.queryByText("Slug")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Тип" }).dataset.slot).toBe(
      "select-trigger",
    );
  });

  it("generates the address from the title and preserves a manual edit", () => {
    renderDialog();
    const title = screen.getByLabelText("Название");
    const address = screen.getByLabelText("Адрес задания");

    fireEvent.change(title, { target: { value: "Первая практика" } });
    expect(address).toHaveProperty("value", "pervaya-praktika");

    fireEvent.change(address, { target: { value: "special-task" } });
    fireEvent.change(title, { target: { value: "Другое название" } });
    expect(address).toHaveProperty("value", "special-task");
  });

  it("creates a draft in the current section and opens its editor", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csrfToken: "csrf-token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "task-1" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      );
    renderDialog();

    fireEvent.change(screen.getByLabelText("Название"), {
      target: { value: "Первая практика" },
    });
    fireEvent.change(screen.getByLabelText("Короткое описание"), {
      target: { value: "Соберите первый сценарий" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Создать и открыть" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const request = vi.mocked(fetch).mock.calls[1];
    expect(request?.[0]).toBe("/api/admin/courses/course-1/materials");
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({
      sectionId: "section-1",
      slug: "pervaya-praktika",
      kind: "article",
      title: "Первая практика",
      summary: "Соберите первый сценарий",
      bodyMarkdown: "",
      position: 2,
      estimatedMinutes: null,
      status: "draft",
    });
    expect(push).toHaveBeenCalledWith("/admin/content/materials/task-1");
    expect(refresh).toHaveBeenCalledOnce();
  });
});
