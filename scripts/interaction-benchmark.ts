import { chromium, expect } from "@playwright/test";
import type { CDPSession, Page } from "@playwright/test";

// Main-thread cost of everyday interactions on the full map: load, pan, zoom,
// hover, selection and timeline scrubbing. Run against a production build.
const base = process.env.ATLAS_TEST_URL || "http://localhost:4173";
const runs = Number(process.env.RUNS || 3);
const only = process.env.ONLY?.split(",");

interface Sample {
  drawMs: number[];
  events: { name: string; duration: number; processing: number }[];
}
declare global {
  interface Window {
    bench: Sample & { active: boolean };
  }
}

async function metrics(cdp: CDPSession) {
  const { metrics } = await cdp.send("Performance.getMetrics");
  const get = (name: string) => metrics.find((m) => m.name === name)!.value;
  return {
    task: get("TaskDuration") * 1000,
    script: get("ScriptDuration") * 1000,
    layout: (get("LayoutDuration") + get("RecalcStyleDuration")) * 1000,
  };
}
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b),
    mid = sorted.length / 2;
  return sorted.length % 2
    ? sorted[Math.floor(mid)]
    : (sorted[mid - 1] + sorted[mid]) / 2;
};
const quantile = (values: number[], q: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};
const round = (n: number) => Math.round(n * 10) / 10;

let current = "";
async function measure(
  page: Page,
  cdp: CDPSession,
  action: () => Promise<void>,
) {
  await page.evaluate(() => {
    window.bench.drawMs = [];
    window.bench.events = [];
    window.bench.active = true;
  });
  const profiling = process.env.PROFILE === current;
  if (profiling) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
    await cdp.send("Profiler.start");
  }
  const before = await metrics(cdp);
  const started = Date.now();
  await action();
  // Let queued frames, React commits and the redraw after motion finish.
  await page.waitForTimeout(250);
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const wait = Object.assign(
          () => requestAnimationFrame(Object.assign(resolve, { bench: true })),
          { bench: true },
        );
        requestAnimationFrame(wait);
      }),
  );
  const wall = Date.now() - started;
  const after = await metrics(cdp);
  if (profiling) {
    const { profile } = await cdp.send("Profiler.stop");
    const total = new Map<string, number>();
    const dt = new Map<number, number>();
    profile.samples!.forEach((id, i) =>
      dt.set(id, (dt.get(id) ?? 0) + (profile.timeDeltas![i] ?? 0) / 1000),
    );
    for (const node of profile.nodes) {
      const f = node.callFrame;
      const name = `${f.functionName || "(anon)"} ${f.url.split("/").pop()}:${f.lineNumber + 1}`;
      total.set(name, (total.get(name) ?? 0) + (dt.get(node.id) ?? 0));
    }
    console.error(
      [...total]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([name, ms]) => `${ms.toFixed(0).padStart(7)}ms ${name}`)
        .join("\n"),
    );
  }
  const sample = await page.evaluate(() => {
    window.bench.active = false;
    return { drawMs: window.bench.drawMs, events: window.bench.events };
  });
  return {
    wallMs: wall,
    mainThreadMs: round(after.task - before.task),
    scriptMs: round(after.script - before.script),
    styleLayoutMs: round(after.layout - before.layout),
    draws: sample.drawMs.length,
    drawMeanMs: round(
      sample.drawMs.reduce((a, b) => a + b, 0) / (sample.drawMs.length || 1),
    ),
    drawP95Ms: round(quantile(sample.drawMs, 0.95)),
    eventP95Ms: round(
      quantile(
        sample.events.map((e) => e.duration),
        0.95,
      ),
    ),
    eventMaxMs: round(Math.max(0, ...sample.events.map((e) => e.duration))),
  };
}

const browser = await chromium.launch({ headless: true });
const results: Record<
  string,
  ReturnType<typeof measure> extends Promise<infer R> ? R[] : never
> = {};
const record = (name: string, value: Awaited<ReturnType<typeof measure>>) => {
  console.error(name, JSON.stringify(value));
  (results[name] ??= []).push(value);
};

