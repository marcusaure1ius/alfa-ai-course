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
      launchUrl: "https://n8n.example.test",
      inviteUrl: null,
      expiresAt: "2026-08-30T20:59:59.000Z",
    };
  }
  if (state === "invite_pending") {
    return {
      tool: "n8n",
      displayName: "n8n",
      state,
      canLaunch: true,
      launchUrl: "https://n8n.example.test",
      inviteUrl: "https://n8n.example.test/signup?token=invite-token",
      expiresAt: "2026-08-30T20:59:59.000Z",
    };
  }
  return {
    tool: "n8n",
    displayName: "n8n",
    state,
    canLaunch: false,
    launchUrl: null,
    inviteUrl: null,
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
    ["invite_pending", "Задать пароль"],
    ["ready", "Открыть n8n"],
    ["attention", "Проверить состояние"],
    ["expired", "Что делать дальше"],
  ] as const)(
    "%s имеет ровно одно уместное primary-действие",
    (state, actionName) => {
      render(<StudentN8nAccessCard access={access(state)} />);
      const action = screen.getByRole(state === "ready" || state === "invite_pending" || state === "locked" || state === "license_blocked" || state === "expired" ? "link" : "button", {
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
    ).toBe("https://n8n.example.test");
  });

  it("ведёт на приглашение n8n, пока ученик не задал пароль", () => {
    render(<StudentN8nAccessCard access={access("invite_pending")} />);
    expect(
      screen.getByRole("link", { name: "Задать пароль" }).getAttribute("href"),
    ).toBe("https://n8n.example.test/signup?token=invite-token");
    // Кнопка запуска в этом состоянии увела бы на форму входа без пароля.
    expect(screen.queryByRole("link", { name: "Открыть n8n" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Проверить состояние" }),
    ).toBeTruthy();
  });

  it.each(["ready", "invite_pending"] as const)(
    "%s показывает ученику настоящий адрес инструмента",
    (state) => {
      render(<StudentN8nAccessCard access={access(state)} />);
      const address = screen.getByRole("link", { name: "n8n.example.test" });
      expect(address.getAttribute("href")).toBe("https://n8n.example.test");
    },
  );

  it("не обещает ученику перепроверку доступа на каждом запросе", () => {
    render(<StudentN8nAccessCard access={access("ready")} />);
    expect(screen.queryByText(/при каждом запросе/i)).toBeNull();
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
