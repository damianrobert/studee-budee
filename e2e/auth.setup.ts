import { expect, test as setup } from "@playwright/test";

// Logs in once and shares the cookie: the login rate limit (5/min) would trip otherwise.
setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Password").fill(process.env.APP_PASSWORD ?? "change-me");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
  await page.context().storageState({ path: "e2e/.auth/state.json" });
});
