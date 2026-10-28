import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

/** A made-up word per run, so full-text hits only come from this test. */
function uniqueWord() {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  return "zork" + Array.from({ length: 6 }, () => letters[Math.floor(Math.random() * 26)]).join("");
}

function openSearch(page: Page) {
  return page.keyboard.press("ControlOrMeta+k");
}

test("quick capture: note, observation and link without leaving the page", async ({ page }) => {
  await login(page);
  const w = uniqueWord();
  await page.goto("/projects");

  await page.keyboard.press("ControlOrMeta+j");
  const dialog = page.getByRole("dialog", { name: "Quick capture" });
  await expect(dialog).toBeVisible();

  // Note is the first tab. Enter in the title moves to the body; Ctrl/Cmd+Enter saves.
  await expect(dialog.getByRole("tab", { name: "Note" })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByLabel("Title")).toBeFocused();
  await dialog.getByLabel("Title").fill(`Captured ${w}`);
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("textbox", { name: "Note", exact: true })).toBeFocused();
  await page.keyboard.type(`Healthchecks and ${w} probes`);
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(dialog.getByRole("status")).toContainText(`Saved “Captured ${w}”`);
  await expect(dialog.getByLabel("Title")).toHaveValue("");

  // Observation, with a question.
  await dialog.getByRole("tab", { name: "Observation" }).click();
  await dialog.getByLabel("What did you notice?").fill(`Deploys wait on ${w} approval`);
  await dialog.getByLabel("Question for a colleague (optional)").fill("Why manual?");
  await dialog.getByRole("button", { name: "Log it" }).click();
  await expect(dialog.getByRole("status")).toContainText("Logged.");

  // Link: the server fetches the title (the app's own login page is reachable from the container).
  await dialog.getByRole("tab", { name: "Link" }).click();
  await dialog.getByRole("textbox", { name: "Link" }).fill(`http://localhost:3000/login?w=${w}`);
  await dialog.getByRole("button", { name: "Add to reading" }).click();
  await expect(dialog.getByRole("status")).toContainText("Added “Sign in", { timeout: 10_000 });

  // Still on the same page; the last tab is remembered.
  await expect(page).toHaveURL("/projects");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Capture" }).click();
  await expect(dialog.getByRole("tab", { name: "Link" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");

  await page.goto("/work?filter=open");
  await expect(page.getByText(`Deploys wait on ${w} approval`)).toBeVisible();
  await page.goto("/reading");
  await expect(page.getByRole("link", { name: /^Sign in/ }).first()).toBeVisible();
  await page.goto(`/notes?q=${w}`);
  await expect(page.getByRole("link", { name: `Captured ${w}` })).toBeVisible();
});

test("global search: every kind, keyboard navigation, highlight and shortcuts", async ({
  page,
  baseURL,
  playwright,
}) => {
  await login(page);
  const w = uniqueWord();

  // One of each searchable thing.
  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.getByLabel("Name").fill(`Search project ${w}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: `Search project ${w}` })).toBeVisible();
  const projectUrl = page.url();
  await page.getByLabel("New topic title").fill(`Topic about ${w}`);
  await page.getByRole("button", { name: "Add topic" }).click();
  await expect(page.getByRole("button", { name: `Move Topic about ${w}` })).toBeVisible();

  await page.goto("/postmortems/new");
  await page.getByLabel("Title").fill(`Outage ${w}`);
  await page.getByLabel("What broke").fill("The ingress controller crashed.");
  await page.getByLabel("Root cause").fill(`A ${w} misconfiguration in the values file.`);
  await page.getByRole("button", { name: "Save postmortem" }).click();
  await expect(page.getByRole("heading", { name: `Outage ${w}` })).toBeVisible();

  await page.keyboard.press("ControlOrMeta+j");
  const capture = page.getByRole("dialog", { name: "Quick capture" });
  await capture.getByRole("tab", { name: "Note" }).click();
  await capture.getByLabel("Title").fill("Stemming check");
  await capture
    .getByRole("textbox", { name: "Note", exact: true })
    .fill(`The ${w} runners were restarting`);
  await capture.getByRole("button", { name: "Save note" }).click();
  await expect(capture.getByRole("status")).toContainText("Saved");
  await capture.getByRole("tab", { name: "Observation" }).click();
  await capture.getByLabel("What did you notice?").fill(`Oncall uses ${w} dashboards`);
  await capture.getByRole("button", { name: "Log it" }).click();
  await expect(capture.getByRole("status")).toContainText("Logged.");
  await capture.getByRole("tab", { name: "Link" }).click();
  await capture.getByRole("textbox", { name: "Link" }).fill(`http://localhost:3000/login?ref=${w}`);
  await capture.getByRole("button", { name: "Add to reading" }).click();
  await expect(capture.getByRole("status")).toContainText("Added", { timeout: 10_000 });
  await page.keyboard.press("Escape");

  // Ctrl/Cmd+K opens search; the pages are listed before typing.
  await openSearch(page);
  const search = page.getByRole("dialog", { name: "Search" });
  const input = search.getByRole("combobox", { name: "Search" });
  await expect(input).toBeFocused();
  await expect(search.getByRole("option", { name: "Chaos Lab" })).toBeVisible();

  await input.fill(w);
  await expect(search.getByRole("status")).toHaveText("5 results");
  for (const group of ["Notes", "Postmortems", "Topics", "Reading", "Work log"])
    await expect(search.getByRole("group", { name: group }).getByRole("option")).toHaveCount(1);
  // Stemmed full text: "restart" finds "restarting", with the match highlighted.
  await input.fill(`${w} restart`);
  const note = search.getByRole("group", { name: "Notes" }).getByRole("option");
  await expect(note).toContainText("Stemming check");
  await expect(note.locator("mark")).toHaveText([w, "restarting"]);
  await expect(search.getByRole("group", { name: "Postmortems" })).toHaveCount(0);

  // Arrow keys move the selection, Enter opens it (the first option is the note).
  await input.fill(w);
  await expect(search.getByRole("status")).toHaveText("5 results");
  await expect(search.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await input.press("ArrowDown");
  const pm = search.getByRole("group", { name: "Postmortems" }).getByRole("option");
  await expect(pm).toHaveAttribute("aria-selected", "true");
  await input.press("Enter");
  await expect(search).toBeHidden();
  await expect(page).toHaveURL(/\/postmortems\/c[a-z0-9]+$/);

  // A topic opens its drawer on the board.
  await openSearch(page);
  await input.fill(`Topic about ${w}`);
  await search.getByRole("group", { name: "Topics" }).getByRole("option").click();
  await expect(page).toHaveURL(new RegExp(`${projectUrl.replace(/[?]/g, "\\?")}\\?topic=`));
  await expect(page.getByRole("dialog").getByText(`Topic about ${w}`).first()).toBeVisible();
  await page.keyboard.press("Escape");

  // Observations and reading items are highlighted in their list.
  await openSearch(page);
  await input.fill(`${w} dashboards`);
  await search.getByRole("group", { name: "Work log" }).getByRole("option").click();
  await expect(page).toHaveURL(/\/work\?hl=/);
  await expect(page.locator('li[aria-current="true"]')).toContainText(`Oncall uses ${w}`);

  await openSearch(page);
  await input.fill(w);
  await search.getByRole("group", { name: "Reading" }).getByRole("option").click();
  await expect(page).toHaveURL(/\/reading\?hl=/);
  await expect(page.locator('li[aria-current="true"]')).toContainText("Sign in");

  // "All notes matching" goes to the notes list search; nothing found says so.
  await openSearch(page);
  await input.fill(`${w}nothing`);
  await expect(search.getByRole("status")).toHaveText("No matches");
  await search.getByRole("option", { name: /All notes matching/ }).click();
  await expect(page).toHaveURL(`/notes?q=${w}nothing`);

  // The shortcuts toggle and switch between the two dialogs.
  await openSearch(page);
  await expect(search).toBeVisible();
  await page.keyboard.press("ControlOrMeta+j");
  await expect(search).toBeHidden();
  await expect(capture).toBeVisible();
  await page.keyboard.press("ControlOrMeta+j");
  await expect(capture).toBeHidden();

  // The API needs a login like everything else.
  const anon = await playwright.request.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  expect((await anon.get("/api/search?q=x")).status()).toBe(401);
  await anon.dispose();
});

test("quick capture keeps an open note editor intact", async ({ page }) => {
  await login(page);
  await page.goto("/notes/new");
  await page.getByLabel("Title").fill("Editor survives capture");
  await page.getByLabel("Content (markdown)").fill("half-written thought");

  await page.keyboard.press("ControlOrMeta+j");
  const capture = page.getByRole("dialog", { name: "Quick capture" });
  await capture.getByRole("tab", { name: "Observation" }).click();
  await capture.getByLabel("What did you notice?").fill("Logged from inside the editor");
  await capture.getByRole("button", { name: "Log it" }).click();
  await expect(capture.getByRole("status")).toContainText("Logged.");
  await page.keyboard.press("Escape");

  await expect(page.getByLabel("Title")).toHaveValue("Editor survives capture");
  await expect(page.getByLabel("Content (markdown)")).toHaveValue("half-written thought");
});
