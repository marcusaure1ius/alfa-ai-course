// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { N8nAccessRefresh } from "./n8n-access-refresh";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("N8nAccessRefresh", () => {
  it("обновляет route, когда состояние действительно изменилось", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ version: "student-tools-v1", tool: { state: "ready" } }),
      ),
    );
    render(<N8nAccessRefresh state="preparing" />);

    fireEvent.click(screen.getByRole("button", { name: "Проверить состояние" }));

    expect(await screen.findByText(/Состояние изменилось/i)).toBeTruthy();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("останавливает автоматические проверки после трёх попыток", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        version: "student-tools-v1",
        tool: { state: "preparing" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<N8nAccessRefresh state="preparing" auto />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("снимает pending после ограниченного timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
      ),
    );
    render(<N8nAccessRefresh state="attention" />);
    fireEvent.click(screen.getByRole("button", { name: "Проверить состояние" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });

    expect(screen.getByText(/заняла слишком много времени/i)).toBeTruthy();
    expect(
      (screen.getByRole("button", {
        name: "Проверить состояние",
      }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});
