// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "./login-form";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

afterEach(() => {
  cleanup();
  push.mockReset();
  refresh.mockReset();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fillCredentials() {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "person@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Пароль"), {
    target: { value: "correct-horse-battery-staple" },
  });
}

describe("LoginForm", () => {
  it("keeps the second factor hidden until the server requests it", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ csrfToken: "csrf.one" }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            code: "MFA_REQUIRED",
            error: "Требуется подтверждённый второй фактор.",
          },
          403,
        ),
      );
    vi.stubGlobal("fetch", request);

    render(<LoginForm />);
    expect(screen.queryByLabelText("Код подтверждения")).toBeNull();
    fillCredentials();
    fireEvent.click(screen.getByRole("button", { name: "Войти" }));

    expect(await screen.findByLabelText("Код подтверждения")).toBeTruthy();
    expect(
      (screen.getByRole("button", {
        name: "Подтвердить вход",
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("routes students directly to their cabinet", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ csrfToken: "csrf.one" }))
      .mockResolvedValueOnce(
        jsonResponse({ user: { role: "student" } }),
      );
    vi.stubGlobal("fetch", request);

    render(<LoginForm />);
    fillCredentials();
    fireEvent.click(screen.getByRole("button", { name: "Войти" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/student"));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("completes an admin login after the requested code", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ csrfToken: "csrf.one" }))
      .mockResolvedValueOnce(
        jsonResponse({ code: "MFA_REQUIRED", error: "Нужен код." }, 403),
      )
      .mockResolvedValueOnce(jsonResponse({ csrfToken: "csrf.two" }))
      .mockResolvedValueOnce(jsonResponse({ user: { role: "admin" } }));
    vi.stubGlobal("fetch", request);

    render(<LoginForm />);
    fillCredentials();
    fireEvent.click(screen.getByRole("button", { name: "Войти" }));
    const code = await screen.findByLabelText("Код подтверждения");
    fireEvent.change(code, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить вход" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/admin/infrastructure"),
    );
    expect(refresh).toHaveBeenCalledOnce();
  });
});
