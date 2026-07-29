// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import {
  InfrastructureView,
  type InfrastructureViewState,
} from "./infrastructure-view";

afterEach(cleanup);

describe("infrastructure accessibility", () => {
  it.each(["empty", "list", "error"] satisfies InfrastructureViewState[])(
    "has no automated axe violations in the %s state",
    async (state) => {
      const { container } = render(<InfrastructureView state={state} />);
      const results = await axe(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results.violations).toEqual([]);
    },
  );

  it("keeps the primary action and status announcement explicit", () => {
    const { getByRole, getByText } = render(
      <InfrastructureView state="empty" />,
    );
    expect(
      (getByRole("button", { name: "Создать среду" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(getByText("Учебных сред нет.").getAttribute("aria-live")).toBe(
      "polite",
    );
  });
});
