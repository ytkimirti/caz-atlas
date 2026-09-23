import { chromium, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

const base = process.env.ATLAS_TEST_URL || "http://localhost:18851";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Local server required");
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const errors: string[] = [];
async function ready(page: Page) {
  await expect(page.locator("canvas")).toHaveAttribute("data-layout", "ready", {
    timeout: 45000,
  });
}
async function choose(page: Page, name: string) {
  await page
    .getByRole("combobox", { name: "Müzisyen veya grup ara", exact: true })
    .fill(name);
  await page.getByRole("option").first().click();
  await expect(page.locator(".selection-panel h2")).toHaveText(name);
}
async function markerVisible(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>("canvas")!;
        const [x, y] = canvas.dataset.selectedPosition!.split(",").map(Number);
        return document.elementFromPoint(x, y) === canvas;
      }),
    )
    .toBe(true);
}
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const requested: string[] = [];
  page.on("request", (request) =>
    requested.push(new URL(request.url()).pathname),
  );
  // Optional project failures must not block graph interaction or lose selection.
  await page.route("**/data/projects.json", (route) =>
    route.fulfill({ status: 503 }),
  );
  await page.goto(base);
  await ready(page);
  expect(requested).toContain("/data/runtime.json");
  expect(requested).not.toContain("/data/atlas.json");
  expect(requested).not.toContain("/data/concerts.json");
  await choose(page, "Adem Gülşen");
  await markerVisible(page);
  const retry = page.getByRole("button", {
    name: "Grup bilgileri yüklenemedi. Tekrar dene",
  });
  await expect(retry).toBeVisible();
  await page.unroute("**/data/projects.json");
  await retry.click();
  await expect(page.locator(".musician-ensembles")).toBeVisible();
  await markerVisible(page);
  for (const name of [
    "Ahmet Berker",
    "Ali Perret",
    "Alp Ersönmez",
    "Alper Yılmaz",
    "Ateş Tezer",
  ]) {
    await choose(page, name);
    await markerVisible(page);
  }
  for (const [name, id] of [
    ["Filtreler", "filters"],
    ["Görünüm", "view-settings"],
  ]) {
    const trigger = page.getByRole("button", { name, exact: true });
    await trigger.click();
    const panel = page.locator(`#${id}`);
    await expect(panel).toHaveAttribute("aria-modal", "true");
    await expect(panel.getByRole("button").first()).toBeFocused();
    const controls = panel.locator(
      "button:visible, input:visible, select:visible",
    );
    await controls.last().focus();
    await page.keyboard.press("Tab");
    await expect(controls.first()).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(controls.last()).toBeFocused();
    expect(
      await page
        .locator("canvas")
        .evaluate((element) => (element as HTMLElement).inert),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.locator(".selection-panel h2")).toHaveText("Ateş Tezer");
    expect(
      await page
        .locator("canvas")
        .evaluate((element) => (element as HTMLElement).inert),
    ).toBe(false);
    await markerVisible(page);
  }
  await page.getByRole("button", { name: "Filtreler", exact: true }).click();
  await page.locator(".panel-backdrop").click({ position: { x: 2, y: 2 } });
  await expect(page.locator("#filters")).toHaveCount(0);
  await page.setViewportSize({ width: 1512, height: 982 });
  for (const name of ["Filtreler", "Görünüm", "Harita rehberi"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page.locator(".selection-panel h2")).toHaveText("Ateş Tezer");
  }
  await page.keyboard.press("Escape");
  await expect(page.locator(".selection-panel")).toHaveCount(0);
  // Project data is deferred until the initial layout settles.
  const deferred = await browser.newPage();
  await deferred.addInitScript(() => {
    window.Worker = class {
      postMessage() {}
      terminate() {}
    } as unknown as typeof Worker;
  });
  const resources: string[] = [];
  deferred.on("request", (request) =>
    resources.push(new URL(request.url()).pathname),
  );
  await deferred.goto(`${base}?min=10`);
  await expect(deferred.locator("canvas")).toHaveAttribute(
    "data-layout",
    "pending",
  );
  expect(resources).not.toContain("/data/projects.json");
  // The unfiltered first view ships precomputed positions and needs no worker.
  await deferred.goto(base);
  await expect(deferred.locator("canvas")).toHaveAttribute(
    "data-layout",
    "ready",
  );
  expect(errors).toEqual([]);
  console.log(
    "App checks passed: visible mobile selections, deferred project recovery, modal focus, backdrop dismissal, and Escape preserving selection.",
  );
} finally {
  await browser.close();
}
