import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("chaos lab: seeded experiments, pick one, write a deliberate postmortem, copy markdown", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await login(page);
  const stamp = Date.now();

  // Seeded on first run.
  await page.goto("/chaos?status=all");
  await expect(page.getByRole("heading", { name: "Chaos Lab" })).toBeVisible();
  expect(await page.locator("li[id^=exp-]").count()).toBeGreaterThanOrEqual(20);

  // Pick one for me, restricted to a category.
  await page.getByLabel("Pick from category").selectOption("kubernetes");
  await page.getByRole("button", { name: "Pick one for me" }).click();
  const card = page.getByRole("article", { name: "Picked experiment" });
  await expect(card).toBeVisible();
  await expect(card.getByText("kubernetes", { exact: true })).toBeVisible();
  const title = (await card.getByRole("heading").textContent())!;

  // Write postmortem → pre-linked to the experiment and deliberate.
  await card.getByRole("link", { name: "Write postmortem" }).click();
  await expect(page).toHaveURL(/\/postmortems\/new\?chaosId=/);
  await expect(page.getByLabel("Title")).toHaveValue(title);
  await expect(page.locator("#pm-chaos option:checked")).toHaveText(title);
  await expect(page.getByLabel("I broke it on purpose")).toBeChecked();

  await page.getByLabel("Title").fill(`${title} ${stamp}`);
  await page.getByLabel("What broke").fill("The pod never became ready.");
  await page.getByLabel("Symptoms").fill("```bash\nkubectl get pods\n```\n");
  // Attach a log to the Symptoms field.
  await page
    .locator("section", { has: page.getByLabel("Symptoms") })
    .locator("input[type=file]")
    .setInputFiles({ name: "events.log", mimeType: "text/plain", buffer: Buffer.from("Back-off") });
  await expect(page.getByLabel("Symptoms")).toHaveValue(/\[events\.log\]\(\/api\/files\/c/);
  await page.getByLabel("Root cause").fill("Wrong image tag.");
  await page.getByRole("button", { name: "Save postmortem" }).click();

  await expect(page).toHaveURL(/\/postmortems\/c[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: `${title} ${stamp}` })).toBeVisible();
  await expect(page.getByText("Chaos", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Root cause" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How I found the cause" })).toBeHidden();
  await expect(page.getByRole("link", { name: /events\.log/ }).last()).toBeVisible();

  await page.getByRole("button", { name: "Copy as Markdown" }).click();
  await expect(page.getByText("· Copied")).toBeVisible();
  const md = await page.evaluate(() => navigator.clipboard.readText());
  expect(md).toContain(`# Postmortem: ${title} ${stamp}`);
  expect(md).toContain(`**Type:** Deliberate failure (chaos experiment: ${title})`);
  expect(md).toContain("## Root cause\n\nWrong image tag.");

  // Saving the postmortem marked the experiment done.
  await page.goto("/chaos?status=done");
  await expect(page.locator("li[id^=exp-]", { hasText: title })).toBeVisible();

  // Listed with the chaos filter, not with the real one.
  await page.goto("/postmortems?kind=chaos");
  await expect(page.getByRole("link", { name: new RegExp(`${title} ${stamp}`) })).toBeVisible();
  await page.goto("/postmortems?kind=real");
  await expect(page.getByRole("link", { name: new RegExp(`${title} ${stamp}`) })).toBeHidden();
});

test("chaos lab: mark done prompts for a postmortem; custom experiments", async ({ page }) => {
  await login(page);
  const name = `Custom experiment ${Date.now()}`;

  await page.goto("/chaos");
  await page.getByRole("button", { name: "New experiment" }).click();
  const form = page.getByRole("dialog", { name: "New experiment" });
  await form.getByLabel("Title").fill(name);
  await form.getByLabel("Category").fill("Chaos Monkey");
  await form.getByLabel("Difficulty").selectOption("3");
  await form.getByLabel("Hypothesis").fill("Nothing bad happens.");
  await form.getByRole("button", { name: "Add experiment" }).click();
  await expect(form).toBeHidden();

  const row = page.locator("li[id^=exp-]", { hasText: name });
  await expect(row.getByText("chaos-monkey")).toBeVisible();
  await row.locator("summary").click();
  await row.getByRole("button", { name: "Mark done" }).click();
  const prompt = page.getByRole("dialog", { name: "You broke it. Now write it up." });
  await expect(prompt).toBeVisible();
  await prompt.getByRole("link", { name: "Write postmortem" }).click();
  await expect(page).toHaveURL(/\/postmortems\/new\?chaosId=/);
  await expect(page.getByLabel("Title")).toHaveValue(name);

  // Done experiments drop out of the default (not done) list.
  await page.goto("/chaos");
  await expect(page.locator("li[id^=exp-]", { hasText: name })).toBeHidden();
  await page.goto("/chaos?status=done");
  const doneRow = page.locator("li[id^=exp-]", { hasText: name });
  await doneRow.locator("summary").click();
  await doneRow.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(doneRow).toBeHidden();
});

test("postmortem from a topic: pre-linked, edit, shows on the board, delete", async ({ page }) => {
  await login(page);
  const stamp = Date.now();
  const topic = `Ports ${stamp}`;

  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.getByLabel("Name").fill(`PM project ${stamp}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByLabel("New topic title").fill(topic);
  await page.getByRole("button", { name: "Add topic" }).click();
  await page.getByRole("link", { name: topic }).click();
  await page
    .getByRole("dialog", { name: topic })
    .getByRole("link", { name: "+ Postmortem" })
    .click();

  await expect(page).toHaveURL(/\/postmortems\/new\?projectId=.+&topicId=/);
  await expect(page.locator("#pm-topic option:checked")).toHaveText(topic);
  await expect(page.getByLabel("I broke it on purpose")).not.toBeChecked();
  await page.getByLabel("Title").fill(`Port clash ${stamp}`);
  await page.getByLabel("What broke").fill("Nginx didn't start.");
  await page.getByRole("button", { name: "Save postmortem" }).click();
  await expect(page.getByText("Real", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Fix").fill("Moved the other service to 8081.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Fix" })).toBeVisible();
  const pmUrl = page.url();

  // Board card counts it; the project tab lists it.
  await page.getByRole("link", { name: new RegExp(`PM project ${stamp}`) }).click();
  await expect(page).toHaveURL(/\/projects\/c[a-z0-9]+\?topic=/);
  await expect(page.getByRole("dialog", { name: topic })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: topic })).toBeHidden();
  await page
    .getByRole("navigation", { name: "Project content" })
    .getByRole("link", { name: "Postmortems" })
    .click();
  await expect(page.getByRole("link", { name: new RegExp(`Port clash ${stamp}`) })).toBeVisible();

  await page.goto(pmUrl);
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/postmortems$/);
  await expect(page.getByText(`Port clash ${stamp}`)).toBeHidden();
});
