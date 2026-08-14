// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NavLink } from "@/components/shell/nav-link";
import { Sidebar, SidebarProvider, SidebarTrigger } from "./sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/courses",
}));

function stubMobileViewport() {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 375,
  });
  window.matchMedia = (query: string) =>
    ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

function renderMobileSidebar() {
  return render(
    <SidebarProvider>
      <Sidebar aria-label="Навигация администратора">
        <NavLink href="/admin/tools" label="Инструменты" />
      </Sidebar>
      <SidebarTrigger />
    </SidebarProvider>,
  );
}

async function openSheet() {
  fireEvent.click(screen.getByRole("button", { name: "Открыть или свернуть навигацию" }));
  return await screen.findByRole("dialog");
}

beforeEach(() => {
  stubMobileViewport();
});

afterEach(() => {
  cleanup();
});

describe("мобильная навигация преподавателя", () => {
  it("в открытом sheet есть видимая кнопка закрытия с touch target 44px", async () => {
    renderMobileSidebar();
    const sheet = await openSheet();

    const closeButton = screen.getByRole("button", { name: "Закрыть" });
    expect(closeButton).toBeTruthy();
    // 44x44: size-11 = 2.75rem = 44px.
    expect(closeButton.className).toContain("size-11");
    // Регрессия T-0144: встроенную кнопку прятали правилом [&>button]:hidden.
    expect(sheet.className).not.toContain("[&>button]:hidden");
  });

  it("кнопка закрывает sheet и возвращает focus на trigger", async () => {
    renderMobileSidebar();
    await openSheet();

    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Открыть или свернуть навигацию" }),
      );
    });
  });

  it("Escape закрывает sheet", async () => {
    renderMobileSidebar();
    const sheet = await openSheet();

    fireEvent.keyDown(sheet, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("выбор пункта навигации закрывает sheet", async () => {
    renderMobileSidebar();
    await openSheet();

    fireEvent.click(screen.getByRole("link", { name: "Инструменты" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});
