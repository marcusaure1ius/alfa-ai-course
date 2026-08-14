import { expect, type Page } from "@playwright/test";

export type Credentials = { email: string; password: string };

/**
 * Копит критические ошибки страницы; assertNoPageErrors вызывается в конце
 * сценария. Ошибки загрузки ресурсов (favicon и т.п.) не считаются.
 */
export function watchPageErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    // Ожидаемые пробы сессии до входа отвечают 401/403 — это не дефект.
    if (/Failed to load resource.*(401|403)/.test(message.text())) return;
    errors.push(`console: ${message.text()}`);
  });
  return () => errors;
}

export function assertNoPageErrors(collect: () => string[]): void {
  const errors = collect();
  expect(errors, errors.join("\n")).toEqual([]);
}

export async function login(page: Page, credentials: Credentials): Promise<void> {
  await page.goto("/login");
  const email = page.getByPlaceholder("name@example.com");
  // Поля логина readonly до первого взаимодействия (анти-autofill).
  await email.click();
  await email.fill(credentials.email);
  const password = page.getByPlaceholder("Введите пароль");
  await password.click();
  await password.fill(credentials.password);
  await page.getByRole("button", { name: "Войти" }).click();
}
