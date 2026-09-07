import { test, expect } from "@playwright/test";
test("homepage navigation, protection preview and FAQ", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Made to be watched.Not passed around.",
  );
  await page.getByRole("button", { name: "Play preview animation" }).click();
  await expect(page.getByRole("button", { name: "Pause preview animation" })).toBeVisible();
  await page.getByRole("button", { name: "Try revoking this session" }).click();
  await expect(page.getByText("Session ended", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reset preview" }).click();
  await page
    .locator("summary")
    .filter({ hasText: "Does this make videos impossible to copy?" })
    .click();
  await expect(page.getByText(/No browser player can prevent every recording/)).toBeVisible();
  await page.getByRole("link", { name: "Read the integration guide" }).click();
  await expect(page).toHaveURL(/\/docs$/);
  expect(errors).toEqual([]);
});
test("mobile homepage fits viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expect(page.getByRole("link", { name: "Get started" })).toBeVisible();
});
test("register, open onboarding, create site and inspect DNS verification", async ({ page }) => {
  const email = `browser-${Date.now()}@example.com`;
  await page.goto("/register");
  await page.getByPlaceholder("Organization").fill("Browser test workspace");
  await page.getByPlaceholder("owner@example.com").fill(email);
  await page
    .getByPlaceholder("12+ chars, upper/lowercase and number")
    .fill("Browser-test-password-2026");
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/onboarding$/, { timeout: 20000 });
  await expect(page.getByText("Verify your email.", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Sites", exact: true }).click();
  await page.getByLabel("Site name", { exact: true }).fill("Learning portal");
  await page.getByLabel("Domain", { exact: true }).fill("learn.example.com");
  await page.getByRole("button", { name: "Add site", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Learning portal", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Verify domain", exact: true }).click();
  await expect(page.getByText("unpirator-verification=", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});
