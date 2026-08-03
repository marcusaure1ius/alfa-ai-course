// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { SidebarProvider } from "@/components/ui/sidebar";
import { AdminHeader } from "./admin-header";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
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

describe("AdminHeader", () => {
  it("centers search and exposes the admin profile on the right", () => {
    const { container } = render(
      <SidebarProvider>
        <AdminHeader email="test-admin@neurokurs.example" />
      </SidebarProvider>,
    );

    const header = container.querySelector("header");
    expect(header?.className).toContain(
      "grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]",
    );
    expect(header?.className).toContain("bg-background/95");
    expect(header?.className).not.toContain("border-b");
    expect(header?.className).not.toContain("bg-card");
    expect(
      screen.getByRole("button", { name: "Открыть поиск и команды" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Открыть меню профиля test-admin",
      }),
    ).toBeTruthy();
  });
});
