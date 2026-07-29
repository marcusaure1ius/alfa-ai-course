// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { SidebarProvider } from "@/components/ui/sidebar";
import { AdminSidebar } from "./admin-sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/infrastructure",
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
  it("keeps every infrastructure destination as a top-level actionable link", () => {
    render(
      <SidebarProvider defaultOpen={false}>
        <AdminSidebar email="admin@example.test" />
      </SidebarProvider>,
    );

    const destinations = [
      ["Серверы", "/admin/infrastructure"],
      ["Операции", "/admin/operations"],
      ["Домены и DNS", "/admin/domains"],
      ["Подключение Timeweb", "/admin/timeweb"],
    ] as const;

    for (const [label, href] of destinations) {
      const link = screen.getByRole("link", { name: label });
      expect(link.getAttribute("href")).toBe(href);
      expect(link.getAttribute("data-slot")).toBe("sidebar-menu-button");
      expect(link.className).not.toContain("group-data-[collapsible=icon]:hidden");
    }
  });
});
