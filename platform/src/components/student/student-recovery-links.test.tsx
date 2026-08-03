// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import StudentError from "@/app/student/error";
import { StudentEmptyState } from "./student-empty-state";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("student recovery links", () => {
  it("routes a locked course to its stable help topic", () => {
    render(<StudentEmptyState kind="locked" />);
    expect(
      screen.getByRole("link", { name: /Что делать дальше/ }).getAttribute("href"),
    ).toBe("/student/help#course-access");
  });

  it("routes a page error to its stable help topic", () => {
    render(<StudentError error={new Error("test")} reset={vi.fn()} />);
    expect(
      screen.getByRole("link", { name: "Открыть помощь" }).getAttribute("href"),
    ).toBe("/student/help#student-error");
  });
});
