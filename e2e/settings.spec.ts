import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

function uniqueWord() {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  return "quux" + Array.from({ length: 6 }, () => letters[Math.floor(Math.random() * 26)]).join("");
}

async function logObservation(page: Page, text: string, tags: string[]) {
  await page.goto("/work");
  await page.locator("#obs-new-content").fill(text);
  for (const t of tags) {
    await page.locator("#obs-new-tags").fill(t);
    await page.locator("#obs-new-tags").press("Enter");
  }
  await page.getByRole("button", { name: "Log it" }).click();
  await expect(page.getByText(text)).toBeVisible();
}

test("tags: rename, rename into an existing tag merges, merge, delete", async ({ page }) => {
  await login(page);
  const w = uniqueWord();
  await logObservation(page, `First ${w}`, [`kube-${w}`, `k8s-${w}`]);
  await logObservation(page, `Second ${w}`, [`kube-${w}`]);
  await logObservation(page, `Third ${w}`, [`dns-${w}`]);

  await page.goto("/settings");
  const tags = page.getByRole("list", { name: "Tags" });
  const row = (name: string) => tags.getByRole("listitem").filter({ hasText: `#${name}` });
  await expect(row(`kube-${w}`)).toContainText("2 observations");

  // Renaming to a name that exists offers a merge (the item with both ends up with one).
  await row(`kube-${w}`)
    .getByRole("button", { name: `Rename kube-${w}` })
    .click();
  const rename = page.getByRole("dialog", { name: "Rename tag" });
  await rename.getByLabel("Name").fill(`K8s ${w}`);
  await rename.getByRole("button", { name: "Rename" }).click();
  await expect(rename.getByRole("alert")).toContainText(`"k8s-${w}" already exists.`);
  await rename.getByRole("button", { name: `Merge into k8s-${w}` }).click();
  await expect(rename).toBeHidden();
  await expect(row(`kube-${w}`)).toHaveCount(0);
  await expect(row(`k8s-${w}`)).toContainText("2 observations");

  // A plain rename.
  await row(`dns-${w}`)
    .getByRole("button", { name: `Rename dns-${w}` })
    .click();
  await rename.getByLabel("Name").fill(`Networking ${w}`);
  await rename.getByRole("button", { name: "Rename" }).click();
  await expect(rename).toBeHidden();
  await expect(row(`networking-${w}`)).toContainText("1 observation");

  // Merge through the merge dialog.
  await row(`networking-${w}`)
    .getByRole("button", { name: `Merge networking-${w}` })
    .click();
  const merge = page.getByRole("dialog", { name: `Merge networking-${w}` });
  await merge.getByLabel("Merge into").selectOption({ label: `k8s-${w}` });
  await merge.getByRole("button", { name: `Merge into k8s-${w}` }).click();
  await expect(merge).toBeHidden();
  await expect(row(`networking-${w}`)).toHaveCount(0);
  await expect(row(`k8s-${w}`)).toContainText("3 observations");

  await page.goto("/work");
  const third = page.getByRole("listitem").filter({ hasText: `Third ${w}` });
  await expect(third).toContainText(`k8s-${w}`);

  // Delete removes it from the items, which stay.
  await page.goto("/settings");
  await row(`k8s-${w}`)
    .getByRole("button", { name: `Delete k8s-${w}` })
    .click();
  await expect(page.getByRole("alertdialog")).toContainText("3 observations");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(row(`k8s-${w}`)).toHaveCount(0);
  await page.goto("/work");
  await expect(page.getByText(`Third ${w}`)).toBeVisible();
  await expect(page.getByText(`k8s-${w}`)).toHaveCount(0);
});

