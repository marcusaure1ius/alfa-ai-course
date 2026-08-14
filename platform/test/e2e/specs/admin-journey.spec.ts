import { expect, test } from "@playwright/test";

import { E2E_ADMIN, E2E_COURSE, E2E_STUDENT } from "../credentials";
import { assertNoPageErrors, login, watchPageErrors } from "./helpers";

test("администратор видит курс, программу и ученика", async ({ page }) => {
  const errors = watchPageErrors(page);

  await login(page, E2E_ADMIN);
  await page.waitForURL("**/admin/**");

  await page.goto("/admin/courses");
  await expect(page.getByText(E2E_COURSE.title).first()).toBeVisible();

  await page.goto("/admin/program");
  await expect(page.getByText(E2E_COURSE.title).first()).toBeVisible();
  await expect(page.getByText("1 раздел · 2 задания")).toBeVisible();

  await page.goto("/admin/students");
  await expect(
    page.getByRole("link", { name: new RegExp(E2E_STUDENT.email) }),
  ).toBeVisible();

  await page.goto("/admin/tools");
  await expect(
    page.getByRole("heading", { name: "Учебные инструменты" }),
  ).toBeVisible();

  assertNoPageErrors(errors);
});
