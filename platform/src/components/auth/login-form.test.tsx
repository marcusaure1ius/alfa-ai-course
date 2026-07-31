// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

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
  it("keeps entered credentials readable on the inverse login surface", () => {
    render(<LoginForm inverse />);

    for (const label of ["Email", "Пароль"]) {
      const input = screen.getByLabelText(label);
      expect(input.className).toContain("font-sans");
      expect(input.className).toContain("text-foreground");
      expect(input.className).toContain("caret-foreground");
    }
  });

  it("defers the protected credential preview until form interaction", () => {
    render(<LoginForm inverse />);

    const email = screen.getByLabelText("Email") as HTMLInputElement;
    const password = screen.getByLabelText("Пароль") as HTMLInputElement;
    expect(email.readOnly).toBe(true);
    expect(password.readOnly).toBe(true);

    fireEvent.focus(email);
    expect(email.readOnly).toBe(false);
    expect(password.readOnly).toBe(false);
  });

  it.each([false, true])(
    "has no automated accessibility violations (inverse=%s)",
    async (inverse) => {
      const { container } = render(<LoginForm inverse={inverse} />);
      const results = await axe(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results.violations).toEqual([]);
    },
  );

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
      expect(push).toHaveBeenCalledWith("/admin/tools"),
    );
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("exposes a real loading state while authentication is pending", async () => {
    let resolveLogin!: (response: Response) => void;
    const request = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ csrfToken: "csrf.one" }))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveLogin = resolve;
          }),
      );
    vi.stubGlobal("fetch", request);

    render(<LoginForm inverse />);
    fillCredentials();
    fireEvent.click(screen.getByRole("button", { name: "Войти" }));

    const form = screen.getByRole("button", { name: "Проверяем…" }).closest("form");
    expect(form?.getAttribute("aria-busy")).toBe("true");
    expect((screen.getByLabelText("Email") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Пароль") as HTMLInputElement).disabled).toBe(true);

    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    resolveLogin(jsonResponse({ user: { role: "student" } }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/student"));
  });
});
