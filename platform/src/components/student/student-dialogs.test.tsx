// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PracticeSubmissionDialog } from "./practice-submission-dialog";
import { ToolProblemDialog } from "./tool-problem-dialog";

const storage = new Map<string, string>();

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => storage.clear(),
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
});

afterEach(() => {
  cleanup();
  storage.clear();
  vi.restoreAllMocks();
});

describe("student dialogs", () => {
  it("blocks repeat draft saves while local persistence is pending", async () => {
    let finishFrame!: FrameRequestCallback;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      finishFrame = callback;
      return 1;
    });

    render(<PracticeSubmissionDialog materialId="practice-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Подготовить ответ" }));
    fireEvent.change(screen.getByLabelText("Ссылка на результат"), {
      target: { value: "https://example.test/result" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить черновик" }));

    expect(screen.getByRole("dialog").getAttribute("aria-busy")).toBe("true");
    expect(
      (screen.getByRole("button", { name: "Сохраняем…" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Ссылка на результат") as HTMLInputElement).disabled,
    ).toBe(true);

    await act(async () => finishFrame(0));
    expect(await screen.findByText("Черновик сохранён")).toBeTruthy();
  });

  it("keeps the practice form usable when localStorage read is denied", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: vi.fn(),
      },
    });

    render(<PracticeSubmissionDialog materialId="practice-denied" />);
    fireEvent.click(screen.getByRole("button", { name: "Подготовить ответ" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      screen.getByText(
        "Черновики браузера недоступны. Ссылку можно подготовить, но сохраните копию отдельно.",
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText("Ссылка на результат")).toBeTruthy();
  });

  it("rejects result URLs that contain credentials", () => {
    render(<PracticeSubmissionDialog materialId="practice-secret" />);
    fireEvent.click(screen.getByRole("button", { name: "Подготовить ответ" }));
    fireEvent.change(screen.getByLabelText("Ссылка на результат"), {
      target: { value: "https://user:password@example.test/result" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить черновик" }));

    expect(
      screen.getByText("Ссылка не должна содержать логин или пароль."),
    ).toBeTruthy();
  });

  it("blocks repeat clipboard actions while the message is being copied", async () => {
    let finishCopy!: () => void;
    const writeText = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishCopy = resolve;
        }),
    );
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<ToolProblemDialog state="Нужна проверка" />);
    fireEvent.click(screen.getByRole("button", { name: "Сообщить о проблеме" }));
    fireEvent.click(screen.getByLabelText("Страница не открывается"));
    fireEvent.click(screen.getByRole("button", { name: "Скопировать сообщение" }));

    expect(screen.getByRole("dialog").getAttribute("aria-busy")).toBe("true");
    expect(
      (screen.getByRole("button", { name: "Копируем…" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Страница не открывается") as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(writeText).toHaveBeenCalledOnce();

    await act(async () => finishCopy());
    expect(await screen.findByText("Сообщение подготовлено")).toBeTruthy();
  });
});
