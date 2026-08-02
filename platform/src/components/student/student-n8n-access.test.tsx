// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import type {
  StudentN8nAccess,
  StudentN8nAccessState,
} from "@/server/tools/student-access";

import { StudentN8nAccessCard } from "./student-n8n-access";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(cleanup);

function access(state: StudentN8nAccessState): StudentN8nAccess {
  if (state === "ready") {
    return {
      tool: "n8n",
      displayName: "n8n",
      state,
      canLaunch: true,
      launchUrl: "/api/student/tools/n8n/launch",
      expiresAt: "2026-08-30T20:59:59.000Z",
    };
  }
  return {
    tool: "n8n",
    displayName: "n8n",
    state,
    canLaunch: false,
    launchUrl: null,
    expiresAt:
      state === "locked" ? null : "2026-08-30T20:59:59.000Z",
  };
}

describe("StudentN8nAccessCard", () => {
  it("не содержит автоматических accessibility violations", async () => {
    const { container } = render(
      <StudentN8nAccessCard access={access("owner_setup_required")} />,
    );
    const results = await axe(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it.each([
    ["locked", "Как получить доступ"],
    ["license_blocked", "Как получить доступ"],
    ["service_disabled", "Проверить состояние"],
    ["preparing", "Проверить состояние"],
    ["owner_setup_required", "Проверить состояние"],
    ["ready", "Открыть n8n"],
    ["attention", "Проверить состояние"],
    ["expired", "Что делать дальше"],
  ] as const)(
    "%s имеет ровно одно уместное primary-действие",
    (state, actionName) => {
      render(<StudentN8nAccessCard access={access(state)} />);
      const action = screen.getByRole(state === "ready" || state === "locked" || state === "license_blocked" || state === "expired" ? "link" : "button", {
        name: actionName,
      });
      expect(action).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Открыть n8n" })).toBeNull();
      expect(
        screen.getByRole("button", { name: "Сообщить о проблеме" }),
      ).toBeTruthy();
    },
  );

  it("выдаёт launch capability только для ready", () => {
    render(<StudentN8nAccessCard access={access("ready")} />);
    expect(
      screen.getByRole("link", { name: "Открыть n8n" }).getAttribute("href"),
    ).toBe("/api/student/tools/n8n/launch");
  });

  it("оставляет owner setup администратору и не показывает запуск", () => {
    render(
      <StudentN8nAccessCard access={access("owner_setup_required")} />,
    );
    expect(screen.getByText(/только администратор/i)).toBeTruthy();
    expect(screen.getByText(/не создавайте owner-аккаунт/i)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Открыть n8n" })).toBeNull();
  });

  it("показывает истёкшую дату семантически и без VPS-обещаний", () => {
    const { container } = render(
      <StudentN8nAccessCard access={access("expired")} />,
    );
    expect(screen.getByText(/Действовал до/i)).toBeTruthy();
    expect(container.querySelector("time")?.getAttribute("dateTime")).toBe(
      "2026-08-30T20:59:59.000Z",
    );
    expect(screen.queryByText(/VPS|cloud|облачн/i)).toBeNull();
  });
});
