// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MaterialToc } from "./material-toc";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

const items = [
  { id: "context", label: "Контекст", level: 2 },
  { id: "details", label: "Детали", level: 3 },
];

describe("MaterialToc", () => {
  it("closes the mobile sheet and focuses the selected heading", async () => {
    let finishFrame!: FrameRequestCallback;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      finishFrame = callback;
      return 1;
    });
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    render(
      <>
        <h2 id="context" tabIndex={-1}>
          Контекст
        </h2>
        <MaterialToc items={items} mode="mobile" />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Оглавление" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Контекст" }));
    await waitFor(() => expect(finishFrame).toBeTypeOf("function"));
    await act(async () => finishFrame(0));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Контекст" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(window.location.hash).toBe("#context");
  });

  it("keeps desktop anchors stable and keyboard-sized", () => {
    render(<MaterialToc items={items} mode="desktop" />);
    expect(
      screen.getByRole("link", { name: "Детали" }).getAttribute("href"),
    ).toBe("#details");
  });
});
