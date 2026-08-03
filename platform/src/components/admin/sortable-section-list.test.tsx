// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

import {
  reorderSectionItems,
  SortableSectionList,
  type SortableSectionListItem,
} from "./sortable-section-list";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const sections: SortableSectionListItem[] = [
  {
    section: {
      id: "section-1",
      slug: "start",
      title: "Начало",
      courseId: "course-1",
      courseTitle: "Нейрокурс",
      position: 0,
      status: "draft",
      nextMaterialPosition: 0,
    },
    materialCount: 0,
    publishedMaterialCount: 0,
  },
  {
    section: {
      id: "section-2",
      slug: "practice",
      title: "Практика",
      courseId: "course-1",
      courseTitle: "Нейрокурс",
      position: 1,
      status: "published",
      nextMaterialPosition: 1,
    },
    materialCount: 1,
    publishedMaterialCount: 1,
  },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SortableSectionList", () => {
  it("renders a dedicated drag handle for each row without arrow actions", () => {
    render(
      <SortableSectionList
        courseId="course-1"
        courseStatus="published"
        initialItems={sections}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Изменить порядок раздела «Начало»",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Изменить порядок раздела «Практика»",
      }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Открыть раздел «Начало»" })
        .getAttribute("href"),
    ).toBe("/admin/program/sections/section-1");
    expect(screen.queryByLabelText(/Переместить раздел.*выше/)).toBeNull();
    expect(screen.queryByLabelText(/Переместить раздел.*ниже/)).toBeNull();
  });

  it("moves one item to the target position without mutating the source", () => {
    const reordered = reorderSectionItems(sections, 0, 1);

    expect(reordered.map((item) => item.section.id)).toEqual([
      "section-2",
      "section-1",
    ]);
    expect(sections.map((item) => item.section.id)).toEqual([
      "section-1",
      "section-2",
    ]);
  });
});
