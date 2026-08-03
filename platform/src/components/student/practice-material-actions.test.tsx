// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PracticeMaterialActions } from "./practice-material-actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: { getItem: vi.fn(() => null), setItem: vi.fn() },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PracticeMaterialActions", () => {
  it("promotes completion after a valid draft is prepared", async () => {
    let finishFrame!: FrameRequestCallback;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      finishFrame = callback;
      return 1;
    });
    render(
      <PracticeMaterialActions
        materialId="practice-1"
        completed={false}
        nextHref="/student/materials/next"
      />,
    );

    const prepare = screen.getByRole("button", { name: "Подготовить ответ" });
    const complete = screen.getByRole("button", { name: "Завершить практику" });
    expect(prepare.className).toContain("bg-primary");
    expect(complete.className).not.toContain("bg-primary");

    fireEvent.click(prepare);
    fireEvent.change(screen.getByLabelText("Ссылка на результат"), {
      target: { value: "https://example.test/result" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить черновик" }));
    await act(async () => finishFrame(0));
    fireEvent.click(await screen.findByRole("button", { name: "Готово" }));

    const edit = await screen.findByRole("button", { name: "Изменить черновик" });
    const promotedComplete = screen.getByRole("button", {
      name: "Завершить практику",
    });
    expect(edit.className).not.toContain("bg-primary");
    expect(promotedComplete.className).toContain("bg-primary");
  });
});
