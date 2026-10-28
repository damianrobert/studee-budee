import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

const navLink = (page: Page, name: string | RegExp) =>
  page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name })
    .filter({ visible: true });

// Expects no other flashcards (fresh e2e stack): the review and badge counts are exact.
test("flashcards: create, review with SM-2, badge, edit, start over, delete", async ({ page }) => {
  await login(page);
  const stamp = Date.now();
  const q1 = `What does docker volume prune remove? ${stamp}`;
  const q2 = `Which port does etcd serve clients on? ${stamp}`;

  await page.goto("/flashcards");
  await expect(page.getByRole("heading", { name: "No cards yet" })).toBeVisible();
  await page.getByRole("button", { name: "New card" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New card" });
  await dialog.getByLabel("Front").fill(q1);
  await dialog.getByLabel("Back").fill("Unused **local** volumes");
  await dialog.getByRole("button", { name: "Save & add another" }).click();
  await expect(dialog.getByText("1 card added.")).toBeVisible();
  await expect(dialog.getByLabel("Front")).toHaveValue("");
  await expect(dialog.getByLabel("Front")).toBeFocused();
  // Both sides are required.
  await dialog.getByLabel("Front").fill(q2);
  await dialog.getByRole("button", { name: "Save & close" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Write the answer on the back.");
  await dialog.getByLabel("Back").fill("`2379`");
  await dialog.getByRole("button", { name: "Save & close" }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByText(q1)).toBeVisible();
  await expect(page.getByText(q2)).toBeVisible();
  await expect(page.getByText("due now")).toHaveCount(2);
  await expect(navLink(page, "Flashcards 2 due")).toBeVisible();
  await expect(page.getByRole("link", { name: "Review 2 due" })).toBeVisible();

  // Review: q1 first (oldest). Again sends it to the back of the queue.
  await page.getByRole("link", { name: "Review 2 due" }).click();
  await expect(page).toHaveURL("/flashcards/review");
  const card = page.getByRole("article", { name: "Flashcard" });
  await expect(card).toContainText(q1);
  await expect(card).not.toContainText("Unused");
  await expect(page.getByText("0 of 2 done")).toBeVisible();
  await page.keyboard.press("Space");
  await expect(card.locator("strong")).toHaveText("local");
  const rating = page.getByRole("group", { name: "How well did you remember?" });
  await expect(rating.getByRole("button", { name: /^Again now/ })).toBeVisible();
  await expect(rating.getByRole("button", { name: /^Good 1d/ })).toBeFocused();
  await rating.getByRole("button", { name: /^Again/ }).click();

  await expect(card).toContainText(q2);
  await expect(page.getByText("0 of 2 done")).toBeVisible(); // q1 is still in the queue
  await page.getByRole("button", { name: "Show answer" }).click();
  await expect(card.locator("code")).toHaveText("2379");
  await page.keyboard.press("3"); // Good

  await expect(card).toContainText(q1);
  await expect(page.getByText("1 of 2 done")).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.press("4"); // Easy

  await expect(page.getByRole("heading", { name: "All done" })).toBeVisible();
  await expect(page.getByText("3 reviews of 2 cards, 1 forgotten and repeated.")).toBeVisible();
  await expect(navLink(page, /^Flashcards$/)).toBeVisible();

  // Both are scheduled for tomorrow now.
  await page.goto("/flashcards");
  await expect(page.getByText("due tomorrow", { exact: true })).toHaveCount(2);
  await expect(page.getByText("every 1d · ease 2.50")).toBeVisible();
  await expect(page.getByText("every 1d · ease 2.60")).toBeVisible();
  await expect(page.getByText("Nothing due. Next one due tomorrow.")).toBeVisible();
  await page.getByRole("link", { name: /^Due/ }).click();
  await expect(page.getByRole("heading", { name: "Nothing due" })).toBeVisible();
  await page.goto("/flashcards/review");
  await expect(page.getByText("You're up to date. The next card is due tomorrow.")).toBeVisible();

  // Search, edit, start over, delete.
  await page.goto("/flashcards");
  await page.getByRole("searchbox", { name: "Search cards" }).fill("etcd");
  await expect(page).toHaveURL(/q=etcd/);
  await expect(page.getByText(q1)).toBeHidden();
  const row = page.getByRole("listitem").filter({ hasText: q2 });
  await row.getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("dialog", { name: "Edit card" });
  await expect(edit.getByLabel("Back")).toHaveValue("`2379`");
  await edit.getByLabel("Back").fill("`2379` (peers use 2380)");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toBeHidden();
  await row.getByText("Show answer").click();
  await expect(row.getByText("(peers use 2380)")).toBeVisible();
  await expect(row.getByText("due tomorrow")).toBeVisible(); // editing keeps the schedule

  await row.getByRole("button", { name: "Start over" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Start over" }).click();
  await expect(row.getByText("due now")).toBeVisible();
  await expect(row.getByText("new", { exact: true })).toBeVisible();
  await expect(navLink(page, "Flashcards 1 due")).toBeVisible();

  await row.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("heading", { name: "No matching cards" })).toBeVisible();
  await expect(navLink(page, /^Flashcards$/)).toBeVisible();
});

test("flashcards from a note link back to it and survive its deletion", async ({ page }) => {
  await login(page);
  const title = `Kubernetes probes ${Date.now()}`;
  await page.goto("/notes/new");
  await page.getByLabel("Title").fill(title);
  await page
    .getByLabel("Content (markdown)")
    .fill("A failing **liveness** probe restarts the pod.");
  await expect(page).toHaveURL(/\/notes\/c[a-z0-9]+$/, { timeout: 10_000 });
  await expect(page.getByRole("status").getByText("Saved", { exact: true })).toBeVisible();

  await page.locator('a[href^="/flashcards?fromNote="]').click();
  await expect(page).toHaveURL(/\/flashcards\?fromNote=c[a-z0-9]+$/);
  const dialog = page.getByRole("dialog", { name: `Cards from “${title}”` });
  await dialog.getByText("Show the note").click();
  await expect(dialog.getByText("restarts the pod")).toBeVisible();
  await dialog.getByLabel("Front").fill("What does a failing liveness probe do?");
  await dialog.getByLabel("Back").fill("Restarts the container");
  await dialog.getByRole("button", { name: "Add card" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL("/flashcards");

  const row = page.getByRole("listitem").filter({ hasText: "failing liveness probe" });
  await row.getByRole("link", { name: title }).click();
  await expect(page.getByLabel("Title")).toHaveValue(title);

  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/notes$/);
  await page.goto("/flashcards");
  await expect(row).toBeVisible();
  await expect(row.getByRole("link", { name: title })).toHaveCount(0);
});
