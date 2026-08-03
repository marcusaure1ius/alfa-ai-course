// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SectionRowActions } from "./section-row-actions";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const section = {
  id: "section-1",
  slug: "start",
  title: "Начало",
  courseId: "course-1",
  courseTitle: "Нейрокурс",
  position: 0,
  status: "draft" as const,
  nextMaterialPosition: 0,
};

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
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  refresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SectionRowActions", () => {
  it("explains why a section with materials cannot be deleted", () => {
    render(
      <SectionRowActions
        section={section}
        materialCount={1}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Удалить раздел «Начало»" }),
    );

    expect(screen.getByText("Раздел пока нельзя удалить")).toBeTruthy();
    expect(
      screen.getByText(/В разделе 1 материал.*перенесите или удалите его/),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Удалить" })).toBeNull();
  });

  it("deletes an empty section only after confirmation", async () => {
    mockSuccessfulRequest();
    render(
      <SectionRowActions
        section={section}
        materialCount={0}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Удалить раздел «Начало»" }),
    );
    expect(screen.getByText("Удалить раздел «Начало»?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/admin/sections/section-1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(refresh).toHaveBeenCalledOnce();
  });
});
