// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { StudentN8nAccessCard } from "./student-n8n-access";

afterEach(cleanup);

describe("StudentN8nAccessCard", () => {
  it("не содержит автоматических accessibility violations", async () => {
    const { container } = render(
      <StudentN8nAccessCard
        access={{
          tool: "n8n",
          displayName: "n8n",
          state: "owner_setup_required",
          launchUrl: "https://n8n.example.test",
          expiresAt: "2026-08-30T20:59:59.000Z",
        }}
      />,
    );
    const results = await axe(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it("показывает безопасную owner setup инструкцию и только launch URL", () => {
    render(
      <StudentN8nAccessCard
        access={{
          tool: "n8n",
          displayName: "n8n",
          state: "owner_setup_required",
          launchUrl: "https://n8n.example.test",
          expiresAt: "2026-08-30T23:59:59.000Z",
        }}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Открыть n8n" }).getAttribute("href"),
    ).toBe("https://n8n.example.test");
    expect(screen.getByText(/не создаёт его скрыто/i)).toBeTruthy();
    expect(screen.queryByText(/provider|VPS|IP|тариф|стоимост/i)).toBeNull();
  });

  it("скрывает ссылку после окончания доступа", () => {
    render(
      <StudentN8nAccessCard
        access={{
          tool: "n8n",
          displayName: "n8n",
          state: "expired",
          launchUrl: null,
          expiresAt: "2026-07-30T23:59:59.000Z",
        }}
      />,
    );

    expect(
      (screen.getByRole("button", { name: "Открыть n8n" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      screen
        .getByRole("link", { name: /после окончания доступа/i })
        .getAttribute("href"),
    ).toBe("/student/help#tool-expired");
  });

  it("не обещает восстановление удалённой среды", () => {
    render(
      <StudentN8nAccessCard
        access={{
          tool: "n8n",
          displayName: "n8n",
          state: "attention",
          launchUrl: null,
          expiresAt: null,
        }}
      />,
    );

    expect(screen.getByText(/удалённые среды не восстанавливаются/i)).toBeTruthy();
    expect(screen.queryByText(/безопасно восстановить/i)).toBeNull();
  });
});
