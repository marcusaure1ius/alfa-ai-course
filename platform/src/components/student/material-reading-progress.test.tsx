// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MaterialReadingProgress,
  normalizeReadingPosition,
} from "./material-reading-progress";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});

describe("MaterialReadingProgress", () => {
  it("bounds and validates persisted heading identifiers", () => {
    expect(normalizeReadingPosition("  контекст-2 ")).toBe("контекст-2");
    expect(normalizeReadingPosition("#context")).toBeNull();
    expect(normalizeReadingPosition("a".repeat(161))).toBeNull();
    expect(normalizeReadingPosition(null)).toBeNull();
  });

  it("offers an explicit resume action and focuses the saved heading", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    render(
      <>
        <h2 id="контекст" tabIndex={-1} data-reading-anchor>
          Контекст
        </h2>
        <MaterialReadingProgress
          materialId="material-1"
          initialPosition="контекст"
        />
      </>,
    );

    const resume = await screen.findByRole("button", {
      name: "Вернуться к месту",
    });
    fireEvent.click(resume);

    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Контекст" }),
    );
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(window.location.hash).toBe("#%D0%BA%D0%BE%D0%BD%D1%82%D0%B5%D0%BA%D1%81%D1%82");
  });

  it("debounces a bounded server-side reading-position update", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csrfToken: "csrf-token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    render(
      <>
        <h2
          id="next-step"
          data-reading-anchor
          ref={(node) => {
            if (node) {
              node.getBoundingClientRect = () =>
                ({ top: 120 }) as DOMRect;
            }
          }}
        >
          Next step
        </h2>
        <MaterialReadingProgress
          materialId="material-1"
          initialPosition={null}
        />
      </>,
    );

    fireEvent.scroll(window);
    fireEvent.scroll(window);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const update = fetchMock.mock.calls[1];
    expect(update?.[0]).toBe("/api/student/materials/material-1/progress");
    expect(JSON.parse(String((update?.[1] as RequestInit | undefined)?.body))).toEqual({
      lastPosition: "next-step",
    });
  });

  it("serializes position saves and never rewrites completion state", async () => {
    vi.useFakeTimers();
    let firstTop = 120;
    let secondTop = 260;
    let releaseFirstUpdate!: () => void;
    const firstUpdate = new Promise<Response>((resolve) => {
      releaseFirstUpdate = () => resolve(new Response(null, { status: 200 }));
    });
    const updateBodies: string[] = [];
    let updateCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      if (String(input) === "/api/auth/csrf") {
        return Promise.resolve(
          new Response(JSON.stringify({ csrfToken: "csrf-token" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      updateBodies.push(String(init?.body));
      updateCount += 1;
      return updateCount === 1
        ? firstUpdate
        : Promise.resolve(new Response(null, { status: 200 }));
    });

    render(
      <>
        <h2
          id="first"
          data-reading-anchor
          ref={(node) => {
            if (node) node.getBoundingClientRect = () => ({ top: firstTop }) as DOMRect;
          }}
        />
        <h2
          id="second"
          data-reading-anchor
          ref={(node) => {
            if (node) node.getBoundingClientRect = () => ({ top: secondTop }) as DOMRect;
          }}
        />
        <MaterialReadingProgress materialId="material-1" initialPosition={null} />
      </>,
    );

    fireEvent.scroll(window);
    await act(async () => vi.advanceTimersByTimeAsync(700));
    firstTop = 100;
    secondTop = 120;
    fireEvent.scroll(window);
    await act(async () => vi.advanceTimersByTimeAsync(700));

    expect(updateBodies).toHaveLength(1);
    releaseFirstUpdate();
    await act(async () => {
      await firstUpdate;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(updateBodies.map((body) => JSON.parse(body))).toEqual([
      { lastPosition: "first" },
      { lastPosition: "second" },
    ]);
  });
});
