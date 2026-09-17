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
  await page.getByRole("button", { name: "Open menu" }).click();
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Get started", exact: true })).toBeVisible();
});

test("dashboard requires a valid signed-in session", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
});

test("admin route looks like a normal missing page to non-admin visitors", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Page not found", exact: true })).toBeVisible();
  await expect(page.getByText("404", { exact: true })).toBeVisible();
});

test("unknown routes use the same clean not found page", async ({ page }) => {
  await page.goto("/this-page-does-not-exist");
  await expect(page.getByRole("heading", { name: "Page not found", exact: true })).toBeVisible();
});

test("auth forms show written validation without browser bubbles", async ({ page }) => {
  await page.goto("/register");
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(page.getByText("Organization name must be at least 2 characters.")).toBeVisible();
  await expect(page.getByText("Enter your email address.")).toBeVisible();
  await expect(page.getByText("Create a password.")).toBeVisible();

  const password = page.getByPlaceholder("8+ characters");
  await password.fill("Abcdef1");
  await expect(page.getByText("At least 8 characters").locator(".."))
    .not.toHaveClass(/text-emerald-700/);
  await password.fill("Abcdefg1");
  await expect(page.getByText("At least 8 characters").locator(".."))
    .toHaveClass(/text-emerald-700/);

  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Enter your email address.")).toBeVisible();
  await expect(page.getByText("Enter your password.")).toBeVisible();
});

test("registration starts without an active plan", async ({ page }) => {
  const email = `browser-${Date.now()}@example.com`;
  await page.goto("/register");
  await page.getByPlaceholder("Acme Learning").fill("Browser test workspace");
  await page.getByPlaceholder("owner@example.com").fill(email);
  await page.getByPlaceholder("8+ characters").fill("Browser-test-password-2026");
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/onboarding$/, { timeout: 20000 });
  await expect(page.getByText("Verify your email.", { exact: true })).toBeVisible();

  const billing = await page.evaluate(async () => {
    const response = await fetch("/control-api/v1/billing", { credentials: "include" });
    if (!response.ok) throw new Error(`Billing request failed: ${response.status}`);
    return response.json();
  });
  expect(billing.subscription).toBeNull();
  expect(billing.entitlements.max_sites).toBe(0);

  await page.getByRole("link", { name: "Plan", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/plans$/);
  await expect(page.getByText("Current plan", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});
