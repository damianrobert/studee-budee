import { expect, test } from "@playwright/test";
import { login } from "./helpers";

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

test("stats: heatmap, weekly charts, loop balance, totals", async ({ page }) => {
  await login(page);
  const main = page.getByRole("main");

  // A Build session with output, three days ago.
  const d = new Date();
  d.setDate(d.getDate() - 3);
  d.setHours(12, 0, 0, 0);
  await main.getByRole("button", { name: "Log past session" }).click();
  const dialog = page.getByRole("dialog", { name: "Log a past session" });
  await dialog.getByLabel("Started at").fill(`${dayKey(d)}T12:00`);
  await dialog.getByLabel("Duration (minutes)").fill("30");
  await dialog.getByText("Build", { exact: true }).click();
  await dialog.getByLabel("I produced something visible").check();
  await dialog.getByRole("button", { name: "Log session" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("link", { name: "Stats" }).first().click();
  await expect(page).toHaveURL("/stats");
  await expect(page.getByRole("heading", { name: "Stats", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Activity, last 365 days" })).toBeVisible();

  // 365 day cells; the logged day is a counted day.
  await expect(page.locator("[data-day]")).toHaveCount(365);
  const cell = page.locator(`[data-day="${dayKey(d)}"]`);
  expect(Number(await cell.getAttribute("data-level"))).toBeGreaterThanOrEqual(2);
  await cell.hover();
  await expect(page.getByText(/session(s)?, \d+ min/).first()).toBeVisible();

  // Weekly + monthly bar charts, with the target line.
  await expect(page.getByRole("heading", { name: "Sessions per week" })).toBeVisible();
  // Target lines: sessions/week and artifacts/month.
  await expect(page.locator(".recharts-reference-line-line")).toHaveCount(2);
  await expect(page.locator("table caption", { hasText: "Sessions per week" })).toHaveCount(1);
  await expect(page.getByText(/% over the last 12 weeks/)).toBeVisible();

  // Loop balance lists all four stages with counts.
  const loop = page.getByRole("list", { name: "Sessions per stage" });
  for (const stage of ["Pain", "Build", "Break", "Explain"]) {
    await expect(loop.getByText(stage, { exact: true })).toBeVisible();
  }
  await expect(loop.getByRole("listitem").nth(1)).toContainText(/[1-9]\d* · \d+%/);

  await expect(page.getByRole("heading", { name: "Postmortems written" })).toBeVisible();
  await expect(page.getByText("Deliberate (chaos)")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Topics completed" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Artifacts published" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reading items read" })).toBeVisible();
  // No hours headline.
  await expect(page.getByText(/total hours|hours studied|\d+ ?h\b/i)).toHaveCount(0);

  await page.getByRole("link", { name: "Session history" }).click();
  await expect(page).toHaveURL("/sessions");
});
