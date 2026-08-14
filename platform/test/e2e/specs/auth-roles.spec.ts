import { expect, test } from "@playwright/test";

import { E2E_ADMIN, E2E_STUDENT } from "../credentials";
import { assertNoPageErrors, login, watchPageErrors } from "./helpers";

test("ученик входит, не видит админку и выходит", async ({ page }) => {
  const errors = watchPageErrors(page);

  await login(page, E2E_STUDENT);
  await page.waitForURL("**/student");
  await expect(
    page.getByRole("heading", { name: "Мои курсы" }),
  ).toBeVisible();

  const apiCheck = await page.request.get("/api/admin/access-check");
  expect(apiCheck.status()).toBe(403);

  const adminPage = await page.goto("/admin/tools");
  expect(adminPage?.status()).toBe(403);

  await page.goto("/student");
  const profileMenu = page.getByRole("button", { name: /меню профиля/ });
  if (await profileMenu.isVisible()) {
    await profileMenu.click();
    await page.getByRole("menuitem", { name: "Выйти" }).click();
  } else {
    await page.getByRole("button", { name: "Открыть навигацию" }).click();
    await page
      .getByRole("button", { name: "Выйти" })
      .filter({ visible: true })
      .first()
      .click();
  }
  await page.waitForURL("**/login");
  await expect(page.getByRole("button", { name: "Войти" })).toBeVisible();

  assertNoPageErrors(errors);
});

test("администратор входит в рабочую область и выходит", async ({ page }) => {
  const errors = watchPageErrors(page);

  await login(page, E2E_ADMIN);
  await page.waitForURL("**/admin/**");
  await expect(
    page.getByRole("heading", { name: "Учебные инструменты" }),
  ).toBeVisible();

  const apiCheck = await page.request.get("/api/admin/access-check");
  expect(apiCheck.status()).toBe(200);

  await page.getByRole("button", { name: /меню профиля/ }).click();
  await page.getByRole("menuitem", { name: "Выйти" }).click();
  await page.waitForURL("**/login");

  assertNoPageErrors(errors);
});
