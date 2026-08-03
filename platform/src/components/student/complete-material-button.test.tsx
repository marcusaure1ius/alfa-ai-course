// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CompleteMaterialButton } from "./complete-material-button";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

beforeEach(() => {
  refresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function successfulFetch() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ csrfToken: "csrf-token" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 200 }));
}

describe("CompleteMaterialButton", () => {
  it("keeps completion success mounted until the user chooses a destination", async () => {
    successfulFetch();
    render(
      <CompleteMaterialButton
        materialId="material-1"
        completed={false}
        nextHref="/student/materials/next"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Завершить материал" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Да, завершить" }));

    expect(await screen.findByText("Материал завершён")).toBeTruthy();
    expect(
      screen.getByRole("status").textContent,
    ).toContain("Материал завершён");
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Материал завершён" }),
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "Следующий материал" }).getAttribute(
        "href",
      ),
    ).toBe("/student/materials/next");
    expect(
      screen.getByRole("link", { name: "В программу" }).getAttribute("href"),
    ).toBe("/student/program");
  });

  it("shows one program destination after the final material", async () => {
    successfulFetch();
    render(
      <CompleteMaterialButton
        materialId="last-material"
        completed={false}
        nextHref={null}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Завершить материал" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Да, завершить" }));

    expect(await screen.findByText("Материал завершён")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "В программу" })).toHaveLength(1);
    expect(
      screen.queryByRole("link", { name: "Посмотреть программу" }),
    ).toBeNull();
  });

  it("announces a failed update without closing the confirmation", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csrfToken: "csrf-token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    render(
      <CompleteMaterialButton
        materialId="material-1"
        completed={false}
        nextHref={null}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Завершить материал" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Да, завершить" }));

    expect(
      await screen.findByText("Не удалось сохранить. Попробуйте ещё раз."),
    ).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
