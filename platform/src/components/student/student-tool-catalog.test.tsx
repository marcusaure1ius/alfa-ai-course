// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import type { StudentToolCatalogItem } from "@/lib/student-tool-catalog";

import { StudentToolCatalog } from "./student-tool-catalog";

afterEach(cleanup);

const automation: StudentToolCatalogItem = {
  id: "automation",
  name: "Automation Lab",
  description: "Практика автоматизации рабочих процессов.",
  studentHref: "/student/tools/automation",
  capabilities: { environment: "required", studentAccess: true, studentLaunch: true },
  entitlement: {
    toolType: "automation",
    state: "available",
    expiresAt: "2026-09-01T00:00:00.000Z",
  },
};

const notebook: StudentToolCatalogItem = {
  id: "notebook",
  name: "Учебный блокнот с очень длинным названием и непрерывнымидентификаторомбезпробелов",
  description: "Длинное описание сервиса должно переноситься внутри карточки и не раскрывает технические поля среды.",
  studentHref: "/student/tools/notebook",
  capabilities: { environment: "none", studentAccess: true, studentLaunch: false },
  entitlement: {
    toolType: "notebook",
    state: "locked",
    expiresAt: null,
  },
};

describe("StudentToolCatalog", () => {
  it("renders an honest zero-services state", () => {
    render(<StudentToolCatalog tools={[]} />);
    expect(screen.getByRole("heading", { name: "Инструменты пока не добавлены" })).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("renders one and many services as semantic cards without infrastructure fields", () => {
    const { rerender } = render(<StudentToolCatalog tools={[automation]} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);

    rerender(<StudentToolCatalog tools={[automation, notebook]} />);
    const catalog = screen.getByRole("list", { name: "Каталог учебных инструментов" });
    expect(within(catalog).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: notebook.name })).toBeTruthy();
    const availableAction = screen.getByRole("link", { name: `Открыть инструмент: ${automation.name}` });
    expect(availableAction.getAttribute("href")).toBe(automation.studentHref);
    expect(availableAction.className).toContain("focus-visible:outline-solid");
    expect(screen.getByRole("link", { name: `Подробнее: ${notebook.name}` }).getAttribute("href"))
      .toBe(notebook.studentHref);
    expect(screen.queryByText(/VPS|provider|стоимост|environmentId/i)).toBeNull();
    expect(screen.getByText(notebook.description).className).toContain("[overflow-wrap:anywhere]");
  });

  it("keeps the global service gate distinct and hides an open action", () => {
    render(
      <StudentToolCatalog
        tools={[{
          ...automation,
          entitlement: {
            ...automation.entitlement,
            state: "service_disabled",
          },
        }]}
      />,
    );

    expect(screen.getByText("Сервис временно закрыт")).toBeTruthy();
    expect(screen.getByText(/назначение и срок доступа сохранены/i)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Открыть инструмент/ })).toBeNull();
    expect(screen.getByRole("link", { name: `Подробнее: ${automation.name}` })).toBeTruthy();
  });

  it.each([
    ["locked", "Доступ не подключён", "Подробнее"],
    ["service_disabled", "Сервис временно закрыт", "Подробнее"],
    ["preparing", "Сервис готовится", "Подробнее"],
    ["available", "Можно работать", "Открыть инструмент"],
    ["attention", "Доступ временно недоступен", "Что делать дальше"],
    ["expired", "Срок доступа завершён", "Что делать дальше"],
  ] as const)("renders honest %s state with its icon and action", (state, title, action) => {
    const { container } = render(
      <StudentToolCatalog
        tools={[{
          ...automation,
          entitlement: { ...automation.entitlement, state },
        }]}
      />,
    );
    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByRole("link", { name: `${action}: ${automation.name}` })).toBeTruthy();
    expect(container.querySelector(`[data-state-icon="${state}"]`)).toBeTruthy();
  });

  it("does not offer launch for an available environmentless non-launch service", () => {
    render(
      <StudentToolCatalog
        tools={[{
          ...notebook,
          entitlement: { ...notebook.entitlement, state: "available" },
        }]}
      />,
    );
    expect(screen.getByText("Можно работать")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Открыть инструмент/ })).toBeNull();
    expect(screen.getByRole("link", { name: `Подробнее: ${notebook.name}` })).toBeTruthy();
  });

  it("has no automatic accessibility violations across mixed states", async () => {
    const { container } = render(<StudentToolCatalog tools={[automation, notebook]} />);
    const results = await axe(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