test("export a zip, change things, import it back", async ({ page, baseURL, playwright }) => {
  await login(page);
  const w = uniqueWord();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sb-e2e-"));

  // A note with an uploaded image, in a project.
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
      "1f15c4890000000d49444154789c6360f8cfc0f01f0005000201e5d5d2a10000000049454e44ae426082",
    "hex",
  );
  const up = await page.request.post("/api/files", {
    multipart: { file: { name: `pixel-${w}.png`, mimeType: "image/png", buffer: png } },
  });
  expect(up.ok()).toBeTruthy();
  const fileId = ((await up.json()) as { files: { id: string }[] }).files[0]!.id;
  await page.goto("/");
  await page.keyboard.press("ControlOrMeta+j");
  const capture = page.getByRole("dialog", { name: "Quick capture" });
  await capture.getByRole("tab", { name: "Note" }).click();
  await capture.getByLabel("Title").fill(`Kept ${w}`);
  await capture
    .getByRole("textbox", { name: "Note", exact: true })
    .fill(`A pixel: ![pixel](/api/files/${fileId})`);
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(capture.getByRole("status")).toContainText(`Saved “Kept ${w}”`);
  await page.keyboard.press("Escape");

  // Export from Settings.
  await page.goto("/settings");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download export" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^studee-budee-export-\d{4}-\d{2}-\d{2}\.zip$/);
  const zipPath = path.join(dir, "export.zip");
  await download.saveAs(zipPath);
  const zip = await fs.readFile(zipPath);
  expect(zip.subarray(0, 4).toString("hex")).toBe("504b0304");
  // The archive's entry names are stored uncompressed, so they can be checked as text.
  const names = zip.toString("latin1");
  expect(names).toContain("data.json");
  expect(names).toContain(`markdown/_no-project/notes/kept-${w}.md`);
  expect(names).toMatch(/files\/[0-9a-f-]{36}\.png/);

  // Without files.
  const noFiles = await page.request.get("/api/export?files=0");
  expect(noFiles.ok()).toBeTruthy();
  expect((await noFiles.body()).toString("latin1")).not.toMatch(/files\/[0-9a-f-]{36}\.png/);

  // Changes after the export: a new note, and the file is deleted.
  await page.keyboard.press("ControlOrMeta+j");
  await capture.getByLabel("Title").fill(`After export ${w}`);
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(capture.getByRole("status")).toContainText(`Saved “After export ${w}”`);
  await page.keyboard.press("Escape");
  await page.goto(`/files/${fileId}`);
  await page.getByRole("button", { name: "Delete" }).first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL("/files");
  expect((await page.request.get(`/api/files/${fileId}`)).status()).toBe(404);

  // A file that isn't an export is refused, and nothing changes.
  await page.goto("/settings");
  const input = page.getByLabel("Export file");
  await input.setInputFiles({
    name: "nope.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"hello":1}'),
  });
  await page.getByRole("button", { name: "Import" }).click();
  await page.getByRole("button", { name: "Replace everything" }).click();
  await expect(page.getByText("This isn't a studee-budee export.")).toBeVisible();
  await page.goto("/notes");
  await expect(page.getByRole("link", { name: `After export ${w}` })).toBeVisible();

  // Import the zip: everything is back as it was at export time.
  await page.goto("/settings");
  await input.setInputFiles(zipPath);
  await page.getByRole("button", { name: "Import" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("export.zip");
  await page.getByRole("button", { name: "Replace everything" }).click();
  await expect(page.getByText("Import complete.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/^\d+ uploaded files? restored\.$/)).toBeVisible();

  await page.goto("/notes");
  await expect(page.getByRole("link", { name: `Kept ${w}` })).toBeVisible();
  await expect(page.getByRole("link", { name: `After export ${w}` })).toHaveCount(0);
  const restored = await page.request.get(`/api/files/${fileId}`);
  expect(restored.status()).toBe(200);
  expect(Buffer.from(await restored.body()).equals(png)).toBe(true);
  // The note still knows its attachment, and search still works (generated columns).
  await page.goto(`/files/${fileId}`);
  await expect(page.getByRole("link", { name: `Kept ${w}` })).toBeVisible();
  await page.goto(`/notes?q=${encodeURIComponent(`Kept ${w}`)}`);
  await expect(page.getByRole("link", { name: `Kept ${w}` })).toBeVisible();

  // The import route checks the session itself (it's outside the middleware).
  const anonymous = await playwright.request.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  expect((await anonymous.post("/api/import", { data: "{}" })).status()).toBe(401);
  await anonymous.dispose();
  const foreign = await page.request.post("/api/import", {
    headers: { origin: "https://evil.example" },
    data: "{}",
  });
  expect(foreign.status()).toBe(403);

  await fs.rm(dir, { recursive: true, force: true });
});

test("settings screenshots, no sideways scroll on phones", async ({ page, browser }) => {
  await login(page);
  await page.goto("/settings");
  await page.screenshot({ path: "test-results/shots/settings.png", fullPage: true });

  const ctx = await browser.newContext({
    viewport: { width: 360, height: 800 },
    colorScheme: "dark",
  });
  const m = await ctx.newPage();
  await m.goto("/settings");
  await m.getByLabel("Export file").setInputFiles({
    name: "studee-budee-export-2026-10-22.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("PK"),
  });
  await m.screenshot({ path: "test-results/shots/settings-mobile-dark.png", fullPage: true });
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await ctx.close();
});
