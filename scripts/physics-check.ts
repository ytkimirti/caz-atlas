import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const base = process.env.ATLAS_TEST_URL || "http://localhost:18862";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Local server required");
await mkdir(new URL("../.cache", import.meta.url), { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1512, height: 982 } });
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(() => {
  let workers = 0;
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(url: string | URL, options?: WorkerOptions) {
      if (
        String(url).includes("live-physics.worker") &&
        sessionStorage.getItem("fail-physics")
      ) {
        sessionStorage.removeItem("fail-physics");
        throw new Error("Simulated worker startup failure");
      }
      super(url, options);
      document.documentElement.dataset.workers = String(++workers);
    }
  };
});
try {
  for (const mode of ["2d", "3d"]) {
    await page.goto(`${base}/?from=2000-01&to=2026-01&at=2015-01&view=${mode}`);
    const canvas = page.locator("canvas");
    const cursor = page.getByLabel("Gösterilen tarih", { exact: true });
    await expect(canvas).toHaveAttribute("data-layout", "ready", {
      timeout: 45000,
    });
    await expect(canvas).toHaveAttribute("data-physics", "off");
    await expect(
      page.getByRole("button", { name: "Tarihi oynat", exact: true }),
    ).toHaveCount(0);
    const originalDate = await cursor.inputValue();
    await page.getByRole("button", { name: "Canlı modu", exact: true }).click();
    await expect(page.locator(".timeline")).toHaveAttribute(
      "data-experience",
      "live",
    );
    await expect(canvas).toHaveAttribute("data-physics", "running");
    await expect(cursor).toHaveValue(originalDate);
    const initialTicks = Number(
      await canvas.getAttribute("data-physics-ticks"),
    );
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-physics-ticks")))
      .toBeGreaterThan(initialTicks + 2);
    await expect(cursor).toHaveValue(originalDate);
    // Slow the date clock so movement can be verified within a single date.
    const speed = page.getByRole("button", {
      name: "Oynatma hızı",
      exact: true,
    });
    for (let i = 0; i < 3; i++) await speed.click();
    await expect(speed).toHaveText("0.5×");
    await page
      .getByRole("button", { name: "Tarihi oynat", exact: true })
      .click();
    await expect(canvas).toHaveAttribute("data-physics", "running");
    const sample = await canvas.getAttribute("data-physics-sample");
    const date = await cursor.inputValue();
    await expect(canvas).not.toHaveAttribute("data-physics-sample", sample!);
    await expect(cursor).toHaveValue(date);
    const ticks = Number(await canvas.getAttribute("data-physics-ticks"));
    const workers = await page.locator("html").getAttribute("data-workers");
    await expect(cursor).not.toHaveValue(date, { timeout: 12000 });
    expect(
      Number(await canvas.getAttribute("data-physics-ticks")),
    ).toBeGreaterThan(ticks);
    await expect(canvas).toHaveAttribute("data-layout", "ready");
    await expect(page.locator("html")).toHaveAttribute(
      "data-workers",
      workers!,
    );
    await page
      .getByRole("button", { name: "Tarihi duraklat", exact: true })
      .click();
    await expect(canvas).toHaveAttribute("data-physics", "running");
    const pausedSample = await canvas.getAttribute("data-physics-sample");
    const pausedTicks = await canvas.getAttribute("data-physics-ticks");
    const pausedDate = await cursor.inputValue();
    await page.waitForTimeout(750);
    await expect(canvas).not.toHaveAttribute(
      "data-physics-sample",
      pausedSample!,
    );
    expect(
      Number(await canvas.getAttribute("data-physics-ticks")),
    ).toBeGreaterThan(Number(pausedTicks));
    await expect(cursor).toHaveValue(pausedDate);
    await page
      .getByRole("button", { name: "Tarihi oynat", exact: true })
      .click();
    await expect(canvas).not.toHaveAttribute(
      "data-physics-sample",
      pausedSample!,
    );
    expect(
      Number(await canvas.getAttribute("data-physics-ticks")),
    ).toBeGreaterThan(Number(pausedTicks));
    const zooms = await page.evaluate(
      () =>
        new Promise<number[]>((resolve) => {
          const values: number[] = [];
          const start = performance.now();
          function sample(now: number) {
            values.push(
              Number(
                document.querySelector<HTMLCanvasElement>("canvas")!.dataset
                  .zoom,
              ),
            );
            if (now - start < 1800) requestAnimationFrame(sample);
            else resolve(values);
          }
          requestAnimationFrame(sample);
        }),
    );
    for (let i = 1; i < zooms.length; i++)
      expect(zooms[i]).toBeLessThanOrEqual(zooms[i - 1] + 1e-6);
    await page
      .getByRole("button", { name: "Yakınlaştır", exact: true })
      .click();
    await page.waitForTimeout(450);
    const zoom = await canvas.getAttribute("data-zoom");
    await page.waitForTimeout(650);
    await expect(canvas).toHaveAttribute("data-zoom", zoom!);
    await page.screenshot({ path: `.cache/physics-${mode}.png` });
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(canvas).toHaveAttribute("data-physics", "paused");
    const hiddenTicks = await canvas.getAttribute("data-physics-ticks");
    await page.waitForTimeout(150);
    await expect(canvas).toHaveAttribute("data-physics-ticks", hiddenTicks!);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: false,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(canvas).toHaveAttribute("data-physics", "running");
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-physics-ticks")))
      .toBeGreaterThan(Number(hiddenTicks));
    await expect(
      page.getByRole("button", { name: "Tarihi oynat", exact: true }),
    ).toBeVisible();
    const stopDate = await cursor.inputValue();
    await page
      .getByRole("button", { name: "Keşfet modu", exact: true })
      .click();
    await expect(canvas).toHaveAttribute("data-physics", "off");
    await expect(cursor).toHaveValue(stopDate);
    expect(new URL(page.url()).searchParams.has("experience")).toBe(false);
    console.log(
      `${mode}: moving bodies within one date, continuous ticks across dates, continuous physics before playback, during date pause, and after tab restore passed`,
    );
  }
  await page.goto(base);
  await expect(page.locator("canvas")).toHaveAttribute("data-layout", "ready", {
    timeout: 45000,
  });
  await page.getByRole("button", { name: "Canlı modu", exact: true }).click();
  await page.getByRole("button", { name: "Tarihi oynat", exact: true }).click();
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-physics",
    "running",
  );
  expect(
    Number(await page.locator("canvas").getAttribute("data-visible-nodes")),
  ).toBeGreaterThan(1);
  // Exercise replay from the end, reduced motion, and touch-sized UI.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${base}/?from=2020-01&to=2020-04&min=all`);
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-layout", "ready", {
    timeout: 45000,
  });
  await page.getByRole("button", { name: "Canlı modu", exact: true }).click();
  await page.getByRole("button", { name: "Tarihi oynat", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-physics", "running");
  await expect(
    page.getByLabel("Gösterilen tarih", { exact: true }),
  ).toHaveValue(String(2020 * 12 + 3), { timeout: 20000 });
  await expect(
    page.getByRole("button", { name: "Tarihi oynat", exact: true }),
  ).toBeVisible();
  await expect(canvas).toHaveAttribute("data-physics", "running");
  const endTicks = Number(await canvas.getAttribute("data-physics-ticks"));
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-physics-ticks")))
    .toBeGreaterThan(endTicks + 2);
  await page.screenshot({ path: ".cache/physics-mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Canlı modu", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(canvas).toHaveAttribute("data-physics", "running");
  await page.getByLabel("Bitiş tarihi", { exact: true }).fill("2020-05");
  await expect(page.locator(".timeline")).toHaveAttribute(
    "data-experience",
    "live",
  );
  await expect(canvas).toHaveAttribute("data-physics", "running");
  await page.getByRole("button", { name: "Görünüm", exact: true }).click();
  await expect(page.locator("#layout-engine")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Görünümü kapat", exact: true })
    .click();
  await page.getByRole("button", { name: "Keşfet modu", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-physics", "off");
  await page.getByRole("button", { name: "Görünüm", exact: true }).click();
  await expect(page.locator("#layout-engine")).toBeVisible();
  await page
    .getByRole("button", { name: "Görünümü kapat", exact: true })
    .click();
  await page.goto(`${base}/?from=2020-01&to=2026-01&at=2023-01`);
  await expect(canvas).toHaveAttribute("data-layout", "ready", {
    timeout: 45000,
  });
  await page.evaluate(() => sessionStorage.setItem("fail-physics", "once"));
  await page.getByRole("button", { name: "Canlı modu", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-layout", "fallback");
  await expect(
    page.getByRole("button", { name: "Tarihi oynat", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Tekrar hesapla", exact: true })
    .click();
  await expect(canvas).toHaveAttribute("data-layout", "ready");
  await page.getByRole("button", { name: "Tarihi oynat", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-physics", "running");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-physics-ticks")))
    .toBeGreaterThan(2);
  await page.getByRole("button", { name: "Keşfet modu", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-physics", "off");
  const stoppedDate = await page
    .getByLabel("Gösterilen tarih", { exact: true })
    .inputValue();
  await page.waitForTimeout(900);
  await expect(
    page.getByLabel("Gösterilen tarih", { exact: true }),
  ).toHaveValue(stoppedDate);
  expect(errors).toEqual([]);
  console.log(
    "Mobile replay, continuous end-of-range physics, reduced motion, worker failure recovery and runtime errors passed",
  );
} finally {
  await browser.close();
}
