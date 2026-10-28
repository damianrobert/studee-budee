import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

// Calls the real Gemini API (and Brave Search when BRAVE_SEARCH_API_KEY is set), so it only
// checks the shape of what comes back. The prompt asks for a tiny roadmap to keep it cheap.

const AI_TIMEOUT = 180_000;

async function aiOn(page: Page) {
  await page.goto("/settings");
  return page.getByText(/Enabled · Google Gemini/).isVisible();
}

test("without a key roadmaps can't be created", async ({ page }) => {
  await login(page);
  test.skip(await aiOn(page), "AI is enabled on this stack");
  await page.goto("/roadmaps");
  await expect(page.getByText(/Roadmaps are planned by the AI, which is turned off/)).toBeVisible();
  await expect(page.getByRole("button", { name: /roadmap/i })).toHaveCount(0);
});

test("generate a roadmap, explore it, change it with prompts", async ({ page }) => {
  test.setTimeout(4 * AI_TIMEOUT);
  await login(page);
  test.skip(!(await aiOn(page)), "No GOOGLE_GEMINI_API_KEY on this stack");

  await page.goto("/roadmaps");
  await page.getByRole("button", { name: /New roadmap|Plan my first roadmap/ }).click();
  await page
    .getByLabel("What do you want to learn?")
    .fill(
      "Keep it tiny for a test: exactly 2 stages with 2 steps each. Docker networking basics: bridge networks and port publishing, then container DNS.",
    );
  await page.getByRole("button", { name: "Create roadmap" }).click();
  await expect(page.getByRole("status")).toContainText("Planning the stages");
  await page.waitForURL(/\/roadmaps\/[a-z0-9]+$/, { timeout: AI_TIMEOUT });

  // The map: stage overview, stages with step cards.
  const overview = page.getByRole("navigation", { name: "Stages" });
  await expect(overview.getByRole("link")).toHaveCount(2);
  const cards = page.locator("main ol a[href*='step=']");
  await expect(cards).toHaveCount(4);
  await expect(page.getByText("0 of 4 steps done (0%)")).toBeVisible();
  const resourceCounts = await cards.allInnerTexts();
  expect(resourceCounts.filter((t) => /\d+ resources?/.test(t)).length).toBeGreaterThan(0);

  // A step's drawer: resources are external links, status changes, progress updates.
  await cards.first().click();
  const drawer = page.getByRole("dialog");
  await expect(page).toHaveURL(/\?step=/);
  const links = drawer.locator("a[target=_blank]");
  expect(await links.count()).toBeGreaterThan(0);
  expect(await links.first().getAttribute("href")).toMatch(/^https?:\/\//);
  await drawer.getByRole("button", { name: "Done" }).click();
  await expect(drawer.getByRole("button", { name: "Done" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("1 of 4 steps done (25%)")).toBeVisible();

  // Manual link, then remove it again.
  const before = await links.count();
  await drawer.getByRole("button", { name: "Add a link" }).click();
  await drawer.getByLabel("Link").fill("https://docs.docker.com/engine/network/");
  await drawer.getByLabel("Title").fill("My own pick");
  await drawer.getByRole("button", { name: "Add", exact: true }).click();
  await expect(drawer.getByRole("link", { name: "My own pick" })).toBeVisible();
  const mine = drawer.locator("li", { has: page.getByRole("link", { name: "My own pick" }) });
  await mine.getByRole("button", { name: "Remove resource" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
  await expect(drawer.getByRole("link", { name: "My own pick" })).toHaveCount(0);
  await expect(links).toHaveCount(before);

  // Ask the AI for more on this step.
  await drawer.getByRole("button", { name: "Find more resources" }).click();
  const stepOutcome = drawer.locator("form p[role=status], form p[role=alert]");
  await expect(stepOutcome).toBeVisible({ timeout: AI_TIMEOUT });
  await expect(stepOutcome).toHaveAttribute("role", "status");
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/\?step=/);

  // Change the whole roadmap: a third stage; the step marked done stays done.
  await page
    .getByLabel(/Change the roadmap/)
    .fill(
      "Add a third stage with exactly 1 step about Docker Compose networks. Change nothing else.",
    );
  await page.getByRole("button", { name: "Apply" }).click();
  const outcome = page.locator("form p[role=status], form p[role=alert]");
  await expect(outcome).toBeVisible({ timeout: AI_TIMEOUT });
  await expect(outcome).toHaveAttribute("role", "status");
  await expect(overview.getByRole("link")).toHaveCount(3);
  await expect(page.getByText(/1 of 5 steps done/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await expect(page.getByText("Add a third stage with exactly 1 step")).toBeVisible();

  // Rename and delete.
  await page.getByRole("button", { name: "Rename roadmap" }).click();
  await page.getByRole("button", { name: "Delete roadmap" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await page.waitForURL(/\/roadmaps$/);
});
