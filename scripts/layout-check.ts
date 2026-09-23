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
try {
  for (const min of ["10", "all"]) {
    for (const engine of ["communities", "forceatlas2", "d3", "ngraph"]) {
      const started = performance.now();
      await page.goto(`${base}?engine=${engine}&min=${min}`);
      await ready();
      await expect(canvas).toHaveAttribute("data-engine", engine);
      console.log(
        JSON.stringify({
          min,
          engine,
          readyMs: Math.round(performance.now() - started),
        }),
      );
      await page.screenshot({ path: `.cache/layout-${min}-${engine}.png` });
    }
  }
  // A replacement worker wins even when the previous graph is still computing.
  await page.goto(`${base}?min=all&engine=forceatlas2`);
  await page.getByRole("button", { name: "Görünüm", exact: true }).click();
  const selector = page.getByLabel("Yerleşim", { exact: true });
  await selector.selectOption("d3");
  await selector.selectOption("ngraph");
  await ready();
  await expect(canvas).toHaveAttribute("data-engine", "ngraph");
  await expect(page).toHaveURL(/engine=ngraph/);
  await page.reload();
  await ready();
  await page.getByRole("button", { name: "Görünüm", exact: true }).click();
  await expect(selector).toHaveValue("ngraph");
  // Invalid URL values recover without sending bad parameters to the worker.
  await page.goto(`${base}?engine=invalid&spacing=NaN`);
  await ready();
  await page.getByRole("button", { name: "Görünüm", exact: true }).click();
  await expect(selector).toHaveValue("communities");
  await expect(page.getByLabel("Aralık", { exact: true })).toHaveValue("1");
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
    "Layout checks passed: engines, full archive, cancellation, URL restore, invalid settings, worker fallback.",
  );
} finally {
  await browser.close();
}
