import { expect, request, test } from "@playwright/test";
import { drag, login } from "./helpers";

test("explain-it note from the Done gate: autosave, attachment, search, export, gate passes", async ({
  page,
}) => {
  await login(page);
  const stamp = Date.now();
  const topic = `Volumes ${stamp}`;

  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.getByLabel("Name").fill(`Notes project ${stamp}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByLabel("New topic title").fill(topic);
  await page.getByRole("button", { name: "Add topic" }).click();
  const handle = page.getByRole("button", { name: `Move ${topic}` });
  await expect(handle).toBeVisible();
  const boardUrl = page.url();

  await drag(page, handle, page.getByRole("region", { name: "Done column" }));
  await page.getByRole("link", { name: "Write explain-it note" }).click();

  // Pre-filled from the query params.
  await expect(page).toHaveURL(/\/notes\/new\?type=EXPLAIN_IT/);
  await expect(page.getByLabel("Type")).toHaveValue("EXPLAIN_IT");
  await expect(page.locator("#note-topic option:checked")).toHaveText(topic);

  await page.getByLabel("Title").fill(`Docker volumes ${stamp}`);
  const content = page.getByLabel("Content (markdown)");
  await content.fill(
    `Volumes keep data outside the container's writable layer zebracorn${stamp}.\n\n\`\`\`bash\ndocker volume ls\n\`\`\`\n`,
  );
  await page.getByLabel("Tags").fill("docker,");

  // First autosave creates the note and swaps the URL in place.
  await expect(page).toHaveURL(/\/notes\/c[a-z0-9]+$/, { timeout: 10_000 });
  await expect(page.getByRole("status").getByText("Saved", { exact: true })).toBeVisible();
  const noteUrl = page.url();

  // Attach a file through the picker: it is uploaded and linked in the content.
  await page.locator('input[type="file"]').setInputFiles({
    name: "app.log",
    mimeType: "text/plain",
    buffer: Buffer.from("ERROR: disk full\n"),
  });
  await expect(content).toHaveValue(/\[app\.log\]\(\/api\/files\/c[a-z0-9]+\)/);
  await expect(page.getByRole("status").getByText("Saved", { exact: true })).toBeVisible({
    timeout: 10_000,
  });

  // The preview renders highlighted code.
  await expect(page.getByLabel("Preview").locator("code.hljs")).toBeVisible();

  // Everything persisted.
  await page.reload();
  await expect(page.getByLabel("Title")).toHaveValue(`Docker volumes ${stamp}`);
  await expect(page.getByText("#docker")).toBeVisible();
  await expect(page.getByRole("link", { name: /^app\.log \d+ B$/ })).toBeVisible();

  // Full-text search (stemmed: "volume" matches "Volumes").
  await page.goto(`/notes?q=${encodeURIComponent(`zebracorn${stamp} volume`)}`);
  const hit = page.getByRole("link", { name: new RegExp(`Docker volumes ${stamp}`) });
  await expect(hit).toBeVisible();
  await expect(hit.locator("mark").first()).toBeVisible();
  await expect(hit.getByText("Explain-it")).toBeVisible();

  // Export as markdown.
  const exp = await page.request.get(`${noteUrl.replace(/\/notes\//, "/api/notes/")}/export`);
  expect(exp.status()).toBe(200);
  expect(exp.headers()["content-disposition"]).toContain(`docker-volumes-${stamp}.md`);
  expect(await exp.text()).toContain("type: explain-it");

  // With an explain-it note, the topic may move to Done.
  await page.goto(boardUrl);
  await drag(
    page,
    page.getByRole("button", { name: `Move ${topic}` }),
    page.getByRole("region", { name: "Done column" }),
  );
  await expect(page.getByRole("region", { name: "Done column" }).getByText(topic)).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Explain it before it's done" })).toBeHidden();
});

test("files: upload limits, safe serving, preview and delete", async ({ page, baseURL }) => {
  await login(page);

  // > 10 MB goes through the middleware intact.
  const big = Buffer.alloc(12 * 1024 * 1024, 97);
  const up = await page.request.post("/api/files", {
    multipart: { file: { name: "big.txt", mimeType: "text/plain", buffer: big } },
  });
  expect(up.status()).toBe(200);
  const bigFile = (await up.json()).files[0];
  expect(bigFile.sizeBytes).toBe(big.length);

  // Over MAX_UPLOAD_MB is refused.
  const huge = await page.request.post("/api/files", {
    multipart: {
      file: {
        name: "huge.bin",
        mimeType: "application/octet-stream",
        buffer: Buffer.alloc(51 * 1024 * 1024),
      },
    },
  });
  expect(huge.status()).toBe(413);

  // HTML is never rendered inline; text is served as plain text; everything is sandboxed.
  const html = await page.request.post("/api/files", {
    multipart: {
      file: {
        name: "../../evil.html",
        mimeType: "text/html",
        buffer: Buffer.from("<script>1</script>"),
      },
    },
  });
  const evil = (await html.json()).files[0];
  expect(evil.originalName).toBe("evil.html");
  const evilRes = await page.request.get(evil.url);
  expect(evilRes.headers()["content-disposition"]).toMatch(/^attachment/);
  expect(evilRes.headers()["content-security-policy"]).toBe("sandbox");

  const yaml = await page.request.post("/api/files", {
    multipart: {
      file: {
        name: "deploy.yaml",
        mimeType: "application/x-yaml",
        buffer: Buffer.from("replicas: 3\n"),
      },
    },
  });
  const yamlFile = (await yaml.json()).files[0];
  const yamlRes = await page.request.get(yamlFile.url);
  expect(yamlRes.headers()["content-type"]).toBe("text/plain; charset=utf-8");
  expect(yamlRes.headers()["content-disposition"]).toMatch(/^inline/);
  expect(yamlRes.headers()["x-content-type-options"]).toBe("nosniff");
  expect(await yamlRes.text()).toBe("replicas: 3\n");

  expect((await page.request.get("/api/files/..%2F..%2Fetc%2Fpasswd")).status()).toBe(404);

  // Unauthenticated requests are refused.
  const anon = await request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  expect((await anon.get(yamlFile.url)).status()).toBe(401);
  expect(
    (
      await anon.post("/api/files", {
        multipart: { file: { name: "x.txt", mimeType: "text/plain", buffer: Buffer.from("x") } },
      })
    ).status(),
  ).toBe(401);
  await anon.dispose();

  // Files page: list, preview, delete.
  await page.goto("/files?q=deploy.yaml&view=list");
  await page
    .getByRole("link", { name: /deploy\.yaml/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "deploy.yaml" })).toBeVisible();
  await expect(page.getByLabel("Preview").locator("code.language-yaml")).toContainText("replicas");
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/files$/);
  expect((await page.request.get(yamlFile.url)).status()).toBe(404);

  for (const f of [bigFile, evil]) {
    await page.goto(`/files/${f.id}`);
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(/\/files$/);
  }
});
