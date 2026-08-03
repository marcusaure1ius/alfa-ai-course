// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import type { ToolCatalogItem } from "@/lib/tool-catalog";

import { ToolServiceCatalog } from "./tool-service-catalog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(cleanup);

const n8n: ToolCatalogItem = {
  id: "n8n",
  name: "n8n",
  description: "Автоматизация рабочих процессов",
  setupHref: "/admin/tools/n8n",
  studentHref: "/student/tools/n8n",
  capabilities: { environment: "required", studentAccess: true, studentLaunch: true },
  environments: [],
  studentAccessEnabled: true,
  activeAccessCount: 0,
};

const notebook: ToolCatalogItem = {
  id: "notebook",
  name: "Учебный блокнот с очень длинным названием без технической среды",
  description: "Длинное описание сервиса, которое должно переноситься внутри карточки без горизонтального переполнения на узком экране.",
  setupHref: "/admin/tools/notebook",
  studentHref: "/student/tools/notebook",
  capabilities: { environment: "none", studentAccess: true, studentLaunch: false },
  environments: [],
  studentAccessEnabled: true,
  activeAccessCount: 2,
};

const sandbox: ToolCatalogItem = {
  ...notebook,
  id: "sandbox",
  name: "Sandbox",
  setupHref: "/admin/tools/sandbox",
  studentHref: "/student/tools/sandbox",
  capabilities: { environment: "optional", studentAccess: true, studentLaunch: true },
  activeAccessCount: 0,
};

describe("ToolServiceCatalog", () => {
  it("renders one clear all-empty state", () => {
    render(<ToolServiceCatalog tools={[]} />);
    expect(screen.getByText("Сервисы пока не подключены")).toBeTruthy();
    expect(screen.queryByText(/Экземпляры/)).toBeNull();
  });

  it("renders required and environmentless services without fake instance actions", () => {
    render(<ToolServiceCatalog tools={[n8n, notebook, sandbox]} />);
    const catalog = screen.getByRole("list", { name: "Каталог учебных сервисов" });
    expect(within(catalog).getAllByRole("listitem")).toHaveLength(3);
    const notebookHeading = screen.getByRole("heading", { name: notebook.name });
    const notebookCard = notebookHeading.closest("article");
    expect(notebookCard).not.toBeNull();
    expect(within(notebookCard as HTMLElement).getByText(/не нужна отдельная серверная среда/)).toBeTruthy();
    expect(within(notebookCard as HTMLElement).getByRole("link", { name: "Настроить сервис" }).getAttribute("href")).toBe("/admin/tools/notebook");
    expect(within(notebookCard as HTMLElement).queryByRole("link", { name: "Детали" })).toBeNull();
    expect(screen.getByText("Среда ещё не создана")).toBeTruthy();
    expect(screen.getByText("Отдельная среда не настроена")).toBeTruthy();
    expect(screen.getByText(/Sandbox может работать без неё/)).toBeTruthy();
  });

  it("keeps problem routing inside the owning service and stays accessible", async () => {
    const degraded: ToolCatalogItem = {
      ...n8n,
      id: "automation",
      name: "Automation Lab",
      setupHref: "/admin/tools/automation",
      studentHref: "/student/tools/automation",
      environments: [{
        id: "environment-2",
        toolType: "automation",
        name: "Практическая среда",
        status: "degraded",
        publicUrl: null,
        updatedAt: "2026-08-02T08:00:00.000Z",
        accessCount: 3,
      }],
    };
    const { container } = render(<ToolServiceCatalog tools={[n8n, notebook, degraded]} />);
    const problemLink = screen.getByRole("link", { name: /Проверить Automation Lab/ });
    expect(problemLink.getAttribute("href")).toBe(
      "/admin/tools/automation/instances/environment-2",
    );
    expect(problemLink.className).toContain("min-h-11");
    expect(screen.getByRole("list", { name: "Среды сервиса Automation Lab" })).toBeTruthy();
    const results = await axe(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
