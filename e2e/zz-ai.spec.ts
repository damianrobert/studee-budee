import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

// Runs last (zz-): it adds flashcards and sessions that other specs don't expect.
// These call the real Gemini API with the key from .env, so they only check the shape of the
// answers. Without a key they check that the AI UI is hidden.

const AI_TIMEOUT = 90_000;

async function aiOn(page: Page) {
  await page.goto("/settings");
  return page.getByText(/Enabled · Google Gemini/).isVisible();
}

test("without a key the AI UI is hidden", async ({ page }) => {
  await login(page);
  test.skip(await aiOn(page), "AI is enabled on this stack");
  await expect(page.getByText("Set GOOGLE_GEMINI_API_KEY")).toBeVisible();
  await page.goto("/projects");
  await expect(page.getByRole("button", { name: "Quiz me" })).toHaveCount(0);
});

test("check my explanation, suggested cards and quiz", async ({ page }) => {
  test.setTimeout(6 * AI_TIMEOUT);
  await login(page);
  test.skip(!(await aiOn(page)), "No GOOGLE_GEMINI_API_KEY on this stack");
  const stamp = Date.now();
  const topic = `Volumes ${stamp}`;

  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.getByLabel("Name").fill(`AI project ${stamp}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByLabel("New topic title").fill(topic);
  await page.getByRole("button", { name: "Add topic" }).click();
  const boardUrl = page.url();

  // An explain-it note with a deliberate mistake.
  await page.getByRole("link", { name: topic, exact: true }).click();
  await page.getByRole("dialog", { name: topic }).getByRole("link", { name: "+ Note" }).click();
  await page.getByLabel("Type").selectOption("EXPLAIN_IT");
  await page.getByLabel("Title").fill("Docker volumes");
  await page
    .getByLabel("Content (markdown)")
    .fill(
      "Docker volumes store data outside the container's writable layer, so it survives when the container is recreated. " +
        "They live under /var/lib/docker/volumes on the host and are managed with `docker volume ls` and `docker volume rm`. " +
        "Bind mounts are the same thing as volumes. " +
        "You mount one with `-v name:/path`. Use them for databases.",
    );
  await expect(page).toHaveURL(/\/notes\/c[a-z0-9]+$/, { timeout: 10_000 });
  const noteId = page.url().split("/").pop()!;

  // Check my explanation: a streamed review with the four sections, not a rewrite.
  await page.getByRole("button", { name: "Check my explanation" }).click();
  const review = page.getByRole("dialog", { name: "Check my explanation" });
  await expect(review.getByRole("heading", { name: "Follow-up question" })).toBeVisible({
    timeout: AI_TIMEOUT,
  });
  for (const h of ["Errors", "Gaps", "Vague"])
    await expect(review.getByRole("heading", { name: h })).toBeVisible();
  await expect(review.getByRole("button", { name: "Check again" })).toBeEnabled({
    timeout: AI_TIMEOUT,
  });
  await page.keyboard.press("Escape");

  // Suggested cards: reviewed and edited before saving.
  await page.goto(`/flashcards?fromNote=${noteId}`);
  const cardsDialog = page.getByRole("dialog", { name: /Cards from/ });
  await cardsDialog.getByRole("button", { name: "Suggest cards with AI" }).click();
  await expect(cardsDialog.getByLabel("Card 1 front")).toBeVisible({ timeout: AI_TIMEOUT });
  const suggested = await cardsDialog.getByLabel(/^Card \d+ front$/).count();
  expect(suggested).toBeGreaterThanOrEqual(3);
  expect(suggested).toBeLessThanOrEqual(8);
  await cardsDialog.getByLabel("Card 1 front").fill(`Edited front ${stamp}`);
  await cardsDialog.getByRole("button", { name: "Remove card 2" }).click();
  await cardsDialog.getByRole("button", { name: `Save ${suggested - 1} cards` }).click();
  await expect(cardsDialog.getByText(`${suggested - 1} cards added.`)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText(`Edited front ${stamp}`)).toBeVisible();

  // Quiz me on the topic: 5 questions, graded, missed ones become cards.
  await page.goto(boardUrl);
  await page.getByRole("link", { name: topic, exact: true }).click();
  await page.getByRole("dialog", { name: topic }).getByRole("button", { name: "Quiz me" }).click();
  const quiz = page.getByRole("dialog", { name: `Quiz: ${topic}` });
  await expect(quiz.getByLabel("Answer 1")).toBeVisible({ timeout: AI_TIMEOUT });
  await expect(quiz.getByLabel(/^Answer \d$/)).toHaveCount(5);
  await expect(quiz.getByRole("button", { name: "Grade my answers" })).toBeDisabled();
  await quiz.getByLabel("Answer 1").fill("Because the data has to outlive the container.");
  await quiz.getByRole("button", { name: "Grade my answers" }).click();
  await expect(quiz.getByText(/\d of 5 correct/)).toBeVisible({ timeout: AI_TIMEOUT });
  // Blank answers count as missed.
  const toCards = quiz.getByRole("button", { name: /Turn \d missed into flashcards/ });
  await toCards.click();
  await quiz.getByRole("button", { name: /^Save \d cards?$/ }).click();
  await expect(quiz.getByText(/\d cards? added to Flashcards/)).toBeVisible();
});

test("I'm stuck: attempt first, countdown, no early hint, survives a reload", async ({ page }) => {
  await login(page);
  test.skip(!(await aiOn(page)), "No GOOGLE_GEMINI_API_KEY on this stack");
  const header = page.getByRole("banner");
  await page.goto("/");

  await expect(header.getByRole("button", { name: "I'm stuck" })).toHaveCount(0);
  await page.getByRole("main").getByRole("button", { name: "Start session" }).click();
  await header.getByRole("button", { name: "I'm stuck" }).click();

  const dialog = page.getByRole("dialog", { name: "I'm stuck" });
  await dialog.getByLabel("What are you trying to do?").fill("Reach Postgres from the app");
  await dialog.getByLabel("What have you tried?").fill("docker ps: both containers are up");
  await dialog.getByLabel(/What happened/).fill("ECONNREFUSED 127.0.0.1:5432");
  await dialog.getByRole("button", { name: "Start the 15 minutes" }).click();

  await expect(dialog.getByText("until a hint unlocks")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Get hint 1 of 3" })).toBeDisabled();
  const noteHref = await dialog.getByRole("link", { name: "Open note" }).getAttribute("href");
  const noteId = noteHref!.split("/").pop()!;

  // The server enforces the 15 minutes too.
  const early = await page.request.post("/api/ai/hint", { data: { noteId } });
  expect(early.status()).toBe(425);
  expect((await early.json()).error).toMatch(/unlocks in 1[45] min/);
  const foreign = await page.request.post("/api/ai/hint", {
    data: { noteId },
    headers: { origin: "https://evil.example" },
  });
  expect(foreign.status()).toBe(403);

  // The countdown survives a reload, and the attempt is saved as a note tagged "stuck".
  await page.reload();
  await expect(header.getByRole("button", { name: /I'm stuck: hint in/ })).toBeVisible();
  await page.goto(`/notes/${noteId}`);
  await expect(page.getByLabel("Title")).toHaveValue("Stuck: Reach Postgres from the app");
  await expect(page.getByText("#stuck")).toBeVisible();

  // Discarding deletes the note and resets the button.
  await header.getByRole("button", { name: /I'm stuck: hint in/ }).click();
  await dialog.getByRole("button", { name: "Discard" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Discard" }).click();
  await expect(header.getByRole("button", { name: "I'm stuck" })).toBeVisible();
  expect((await page.request.post("/api/ai/hint", { data: { noteId } })).status()).toBe(404);

  // Clean up the running session.
  await header.getByRole("button", { name: "Stop" }).click();
  const stop = page.getByRole("dialog", { name: "Stop session" });
  await stop.getByLabel("What's next?").fill("Use the service name as the host");
  await stop.getByRole("button", { name: "Save & stop" }).click();
  await expect(stop).toBeHidden();
});
