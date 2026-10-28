import { expect, type Locator, type Page } from "@playwright/test";

/** Tests start authenticated (see auth.setup.ts); this just opens Today. */
export async function login(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL("/");
}

/**
 * Pointer drag for @dnd-kit (needs a few intermediate moves to activate). Right after a
 * Radix dialog closes the first pointer-down is sometimes not picked up, so it checks that
 * the drag started (handle gets aria-pressed) and retries.
 */
export async function drag(page: Page, handle: Locator, target: Locator) {
  // Radix blocks pointer events on <body> until a closing dialog has fully unmounted.
  await expect(page.locator("body")).not.toHaveCSS("pointer-events", "none");
  for (let attempt = 0; ; attempt++) {
    const from = (await handle.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 20, from.y + 20, { steps: 5 });
    if ((await handle.getAttribute("aria-pressed")) === "true" || attempt === 2) break;
    await page.mouse.up();
  }
  const to = (await target.boundingBox())!;
  await page.mouse.move(to.x + to.width / 2, to.y + 40, { steps: 15 });
  await page.mouse.up();
}
