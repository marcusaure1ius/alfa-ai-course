// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { SidebarProvider } from "@/components/ui/sidebar";
import { AdminSidebar } from "./admin-sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/infrastructure",
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
  it("keeps every infrastructure destination as a top-level actionable link", () => {
    render(
      <SidebarProvider defaultOpen={false}>
        <AdminSidebar email="admin@example.test" />
      </SidebarProvider>,
    );

    const destinations = [
      ["Инструменты", "/admin/infrastructure"],
      ["Операции", "/admin/operations"],
    ] as const;

    for (const [label, href] of destinations) {
      const link = screen.getByRole("link", { name: label });
      expect(link.getAttribute("href")).toBe(href);
      expect(link.getAttribute("data-slot")).toBe("sidebar-menu-button");
      expect(link.className).not.toContain("group-data-[collapsible=icon]:hidden");
    }
    expect(screen.queryByText("Fake provider")).toBeNull();
    expect(screen.queryByRole("link", { name: "Подключение Timeweb" })).toBeNull();
  });
});
