import { expect, test } from "@playwright/test";

import { E2E_COURSE, E2E_STUDENT } from "../credentials";
import { assertNoPageErrors, login, watchPageErrors } from "./helpers";

test("ученик проходит материал и видит прогресс", async ({ page }) => {
  const errors = watchPageErrors(page);

  await login(page, E2E_STUDENT);
  await page.waitForURL("**/student");

  await expect(page.getByText(E2E_COURSE.title)).toBeVisible();
  await page.getByRole("link", { name: /Открыть курс/ }).click();
  await page.waitForURL("**/student/program**");
  await expect(
    page.getByRole("heading", { name: "Разделы курса" }),
  ).toBeVisible();

  await page.getByRole("link", { name: /Добро пожаловать/ }).first().click();
  await page.waitForURL("**/student/materials/**");
  await expect(
    page.getByRole("heading", { name: "Добро пожаловать" }).first(),
  ).toBeVisible();

  // Проекты desktop/mobile делят одну базу прогона: если материал уже
  // завершён предыдущим проектом, сначала снимаем отметку.
  const unmark = page.getByRole("button", { name: "Отметить непройденным" });
  if (await unmark.isVisible()) {
    await unmark.click();
    await expect(
      page.getByRole("button", { name: "Завершить материал" }),
    ).toBeVisible();
  }

  await page.getByRole("button", { name: "Завершить материал" }).click();
  await page.getByRole("button", { name: "Да, завершить" }).click();
  await expect(
    page.getByRole("heading", { name: "Материал завершён" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "В программу" }).click();
  await page.waitForURL("**/student/program**");

  await expect(page.getByText(/1 из 2/).first()).toBeVisible();

  assertNoPageErrors(errors);
});
