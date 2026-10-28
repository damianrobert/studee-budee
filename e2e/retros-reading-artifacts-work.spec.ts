import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("weekly retro: facts sidebar, save, chart, goal on Today, edit", async ({ page }) => {
  await login(page);
  const goal = `Ship the Helm chart ${Date.now()}`;

  await page.goto("/retros");
  await page.getByRole("link", { name: "Write this week's retro" }).first().click();
  await expect(page).toHaveURL(/\/retros\/new/);
  await expect(page.getByRole("heading", { name: "This week's retro" })).toBeVisible();
  const facts = page.getByRole("complementary", { name: "This week's facts" });
  await expect(facts.getByRole("heading", { name: "Sessions" })).toBeVisible();
  await expect(facts.getByRole("heading", { name: "Postmortems written" })).toBeVisible();

  // The bottleneck is required.
  await page.getByLabel("What did I ship?").fill("A postmortem and two notes.");
  await page.getByLabel("What slowed me down?").fill("Kept reading about new tools.");
  await page.getByLabel("One goal for next week").fill(goal);
  await page.getByRole("button", { name: "Save retro" }).click();
  await expect(page.getByText("Pick the main bottleneck.")).toBeVisible();
  await page.getByRole("radio", { name: "Tool FOMO" }).check({ force: true });
  await page.getByRole("radio", { name: "4 · Good" }).check({ force: true });
  await page.getByRole("button", { name: "Save retro" }).click();

  await expect(page).toHaveURL("/retros");
  await expect(page.getByRole("heading", { name: "Bottlenecks, last 12 weeks" })).toBeVisible();
  await expect(page.locator(".recharts-bar-rectangle")).toHaveCount(1);
  await expect(page.getByText(goal)).toBeVisible();
  await expect(page.getByText("Energy 4/5")).toBeVisible();
  // This week is done, so the header offers a backfill instead.
  await expect(page.getByRole("link", { name: "Backfill a week" })).toBeVisible();

  await page.goto("/");
  await expect(page.getByText(goal)).toBeVisible();

  // Writing this week again goes to the existing retro.
  await page.goto("/retros");
  await page
    .getByRole("link", { name: /^Edit retro/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/retros\/c[a-z0-9]+\/edit$/);
  const editUrl = page.url();
  await expect(page.getByLabel("One goal for next week")).toHaveValue(goal);
  await page.getByLabel("One goal for next week").fill(`${goal} (edited)`);
  await page.getByRole("button", { name: "Save retro" }).click();
  await expect(page).toHaveURL("/retros");
  await expect(page.getByText(`${goal} (edited)`)).toBeVisible();

  // Asking to write a week that already has a retro opens that retro instead.
  const week = await page.evaluate(() => {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.toLocaleDateString("sv-SE");
  });
  await page.goto(`/retros/new?week=${week}`);
  await expect(page).toHaveURL(editUrl);
});

test("reading inbox: fetch title, fallback, read with takeaway, archive, tag filter, delete", async ({
  page,
}) => {
  await login(page);
  const stamp = Date.now();
  const deadUrl = `http://localhost:1/unreachable-${stamp}`;
  await page.goto("/reading");
  await expect(page.getByRole("heading", { name: "Reading" })).toBeVisible();

  // The server fetches the title (the app's own login page is reachable from the container).
  await page.getByLabel("Link").fill(`http://localhost:3000/login?from=/${stamp}`);
  await page.locator("#reading-tags").fill("career");
  await page.locator("#reading-tags").press("Enter");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("status")).toContainText("Added: Sign in");
  const item = page.locator("li", { has: page.locator(`a[href$="from=/${stamp}"]`) });
  await expect(item.getByRole("link")).toHaveText("Sign in · studee-budee");
  await expect(item).toContainText("localhost");
  await expect(item).toContainText("#career");

  // Unreachable → falls back to the URL as the title.
  await page.getByLabel("Link").fill(deadUrl);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("status")).toContainText(`Added: ${deadUrl}`);
  const dead = page.locator("li", { hasText: deadUrl });
  await expect(dead).toBeVisible();

  // Invalid links are rejected.
  await page.getByLabel("Link").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("status")).toHaveText("That doesn't look like a web link.");

  // Mark read with a takeaway.
  await item.getByRole("button", { name: "Read" }).click();
  await page.getByLabel("One-line takeaway (optional)").fill(`Login pages have titles ${stamp}.`);
  await page.getByRole("button", { name: "Mark as read" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("link", { name: /^Read \d+/ }).click();
  await expect(page).toHaveURL("/reading?tab=read");
  const read = page.locator("li", { hasText: `Login pages have titles ${stamp}.` });
  await expect(read).toContainText(/read \d+ \w+ \d{4}/);

  // Tag filter.
  await page.getByRole("link", { name: "#career" }).click();
  await expect(page).toHaveURL("/reading?tab=read&tag=career");
  await expect(read).toBeVisible();

  // Archive the dead link, then delete it.
  await page.goto("/reading");
  await dead.getByRole("button", { name: "Archive" }).click();
  await expect(dead).toBeHidden();
  await page.goto("/reading?tab=archived");
  await dead.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(dead).toBeHidden();
});

