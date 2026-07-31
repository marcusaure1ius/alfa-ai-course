// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { StudentProfileMenu } from "./student-profile-menu";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

beforeAll(() => {
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { value: () => false },
    releasePointerCapture: { value: () => undefined },
    scrollIntoView: { value: () => undefined },
    setPointerCapture: { value: () => undefined },
  });
});

afterEach(() => {
  cleanup();
  replace.mockReset();
  refresh.mockReset();
  vi.unstubAllGlobals();
});

function openMenu() {
  const trigger = screen.getByRole("button", {
    name: "Открыть меню профиля student.qa",
  });
  fireEvent.pointerDown(trigger, {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
  return trigger;
}

describe("StudentProfileMenu", () => {
  it("exposes logout as a real keyboard-operable menu item", async () => {
    render(<StudentProfileMenu email="student.qa@example.test" />);

    openMenu();
    const item = await screen.findByRole("menuitem", { name: "Выйти" });
    expect(item.tagName).toBe("BUTTON");
    expect(item.getAttribute("data-slot")).toBe("dropdown-menu-item");
    expect(() => fireEvent.keyDown(item, { key: "ArrowDown" })).not.toThrow();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    render(<StudentProfileMenu email="student.qa@example.test" />);

    const trigger = openMenu();
    const menu = await screen.findByRole("menu");
    fireEvent.keyDown(menu, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on an outside pointer press without restoring trigger focus", async () => {
    render(<StudentProfileMenu email="student.qa@example.test" />);

    const trigger = openMenu();
    await screen.findByRole("menu");
    fireEvent.pointerDown(document.body, { pointerType: "mouse" });

    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(document.activeElement).not.toBe(trigger);
  });

  it("closes after selecting logout without a focus error", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csrfToken: "csrf.test" }), {
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", request);

    render(<StudentProfileMenu email="student.qa@example.test" />);

    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Выйти" }));

    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(replace).toHaveBeenCalledWith("/login");
    expect(refresh).toHaveBeenCalledOnce();
  });
});
