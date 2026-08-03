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
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  cleanup();
  storage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
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
    expect(
      screen.getByRole("link", { name: "памятке помощи" }).getAttribute("href"),
    ).toBe("/student/help#tool-problem");
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
    const success = await screen.findByRole("status");
    expect(success.textContent).toContain("Сообщение скопировано");
    expect(document.activeElement).toBe(success);
    expect(screen.getByLabelText("Предпросмотр сообщения")).toBeTruthy();
  });

  it("excludes secret-like details from preview and clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<ToolProblemDialog state="Среда ещё не готова" />);
    fireEvent.click(screen.getByRole("button", { name: "Сообщить о проблеме" }));
    fireEvent.click(screen.getByLabelText("Сервис сообщает об ошибке"));
    fireEvent.change(screen.getByLabelText("Что видно на экране"), {
      target: { value: "token=sk-abcdefghijklmnopqrstuvwxyz123456" },
    });

    const preview = screen.getByLabelText(
      "Предпросмотр сообщения",
    ) as HTMLTextAreaElement;
    expect(preview.value).toContain("Подробности не включены");
    expect(preview.value).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
    expect(screen.getByRole("alert").textContent).toContain("исключены");

    fireEvent.click(screen.getByRole("button", { name: "Скопировать сообщение" }));
    await screen.findByRole("status");
    expect(writeText.mock.calls[0]?.[0]).not.toContain(
      "sk-abcdefghijklmnopqrstuvwxyz123456",
    );
  });

  it("keeps a selectable preview when clipboard is unavailable", async () => {
    render(<ToolProblemDialog state="Вход временно закрыт" />);
    fireEvent.click(screen.getByRole("button", { name: "Сообщить о проблеме" }));
    fireEvent.click(screen.getByLabelText("Другое"));
    fireEvent.click(screen.getByRole("button", { name: "Скопировать сообщение" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(
      /Текст остаётся ниже/i,
    );
    const preview = screen.getByLabelText(
      "Предпросмотр сообщения",
    ) as HTMLTextAreaElement;
    fireEvent.click(screen.getByRole("button", { name: "Выделить текст" }));
    expect(document.activeElement).toBe(preview);
    expect(preview.selectionEnd).toBe(preview.value.length);
  });

  it("unlocks and remains closable after a hanging clipboard call", async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(() => new Promise<void>(() => undefined)) },
    });
    render(<ToolProblemDialog state="Среду сейчас нельзя открыть" />);
    fireEvent.click(screen.getByRole("button", { name: "Сообщить о проблеме" }));
    fireEvent.click(screen.getByLabelText("Страница не открывается"));
    fireEvent.click(screen.getByRole("button", { name: "Скопировать сообщение" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(screen.getByRole("alert").textContent).toContain(
      "Автокопирование недоступно",
    );
    expect(
      (screen.getByRole("button", {
        name: "Скопировать сообщение",
      }) as HTMLButtonElement).disabled,
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
