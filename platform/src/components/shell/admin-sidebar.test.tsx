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
  it("uses the same wordmark as the login page without a compact monogram", () => {
    const { container } = render(
      <SidebarProvider defaultOpen>
        <AdminSidebar />
      </SidebarProvider>,
    );

    const brands = screen.getAllByLabelText("neurokurs");
    expect(brands).toHaveLength(1);
    expect(brands[0]?.textContent).toBe("neurokurs");

    const header = container.querySelector('[data-slot="sidebar-header"]');
    expect(header?.className).toContain("border-b");
    expect(
      container.querySelectorAll('[data-slot="sidebar-separator"]'),
    ).toHaveLength(0);
  });

  it("has no automated accessibility violations", async () => {
    const { container } = render(
      <SidebarProvider defaultOpen>
        <AdminSidebar />
      </SidebarProvider>,
    );
    const results = await axe(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it("keeps the product workspace as top-level actionable links", () => {
    const { container } = render(
      <SidebarProvider defaultOpen={false}>
        <AdminSidebar />
      </SidebarProvider>,
    );

    const collapsedSidebar = container.querySelector(
      '[data-slot="sidebar"][data-collapsible="icon"]',
    );
    expect(collapsedSidebar).toBeTruthy();

    const brandContainer = screen.getByLabelText("neurokurs").parentElement;
    expect(brandContainer?.className).toContain(
      "group-data-[collapsible=icon]:hidden",
    );

    const destinations = [
      ["Курсы", "/admin/courses"],
      ["Разделы", "/admin/program"],
      ["Ученики", "/admin/students"],
      ["Инструменты", "/admin/tools"],
    ] as const;

    for (const [label, href] of destinations) {
      const link = screen.getByRole("link", { name: label });
      expect(link.getAttribute("href")).toBe(href);
      expect(link.getAttribute("data-slot")).toBe("sidebar-menu-button");
      expect(link.querySelector("svg")).toBeTruthy();
      expect(link.className).not.toContain("group-data-[collapsible=icon]:hidden");
      expect(link.className).toContain("min-h-11");
      expect(link.className).toContain("rounded-lg");
      expect(link.className).toContain("px-3");
    }
    expect(screen.getByRole("link", { name: "Инструменты" }).className).toContain(
      "data-[active=true]:bg-foreground",
    );
    expect(screen.getAllByText("Курсы")).toHaveLength(2);
    expect(screen.getByText("Управление")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Доступы" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Материалы" })).toBeNull();
    expect(screen.queryByText("Fake provider")).toBeNull();
    expect(screen.queryByRole("link", { name: "Подключение Timeweb" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Операции" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Настройки" })).toBeNull();

    const rail = container.querySelector('[data-slot="sidebar-rail"]');
    expect(rail?.className).toContain("bg-transparent");
    expect(rail?.className).not.toContain("after:w-[2px]");
    expect(rail?.className).not.toContain("hover:after:bg-sidebar-border");
    expect(rail?.className).not.toContain("hover:group-data");
    expect(rail?.className).toContain("w-2");
    expect(rail?.className).toContain("group-data-[side=left]:right-0");
    expect(rail?.className).not.toContain("-right-4");
    expect(rail?.className).not.toContain("-translate-x-1/2");

    const sidebarContainer = container.querySelector(
      '[data-slot="sidebar-container"]',
    );
    expect(sidebarContainer?.className).toContain(
      "group-data-[side=left]:group-data-[collapsible=icon]:border-r-0",
    );
  });
});
