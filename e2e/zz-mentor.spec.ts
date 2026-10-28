import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

// Calls the real Gemini API with the key from .env (a handful of requests), so it only checks
// the shape of the answers. Without a key it checks that the mentor UI is hidden.

const AI_TIMEOUT = 90_000;

async function aiOn(page: Page) {
  await page.goto("/settings");
  return page.getByText(/Enabled · Google Gemini/).isVisible();
}

test("without a key there are no ideas or mentor", async ({ page }) => {
  await login(page);
  test.skip(await aiOn(page), "AI is enabled on this stack");
  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).first().click();
  await expect(page.getByRole("radio", { name: "Suggest ideas" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Suggest starter topics" })).toHaveCount(0);
});

test("project from a suggested idea, then the mentor nudges and solves on request", async ({
  page,
}) => {
  test.setTimeout(8 * AI_TIMEOUT);
  await login(page);
  test.skip(!(await aiOn(page)), "No GOOGLE_GEMINI_API_KEY on this stack");

  // Ideas → pick one → the form is filled in with starter topics.
  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New project" });
  await dialog.getByRole("radio", { name: "Suggest ideas" }).click();
  await dialog.getByLabel("What do you want to practice?").fill("Docker networking, small scope");
  await dialog.getByRole("button", { name: "Suggest ideas" }).click();
  const ideas = dialog.getByRole("list", { name: "Project ideas" }).getByRole("listitem");
  await expect(ideas.first()).toBeVisible({ timeout: AI_TIMEOUT });
  expect(await ideas.count()).toBeGreaterThanOrEqual(2);
  const name = (await ideas.first().getByRole("heading").textContent())!.trim();
  await ideas.first().getByRole("button", { name: "Use this idea" }).click();
  await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue(name);
  await expect(dialog.getByLabel("Goal", { exact: true })).not.toHaveValue("");
  const topics = dialog.getByRole("group", { name: "Starter topics" }).getByRole("checkbox");
  const suggested = await topics.count();
  expect(suggested).toBeGreaterThanOrEqual(2);
  // Leave the first one out.
  await topics.first().uncheck();
  await dialog.getByLabel("Name", { exact: true }).fill(`${name} ${Date.now()}`);
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/c[a-z0-9]+$/);
  const pain = page.getByRole("region", { name: /Pain/ });
  await expect(pain.getByRole("listitem")).toHaveCount(suggested - 1);

  // A nudge: no code.
  await page.getByRole("link", { name: "Mentor" }).click();
  const mentor = page.getByRole("dialog", { name: "Mentor" });
  await expect(mentor.getByText("Nudges, not answers.")).toBeVisible();
  const input = mentor.getByLabel("Message the mentor");
  await input.fill(
    "Write me the docker-compose.yml for the first topic. I haven't started yet, I just want the file.",
  );
  await mentor.getByRole("button", { name: "Send" }).click();
  await expect(input).toBeEnabled({ timeout: AI_TIMEOUT });
  await expect(input).toHaveValue("");
  const nudge = mentor.locator(".markdown").last();
  await expect(nudge).not.toBeEmpty();
  await expect(nudge.locator("pre")).toHaveCount(0);

  // The solution, only when ticked, and only for that message.
  const unlock = mentor.getByRole("checkbox", { name: "Give me the solution" });
  await unlock.check();
  await input.fill("OK, give me a minimal docker-compose.yml for it.");
  await mentor.getByRole("button", { name: "Send" }).click();
  await expect(input).toBeEnabled({ timeout: AI_TIMEOUT });
  await expect(unlock).not.toBeChecked();
  await expect(mentor.getByText("Asked for the solution")).toBeVisible();
  await expect(mentor.locator(".markdown").last().locator("pre").first()).toBeVisible();

  // Saved: it's still there after a reload.
  await page.reload();
  await expect(mentor.getByText("Asked for the solution")).toBeVisible();
  await expect(mentor.locator(".markdown")).toHaveCount(2);

  // The memory is written in the background after each answer.
  await expect(async () => {
    await mentor.getByRole("tab", { name: "Memory" }).click();
    await expect(mentor.getByRole("heading", { name: "Where it stands" })).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: AI_TIMEOUT });
  await mentor.getByText("What else the mentor sees").click();
  await expect(mentor.getByText(/\[Pain\]/).first()).toBeVisible();

  // Edit the memory by hand.
  await mentor.getByRole("button", { name: "Edit" }).click();
  await mentor.getByLabel("Mentor memory").fill("## Where it stands\nEdited by hand.");
  await mentor.getByRole("button", { name: "Save" }).click();
  await expect(mentor.getByText("Edited by hand.")).toBeVisible();

  // Clearing the conversation keeps the memory.
  await mentor.getByRole("tab", { name: "Conversation" }).click();
  await mentor.getByRole("button", { name: "Clear conversation" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Clear" }).click();
  await expect(mentor.locator(".markdown")).toHaveCount(0);
  await page.reload();
  await expect(mentor.getByText("Tell it what you're working on")).toBeVisible();
  await mentor.getByRole("tab", { name: "Memory" }).click();
  await expect(mentor.getByText("Edited by hand.")).toBeVisible();
});

test("starter topics for my own idea", async ({ page }) => {
  test.setTimeout(2 * AI_TIMEOUT);
  await login(page);
  test.skip(!(await aiOn(page)), "No GOOGLE_GEMINI_API_KEY on this stack");
  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New project" });
  const suggest = dialog.getByRole("button", { name: "Suggest starter topics" });
  await expect(suggest).toBeDisabled();
  await dialog.getByLabel("Name", { exact: true }).fill(`Backup my Postgres ${Date.now()}`);
  await dialog.getByLabel("Goal", { exact: true }).fill("Nightly backups I've actually restored from");
  await suggest.click();
  const topics = dialog.getByRole("group", { name: "Starter topics" }).getByRole("checkbox");
  await expect(topics.first()).toBeVisible({ timeout: AI_TIMEOUT });
  const n = await topics.count();
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/c[a-z0-9]+$/);
  await expect(page.getByRole("region", { name: /Pain/ }).getByRole("listitem")).toHaveCount(n);
});
