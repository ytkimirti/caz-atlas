import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
const base = process.env.ATLAS_TEST_URL || "http://localhost:18894";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Use a local server");
await mkdir(new URL("../.cache", import.meta.url), { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1512, height: 982 } });
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
const canvas = page.locator("canvas");
const ready = () =>
  expect(canvas).toHaveAttribute("data-layout", "ready", { timeout: 60000 });
const option = (group: string, name: string) =>
  page.getByRole("group", { name: group }).getByRole("button", { name });
try {
  for (const min of ["10", "all"]) {
    const started = performance.now();
    await page.goto(`${base}?min=${min}`);
    await ready();
    console.log(
      JSON.stringify({ min, readyMs: Math.round(performance.now() - started) }),
    );
    await page.screenshot({ path: `.cache/layout-${min}.png` });
  }
  // A replacement worker wins even when the previous graph is still computing.
  await page.goto(`${base}?min=10`);
  await ready();
  await page.getByRole("button", { name: "Görünüm", exact: true }).click();
  await option("Gruplama", "Ayrıntılı").click();
  await option("Gruplama", "Geniş").click();
  await ready();
  await expect(page).toHaveURL(/resolution=0\.8/);
  await page.reload();
  await ready();
  await page.getByRole("button", { name: "Görünüm", exact: true }).click();
  await expect(option("Gruplama", "Geniş")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // Invalid and retired URL values recover without reaching the worker.
  await page.goto(`${base}?engine=d3&spacing=NaN`);
  await ready();
  await page.getByRole("button", { name: "Görünüm", exact: true }).click();
  await expect(option("Aralık", "Dengeli")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page).not.toHaveURL(/engine=/);
  // Worker failures leave a usable graph and a visible recovery instruction.
  await page.addInitScript(() => {
    window.Worker = class extends EventTarget {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      postMessage() {
        setTimeout(() => this.onerror?.(new ErrorEvent("error")), 0);
      }
      terminate() {}
    } as unknown as typeof Worker;
  });
  // The unfiltered view is precomputed, so use one that needs the worker.
  await page.goto(`${base}?min=10`);
  await expect(canvas).toHaveAttribute("data-layout", "fallback");
  await expect(page.getByRole("status")).toContainText(
    "Mevcut görünüm korunuyor",
  );
  await page.keyboard.press("+");
  expect(errors).toEqual([]);
  console.log(
    "Layout checks passed: full archive, cancellation, URL restore, invalid settings, worker fallback.",
  );
} finally {
  await browser.close();
}
