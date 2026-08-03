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

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push }),
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

afterEach(() => {
  cleanup();
  navigation.push.mockReset();
});

describe("CommandMenu focus", () => {
  it("renders a wide compact trigger with a quiet shortcut hint", () => {
    render(<CommandMenu />);
    const trigger = screen.getByRole("button", {
      name: "Открыть поиск и команды",
    });
    const shortcut = screen.getByText("⌘K");

    expect(trigger.className).toContain("h-10");
    expect(trigger.className).toContain("sm:w-80");
    expect(trigger.className).toContain("lg:w-[28rem]");
    expect(shortcut.className).toContain("text-muted-foreground/60");
    expect(shortcut.className).not.toContain("border");
  });

  it("uses the current admin information architecture", () => {
    render(<CommandMenu />);
    fireEvent.click(
      screen.getByRole("button", { name: "Открыть поиск и команды" }),
    );

    expect(screen.getByText("Курсы")).toBeTruthy();
    expect(screen.getByText("Разделы")).toBeTruthy();
    expect(screen.getByText("Ученики")).toBeTruthy();
    expect(screen.queryByText("Материалы")).toBeNull();
    expect(screen.queryByText("Доступы")).toBeNull();
  });

  it("uses one surface for the dialog and command content", () => {
    render(<CommandMenu />);
    fireEvent.click(
      screen.getByRole("button", { name: "Открыть поиск и команды" }),
    );

    const dialog = screen.getByRole("dialog");
    const command = dialog.querySelector('[data-slot="command"]');
    const closeButton = screen.getByRole("button", { name: "Закрыть" });
    expect(dialog.className).toContain("bg-card");
    expect(dialog.className).toContain("sm:p-0");
    expect(command?.className).toContain("bg-card");
    expect(closeButton.className).toContain("focus-visible:ring-2");
    expect(closeButton.className).not.toContain("focus:ring-2");
  });

  it("searches real admin objects and opens a concrete result", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        version: "admin-search-v1",
        query: "автоматизация",
        results: [
          {
            id: "material-1",
            kind: "material",
            title: "Автоматизация продаж",
            detail: "Основной курс / Практика · Материал",
            href: "/admin/content/materials/material-1",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", request);
    render(<CommandMenu />);
    fireEvent.click(
      screen.getByRole("button", { name: "Открыть поиск и команды" }),
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Поиск по платформе" }), {
      target: { value: "автоматизация" },
    });

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "/api/admin/search?q=%D0%B0%D0%B2%D1%82%D0%BE%D0%BC%D0%B0%D1%82%D0%B8%D0%B7%D0%B0%D1%86%D0%B8%D1%8F",
        expect.objectContaining({ headers: { accept: "application/json" } }),
      ),
    );
    const result = await screen.findByText("Автоматизация продаж");
    expect(screen.getByText("Задания")).toBeTruthy();
    fireEvent.click(result);
    expect(navigation.push).toHaveBeenCalledWith(
      "/admin/content/materials/material-1",
    );
  });

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
