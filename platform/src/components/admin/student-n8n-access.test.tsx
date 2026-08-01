// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { StudentN8nAccessControl } from "./student-n8n-access";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(cleanup);

describe("StudentN8nAccessControl", () => {
  it("не содержит автоматических accessibility violations", async () => {
    const { container } = render(
      <StudentN8nAccessControl
        studentId="student-1"
        access={{
          environmentId: "environment-1",
          environmentName: "Основная среда",
          environmentReady: true,
          status: null,
          expiresAt: null,
        }}
        licenseGate={{ ready: true }}
        expiryDates={{
          minimum: "2026-08-01",
          recommended: "2026-08-30",
          maximum: "2027-07-31",
        }}
      />,
    );
    const results = await axe(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it("не позволяет выдать ссылку без license evidence", () => {
    render(
      <StudentN8nAccessControl
        studentId="student-1"
        access={{
          environmentId: "environment-1",
          environmentName: "Основная среда",
          environmentReady: true,
          status: null,
          expiresAt: null,
        }}
        licenseGate={{ ready: false, reason: "Нужно подтверждение." }}
        expiryDates={{
          minimum: "2026-08-01",
          recommended: "2026-08-30",
          maximum: "2027-07-31",
        }}
      />,
    );

    const button = screen.getByRole("button", { name: "Открыть доступ к n8n" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Доступ к n8n пока закрыт")).toBeTruthy();
    expect(screen.getByText("Нужно подтверждение.")).toBeTruthy();
  });

  it("объясняет отсутствие основной среды", () => {
    render(
      <StudentN8nAccessControl
        studentId="student-1"
        access={null}
        licenseGate={{ ready: false, reason: "Нужно подтверждение." }}
        expiryDates={{
          minimum: "2026-08-01",
          recommended: "2026-08-30",
          maximum: "2027-07-31",
        }}
      />,
    );

    expect(
      screen.getByText("n8n пока нельзя назначить: основная среда ещё не создана."),
    ).toBeTruthy();
  });

  it("оставляет отзыв доступным после удаления license config", () => {
    render(
      <StudentN8nAccessControl
        studentId="student-1"
        access={{
          environmentId: "environment-1",
          environmentName: "Основная среда",
          environmentReady: true,
          status: "active",
          expiresAt: "2026-08-30T23:59:59.000Z",
        }}
        licenseGate={{ ready: false, reason: "Gate закрыт." }}
        expiryDates={{
          minimum: "2026-08-01",
          recommended: "2026-08-30",
          maximum: "2027-07-31",
        }}
      />,
    );

    const button = screen.getByRole("button", { name: "Отозвать доступ к n8n" });
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });
});