test("artifacts: promote a postmortem, publish it, month highlight goes away", async ({ page }) => {
  await login(page);
  const title = `Disk filled up ${Date.now()}`;

  await page.goto("/postmortems/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("What broke").fill("Writes failed.");
  await page.getByRole("button", { name: "Save postmortem" }).click();
  await expect(page).toHaveURL(/\/postmortems\/c[a-z0-9]+$/);

  await page.getByRole("link", { name: "Promote to artifact" }).click();
  await expect(page).toHaveURL(/\/artifacts\?fromPostmortem=/);
  const dialog = page.getByRole("dialog", { name: "Promote to artifact" });
  await expect(dialog.getByLabel("Title")).toHaveValue(`Postmortem: ${title}`);
  await dialog.getByLabel("Link (optional)").fill("https://example.com/disk-full");
  await dialog.getByRole("button", { name: "Add artifact" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL("/artifacts");

  const month = page.locator("section", { has: page.getByText("This month") });
  const row = month.locator("li", { hasText: `Postmortem: ${title}` });
  await expect(row.getByRole("link", { name: `from postmortem: ${title}` })).toBeVisible();
  await expect(row.getByRole("radio", { name: "Idea" })).toHaveAttribute("aria-checked", "true");
  await expect(month.getByText("Nothing published yet")).toBeVisible();

  await row.getByRole("radio", { name: "Published" }).click();
  await expect(row).toContainText(/published \d+ \w+ \d{4}/);
  await expect(month.getByText("Nothing published yet")).toBeHidden();

  // Back to draft clears the date.
  await row.getByRole("radio", { name: "Draft" }).click();
  await expect(row).not.toContainText(/published \d+/);

  // Edit, then delete.
  await row.getByRole("button", { name: /^Edit / }).click();
  await page.getByRole("dialog").getByLabel("Kind").selectOption("DIAGRAM");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(row).toContainText("Diagram");
  await row.getByRole("button", { name: /^Delete / }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(row).toBeHidden();
});

test("work log: observation with a question, resolve with answer, filter, delete", async ({
  page,
}) => {
  await login(page);
  const stamp = Date.now();
  await page.goto("/work");
  await page.getByLabel("What did you notice?").fill(`Deploys wait on manual approval ${stamp}`);
  await page.getByLabel("Question for a colleague (optional)").fill(`Why manual? ${stamp}`);
  await page.getByRole("button", { name: "Log it" }).click();
  const item = page.locator("li", { hasText: `Deploys wait on manual approval ${stamp}` });
  await expect(item).toBeVisible();
  await expect(page.getByLabel("What did you notice?")).toHaveValue("");

  await page.getByRole("link", { name: /^Open questions/ }).click();
  await expect(page).toHaveURL("/work?filter=open");
  await expect(item).toBeVisible();

  await item.getByRole("button", { name: "Resolve" }).click();
  await page.getByLabel("Answer (optional)").fill("Compliance requires a second pair of eyes.");
  await page.getByRole("button", { name: "Mark resolved" }).click();
  await expect(item).toBeHidden(); // no longer open

  await page.getByRole("link", { name: /^All/ }).click();
  await expect(item).toContainText("Compliance requires a second pair of eyes.");
  await expect(item.getByLabel("Resolved")).toBeVisible();

  await item.getByRole("button", { name: "Reopen" }).click();
  await expect(item.getByLabel("Open question")).toBeVisible();
  await item.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(item).toBeHidden();
});
