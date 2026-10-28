import { expect, test } from "@playwright/test";
import { drag, login } from "./helpers";

test("board: WIP limit, drag between stages, Done gate and break-first hint", async ({ page }) => {
  await login(page);
  const name = `E2E project ${Date.now()}`;

  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  await page.getByRole("button", { name: "Make active" }).click();
  // Either activates directly, or asks to pause the current active project.
  const confirm = page.getByRole("button", { name: "Pause it and switch" });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(page.getByText("Active", { exact: true }).first()).toBeVisible();

  await page.getByLabel("New topic title").fill("Docker networking");
  await page.getByRole("button", { name: "Add topic" }).click();
  const handle = page.getByRole("button", { name: "Move Docker networking" });
  await expect(handle).toBeVisible();

  // Done gate: dropping into Done without an explain-it note is refused.
  await drag(page, handle, page.getByRole("region", { name: "Done column" }));
  const gate = page.getByRole("dialog", { name: "Explain it before it's done" });
  await expect(gate).toBeVisible();
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(gate).toBeHidden();
  await expect(
    page.getByRole("region", { name: "Pain column" }).getByText("Docker networking"),
  ).toBeVisible();

  // Explain without a postmortem: allowed, with a soft hint.
  await drag(page, handle, page.getByRole("region", { name: "Explain column" }));
  await expect(page.getByText("Did you break it first?")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Explain column" }).getByText("Docker networking"),
  ).toBeVisible();

  // Drawer shows the stage history.
  await page.getByRole("link", { name: "Docker networking" }).click();
  const drawer = page.getByRole("dialog", { name: "Docker networking" });
  await expect(drawer.getByText("Pain → Explain")).toBeVisible();

  // Today shows the active project.
  await page.goto("/");
  await expect(page.getByText(name)).toBeVisible();
});
