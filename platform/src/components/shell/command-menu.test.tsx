// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { CommandMenu } from "./command-menu";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

describe("CommandMenu focus", () => {
  it("restores focus to its trigger after click-open and Escape", async () => {
    render(<CommandMenu />);
    const trigger = screen.getByRole("button", {
      name: "Открыть поиск и команды",
    });

    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("restores the previously focused control after Ctrl+K and Escape", async () => {
    render(
      <>
        <button type="button">До поиска</button>
        <CommandMenu />
      </>,
    );
    const previous = screen.getByRole("button", { name: "До поиска" });
    previous.focus();

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(document.activeElement).toBe(previous));
  });

  it("ignores extension-generated keydown events without a key", () => {
    render(<CommandMenu />);
    expect(() => fireEvent.keyDown(document, {})).not.toThrow();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
