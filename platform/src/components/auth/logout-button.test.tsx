// @vitest-environment jsdom

import { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LogoutButton } from "./logout-button";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
});

describe("LogoutButton", () => {
  it("forwards Radix item semantics, handlers, and ref to the button", () => {
    const ref = createRef<HTMLButtonElement>();
    const onKeyDown = vi.fn();

    render(
      <LogoutButton
        ref={ref}
        role="menuitem"
        tabIndex={-1}
        data-highlighted=""
        onKeyDown={onKeyDown}
      />,
    );

    const button = screen.getByRole("menuitem", { name: "Выйти" });
    expect(ref.current).toBe(button);
    expect(button.getAttribute("data-highlighted")).toBe("");
    expect(button.getAttribute("tabindex")).toBe("-1");

    fireEvent.keyDown(button, { key: "ArrowDown" });
    expect(onKeyDown).toHaveBeenCalledOnce();
  });
});
