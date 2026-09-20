import { test, expect } from "@playwright/test";

const password = "securepass1";
const unique = Date.now();

test("register → workspace → logout → protected redirect", async ({ page }) => {
  const email = `e2e-${unique}@example.com`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill("E2E User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app/);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login/);
});
