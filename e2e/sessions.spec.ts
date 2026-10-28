import { expect, test } from "@playwright/test";
import { login } from "./helpers";

const pad = (n: number) => String(n).padStart(2, "0");
const local = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

test("log past sessions → they count toward the streak and show in history", async ({ page }) => {
  await login(page);
  const main = page.getByRole("main");

  for (const daysAgo of [2, 1]) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(12, 0, 0, 0);
    await main.getByRole("button", { name: "Log past session" }).click();
    const dialog = page.getByRole("dialog", { name: "Log a past session" });
    await dialog.getByLabel("Started at").fill(local(d));
    await dialog.getByLabel("Duration (minutes)").fill("25");
    await dialog.getByLabel("What did I do?").fill(`Practice ${daysAgo}`);
    await dialog.getByRole("button", { name: "Log session" }).click();
    await expect(dialog).toBeHidden();
  }

  // Yesterday + the day before = 2, with today not yet counted.
  const streak = main.locator("text=Longest").locator("..");
  await expect(streak).toContainText(/\b[2-9]\d*\s*days/);

  await page.goto("/sessions");
  await expect(page.getByText("Practice 1")).toBeVisible();
  await expect(page.getByText("Practice 2")).toBeVisible();
});

test("screenshots", async ({ page, browser }) => {
  await login(page);
  await page.screenshot({ path: "test-results/shots/today.png", fullPage: true });
  await page.goto("/projects");
  await page.locator("a[href^='/projects/c']").first().click();
  await page.getByRole("region", { name: "Pain column" }).waitFor();
  await page.screenshot({ path: "test-results/shots/board.png", fullPage: true });
  await page.goto("/stats");
  await page.locator(".recharts-bar-rectangle").first().waitFor();
  await page.screenshot({ path: "test-results/shots/stats.png", fullPage: true });
  await page.goto("/flashcards");
  await page.screenshot({ path: "test-results/shots/flashcards.png", fullPage: true });

  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: "dark",
  });
  const m = await ctx.newPage();
  await login(m);
  await m.screenshot({ path: "test-results/shots/today-mobile-dark.png", fullPage: true });
  await m.getByRole("button", { name: "Open menu" }).click();
  await m.screenshot({ path: "test-results/shots/menu-mobile-dark.png" });
  await m.keyboard.press("Escape");
  await m.goto("/stats");
  await m.locator(".recharts-bar-rectangle").first().waitFor();
  await m.screenshot({ path: "test-results/shots/stats-mobile-dark.png", fullPage: true });
  // flashcards.spec leaves one card from a note due.
  await m.goto("/flashcards/review");
  await m.getByRole("button", { name: "Show answer" }).click();
  await m.screenshot({ path: "test-results/shots/review-mobile-dark.png", fullPage: true });
  await ctx.close();
});
