// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { ToolAccessGate } from "./tool-access-gate";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(cleanup);

describe("ToolAccessGate", () => {
  it("hides the global close action without active assignments", () => {
    const { container } = render(
      <ToolAccessGate
        toolType="n8n"
        displayName="n8n"
        enabled
        activeAccessCount={0}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows an exact reversible confirmation for active assignments", async () => {
    render(
      <ToolAccessGate
        toolType="n8n"
        displayName="n8n"
        enabled
        activeAccessCount={1}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Закрыть доступ всем" }));
    expect(
      screen.getByRole("heading", { name: "Закрыть ученикам доступ к n8n?" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/недоступны для 1 активного назначения/),
    ).toBeTruthy();
    expect(screen.getByText(/Назначения и среда сохранятся/)).toBeTruthy();
    const results = await axe(document.body, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it("offers one direct recovery action while service access is closed", () => {
    render(
      <ToolAccessGate
        toolType="n8n"
        displayName="n8n"
        enabled={false}
        activeAccessCount={4}
      />,
    );
    expect(screen.getByRole("button", { name: "Открыть доступ" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Закрыть доступ всем" })).toBeNull();
  });
});
