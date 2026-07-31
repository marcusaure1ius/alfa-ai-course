// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";

import { SidebarProvider } from "@/components/ui/sidebar";
import { AdminSidebar } from "./admin-sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/tools",
  useRouter: () => ({
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(cleanup);

describe("AdminSidebar collapsed navigation", () => {
  it("has no automated accessibility violations", async () => {
    const { container } = render(
      <SidebarProvider defaultOpen>
        <AdminSidebar email="admin@example.test" />
      </SidebarProvider>,
    );
    const results = await axe(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it("keeps the product workspace as top-level actionable links", () => {
    render(
      <SidebarProvider defaultOpen={false}>
        <AdminSidebar email="admin@example.test" />
      </SidebarProvider>,
    );

    const destinations = [
      ["Ученики", "/admin/students"],
      ["Материалы", "/admin/content"],
      ["Инструменты", "/admin/tools"],
    ] as const;

    for (const [label, href] of destinations) {
      const link = screen.getByRole("link", { name: label });
      expect(link.getAttribute("href")).toBe(href);
      expect(link.getAttribute("data-slot")).toBe("sidebar-menu-button");
      expect(link.className).not.toContain("group-data-[collapsible=icon]:hidden");
    }
    expect(screen.queryByText("Fake provider")).toBeNull();
    expect(screen.queryByRole("link", { name: "Подключение Timeweb" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Операции" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Настройки" })).toBeNull();
  });
});
