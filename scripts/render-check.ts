import { chromium, expect } from "@playwright/test";

const base = process.env.ATLAS_TEST_URL || "http://localhost:18867";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Local server required");
interface Metrics {
  frames: number;
  milliseconds: number;
  viewportReads: number;
  active: boolean;
}
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({
  viewport: { width: 1512, height: 982 },
  reducedMotion: "reduce",
});
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(() => {
  const metrics: Metrics = {
    frames: 0,
    milliseconds: 0,
    viewportReads: 0,
    active: false,
  };
  Object.assign(window, { renderMetrics: metrics });
  const request = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) =>
    request((now) => {
      const start = performance.now();
      callback(now);
      if (metrics.active && callback.name === "draw") {
        metrics.frames++;
        metrics.milliseconds += performance.now() - start;
      }
    });
  const computedStyle = window.getComputedStyle.bind(window);
  window.getComputedStyle = (element, pseudo) => {
    if (metrics.active && element instanceof HTMLCanvasElement)
      metrics.viewportReads++;
    return computedStyle(element, pseudo);
  };
});
try {
  await page.goto(`${base}/?experience=live`);
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-physics", "running");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-physics-ticks")))
    .toBeGreaterThan(90);
  const metrics = await page.evaluate(async () => {
    const metrics = (window as unknown as { renderMetrics: Metrics })
      .renderMetrics;
    metrics.active = true;
    for (let i = 0; i < 180 && metrics.frames < 90; i++)
      await new Promise(requestAnimationFrame);
    metrics.active = false;
    return metrics;
  });
  console.log(
    JSON.stringify({
      ...metrics,
      averageDrawMs: metrics.milliseconds / metrics.frames,
    }),
  );
  if (!Bun.argv.includes("--measure-only")) {
    expect(metrics.frames).toBeGreaterThanOrEqual(90);
    expect(metrics.viewportReads).toBeLessThanOrEqual(2);
  }
  // Cached bounds must be remeasured when an overlay changes the safe viewport.
  await page.evaluate(() => {
    const metrics = (window as unknown as { renderMetrics: Metrics })
      .renderMetrics;
    metrics.viewportReads = 0;
    metrics.active = true;
  });
  await page.getByRole("button", { name: "Filtreler", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { renderMetrics: Metrics }).renderMetrics
            .viewportReads,
      ),
    )
    .toBeGreaterThan(0);
  await page.goto(`${base}/?experience=live&view=3d&min=100`);
  await expect(canvas).toHaveAttribute("data-physics", "running");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-physics-ticks")))
    .toBeGreaterThan(90);
  const zoom = Number(await canvas.getAttribute("data-zoom"));
  await canvas.dispatchEvent("wheel", {
    clientX: 750,
    clientY: 400,
    deltaY: -1600,
  });
  // Compare once the wheel has actually rendered, then across moving frames.
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-zoom")))
    .toBeGreaterThan(zoom);
  const values = await page.evaluate(async () => {
    const values: number[] = [];
    for (let i = 0; i < 60; i++) {
      await new Promise(requestAnimationFrame);
      values.push(
        Number(
          document.querySelector<HTMLCanvasElement>("canvas")!.dataset.zoom,
        ),
      );
    }
    return values;
  });
  const zoomDrift = Math.max(...values) - Math.min(...values);
  console.log(JSON.stringify({ manualZoomDrift: zoomDrift }));
  if (!Bun.argv.includes("--measure-only"))
    expect(zoomDrift).toBeLessThan(1e-8);
  // A panel's translated entrance must not leave the mobile focus target stale.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.route("https://bizimcaz.com/**", (route) => route.abort());
  await page.goto(`${base}/?view=3d&min=100`);
  await expect(canvas).toHaveAttribute("data-layout", "ready", {
    timeout: 45000,
  });
  await page.addStyleTag({
    content: ".selection-panel { animation-duration: 600ms !important; }",
  });
  await page
    .getByRole("combobox", { name: "Müzisyen veya grup ara" })
    .fill("can tutug");
  await page.locator(".search-results [role=option]").first().click();
  await page.locator(".selection-panel").evaluate(async (panel) => {
    await Promise.all(
      panel.getAnimations().map((animation) => animation.finished),
    );
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>("canvas")!;
        const panel = document
          .querySelector(".selection-panel")!
          .getBoundingClientRect();
        const instrument = document
          .querySelector(".instrument-explorer")!
          .getBoundingClientRect();
        const timeline = document
          .querySelector(".timeline")!
          .getBoundingClientRect();
        const top = Math.max(
          (parseFloat(
            getComputedStyle(canvas).getPropertyValue("--header-height"),
          ) || 132) + 16,
          instrument.bottom + 12,
        );
        const bottom = Math.min(
          innerHeight - 30,
          timeline.top - 16,
          panel.top - 12,
        );
        const actual = Number(canvas.dataset.selectedPosition!.split(",")[1]);
        return Math.abs(actual - (top + bottom) / 2);
      }),
    )
    .toBeLessThan(0.1);
  expect(errors).toEqual([]);
} finally {
  await browser.close();
}