for (let run = 0; run < runs; run++) {
  const context = await browser.newContext({
    viewport: { width: 1512, height: 982 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.bench = { drawMs: [], events: [], active: false };
    const request = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      request((now) => {
        // Frames the benchmark itself waits on are not draws.
        if (!window.bench.active || "bench" in callback) return callback(now);
        const start = performance.now();
        callback(now);
        window.bench.drawMs.push(performance.now() - start);
      });
    // Event Timing covers clicks and input, not pointermove or wheel.
    new PerformanceObserver((list) => {
      if (!window.bench.active) return;
      for (const entry of list.getEntries() as PerformanceEventTiming[])
        window.bench.events.push({
          name: entry.name,
          duration: entry.duration,
          processing: entry.processingEnd - entry.processingStart,
        });
    }).observe({
      type: "event",
      durationThreshold: 16,
      buffered: false,
    } as PerformanceObserverInit);
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  const canvas = page.locator("canvas.network-canvas");
  const box = { x: 0, y: 0, w: 1512, h: 982 };
  const center = { x: box.w / 2, y: box.h / 2 };

  const loadStart = Date.now();
  await page.goto(base);
  await expect(canvas).toHaveAttribute("data-layout", "ready", {
    timeout: 60000,
  });
  console.error("layout ready", Date.now() - loadStart);
  // Region names appear after projects load; wait for the map to settle.
  await expect
    .poll(async () => (await canvas.getAttribute("data-ensembles")) ?? "[]", {
      timeout: 30000,
    })
    .not.toBe("[]");
  await expect(canvas).toHaveAttribute("data-animating", "false");
  const load = await metrics(cdp);
  record("load", {
    wallMs: Date.now() - loadStart,
    mainThreadMs: round(load.task),
    scriptMs: round(load.script),
    styleLayoutMs: round(load.layout),
    draws: 0,
    drawMeanMs: 0,
    drawP95Ms: 0,
    eventP95Ms: 0,
    eventMaxMs: 0,
  });

  const want = (name: string) => !only || only.includes(name);
  const scenario = async (name: string, action: () => Promise<void>) => {
    if (!want(name)) return;
    current = name;
    record(name, await measure(page, cdp, action));
  };
  await scenario("pan", async () => {
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    for (let i = 1; i <= 60; i++)
      await page.mouse.move(center.x + i * 4, center.y + i * 2);
    for (let i = 60; i >= 0; i--)
      await page.mouse.move(center.x + i * 4, center.y + i * 2);
    await page.mouse.up();
  });
  await scenario("zoom", async () => {
    await page.mouse.move(center.x, center.y);
    for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -40);
    for (let i = 0; i < 30; i++) await page.mouse.wheel(0, 40);
  });
  await scenario("hover", async () => {
    for (let i = 0; i <= 120; i++)
      await page.mouse.move(300 + i * 7, 250 + ((i * 37) % 450));
  });
  // A well connected musician, picked through search, then hover and pan.
  if (["select", "hover-selected", "pan-selected"].some(want)) {
    const search = page.getByRole("combobox", {
      name: "Müzisyen veya grup ara",
      exact: true,
    });
    current = "select";
    record(
      "select",
      await measure(page, cdp, async () => {
        await search.fill("Önder Focan");
        await page
          .locator(".search-results")
          .getByRole("option")
          .first()
          .click();
        await expect(canvas).not.toHaveAttribute("data-focus", "");
        await expect(canvas).toHaveAttribute("data-animating", "false");
      }),
    );
    await scenario("hover-selected", async () => {
      for (let i = 0; i <= 120; i++)
        await page.mouse.move(300 + i * 7, 250 + ((i * 37) % 450));
    });
    await scenario("pan-selected", async () => {
      await page.mouse.move(center.x, center.y + 200);
      await page.mouse.down();
      for (let i = 1; i <= 60; i++)
        await page.mouse.move(center.x + i * 4, center.y + 200 + i * 2);
      await page.mouse.up();
    });
    await page.keyboard.press("Escape");
    await expect(canvas).toHaveAttribute("data-focus", "");
  }
  if (want("scrub")) {
    const scrubber = page.getByLabel("Gösterilen tarih", { exact: true });
    const max = Number(await scrubber.getAttribute("max"));
    await scenario("scrub", async () => {
      for (let i = 0; i < 12; i++)
        await scrubber.fill(String(max - 12 * (i + 1)));
      await expect(canvas).toHaveAttribute("data-layout", "ready", {
        timeout: 60000,
      });
    });
  }
  if (errors.length) console.error("page errors", errors);
  await context.close();
}
await browser.close();

const summary = Object.fromEntries(
  Object.entries(results).map(([name, samples]) => [
    name,
    Object.fromEntries(
      Object.keys(samples[0]).map((key) => [
        key,
        median(samples.map((s) => s[key as keyof typeof s])),
      ]),
    ),
  ]),
);
console.table(summary);
console.log(JSON.stringify(summary));
