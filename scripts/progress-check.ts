import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { concertWindow, monthIndex } from "../src/chronology";
import { filterGraph } from "../src/graph";
import type { Atlas, ConcertIndex } from "../src/types";

type Request = {
  nodes: { id: number; count: number }[];
  edges: Atlas["edges"];
};
type ControlledWorker = {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: (() => void) | null;
  request: Request | null;
  terminated: boolean;
};
declare global {
  interface Window {
    layoutHarness: {
      workers: ControlledWorker[];
      failConstruction: boolean;
      failPost: boolean;
    };
  }
}
const base = process.env.ATLAS_TEST_URL || "http://localhost:18894";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Progress checks must target a local server.");
await mkdir(new URL("../.cache", import.meta.url), { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1512, height: 982 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  const NativeWorker = window.Worker;
  const params = new URLSearchParams(location.search);
  const harness = (window.layoutHarness = {
    workers: [] as ControlledWorker[],
    failConstruction: params.has("worker-error"),
    failPost: params.has("post-error"),
  });
  window.Worker = class extends EventTarget {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    onmessageerror: (() => void) | null = null;
    request: Request | null = null;
    terminated = false;
    constructor(url: string | URL, options?: WorkerOptions) {
      super();
      if (String(url).includes("live-physics.worker"))
        return new NativeWorker(url, options) as unknown as this;
      if (harness.failConstruction)
        throw new DOMException("Worker blocked", "SecurityError");
      harness.workers.push(this);
    }
    postMessage(request: Request) {
      if (harness.failPost)
        throw new DOMException("Cannot clone", "DataCloneError");
      this.request = structuredClone(request);
    }
    terminate() {
      this.terminated = true;
    }
  } as unknown as typeof Worker;
});
const progress = page.getByRole("progressbar", {
  name: "Yerleşim hesaplanıyor",
  includeHidden: true,
});
const status = page.getByRole("status", { includeHidden: true });
const canvas = page.locator("canvas");
const complete = () =>
  page.evaluate(() => {
    const worker = window.layoutHarness.workers.at(-1)!;
    worker.onmessage?.(
      new MessageEvent("message", {
        data: {
          status: "ready",
          positions: worker.request!.nodes.map((n, i) => ({
            id: n.id,
            x: (i % 40) * 30,
            y: Math.floor(i / 40) * 30,
          })),
        },
      }),
    );
  });
const fail = () =>
  page.evaluate(() => {
    window.layoutHarness.workers
      .at(-1)!
      .onerror?.(new ErrorEvent("error", { cancelable: true }));
  });
const ready = async () => {
  await expect(canvas).toHaveAttribute("data-layout", "ready");
  await expect(canvas).toHaveAttribute("aria-busy", "false");
  await expect(progress).toHaveCount(0);
  await expect(status).toHaveText("Yerleşim hazır");
};
try {
  await page.goto(`${base}?min=10`);
  await expect(progress).toBeVisible();
  await expect(canvas).toHaveAttribute("aria-busy", "true");
  expect(await progress.getAttribute("aria-valuenow")).toBeNull();
  expect(
    await progress
      .locator("span")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("layout-loading");
  await page.getByRole("button", { name: "Filtreler", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(progress).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await progress
      .locator("span")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await fail();
  await expect(progress).toHaveCount(0);
  await expect(canvas).toHaveAttribute("aria-busy", "false");
  await expect(status).toBeVisible();
  await expect(status).toContainText("Mevcut görünüm korunuyor");
  await page.screenshot({ path: ".cache/progress-mobile-failure.png" });
  await page.getByRole("button", { name: "Filtreleri kapat" }).click();
  await page.getByRole("button", { name: "Tekrar hesapla" }).click();
  await expect(progress).toBeVisible();
  // A late result from the failed job must not settle the retry.
  await page.evaluate(() =>
    window.layoutHarness.workers.at(-2)!.onmessage?.(
      new MessageEvent("message", {
        data: { status: "ready", positions: [] },
      }),
    ),
  );
  await expect(canvas).toHaveAttribute("data-layout", "pending");
  await complete();
  await ready();
  const search = page.getByRole("combobox", {
    name: "Müzisyen veya grup ara",
    exact: true,
  });
  await search.fill("Asude Sasmaz");
  await page.locator(".search-results").getByRole("option").first().click();
  await expect(page.locator(".selection-panel")).toBeVisible();
  // Retry/failure on mobile must also be accessible while a selection is open.
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.getByRole("button", { name: "Görünüm", exact: true }).click();
  await page
    .getByRole("group", { name: "Gruplama" })
    .getByRole("button", { name: "Ayrıntılı" })
    .click();
  await expect(progress).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(canvas).toHaveAttribute("width", "390");
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(canvas).not.toHaveAttribute("data-selected-position", "");
  const before = await canvas.getAttribute("data-selected-position");
  await fail();
  await expect(status).toBeVisible();
  await expect(canvas).toHaveAttribute("data-selected-position", before!);
  await page.getByRole("button", { name: "Görünümü kapat" }).click();
  await page.getByRole("button", { name: "Tekrar hesapla" }).click();
  await complete();
  await ready();

  for (const failure of ["worker-error", "post-error"]) {
    await page.goto(`${base}?min=10&${failure}=1`);
    await expect(canvas).toHaveAttribute("data-layout", "fallback");
    await expect(status).toBeVisible();
    await expect(progress).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        window.layoutHarness.workers.every((w) => w.terminated),
      ),
    ).toBe(true);
    await page.evaluate(() => {
      window.layoutHarness.failConstruction = false;
      window.layoutHarness.failPost = false;
    });
    await page.getByRole("button", { name: "Tekrar hesapla" }).click();
    await expect(progress).toBeVisible();
    await complete();
    await ready();
  }
  // Date changes must send period-specific membership, weights and counts to physics.
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${base}?min=10`);
  await expect(progress).toBeVisible();
  await complete();
  await ready();
  const initialJobs = await page.evaluate(
    () => window.layoutHarness.workers.length,
  );
  await page.getByLabel("Başlangıç tarihi", { exact: true }).fill("2018-01");
  await expect(progress).toBeVisible();
  const pendingJob = await page.evaluate(
    () => window.layoutHarness.workers.length - 1,
  );
  expect(pendingJob).toBeGreaterThanOrEqual(initialJobs);
  await page.getByLabel("Bitiş tarihi", { exact: true }).fill("2022-12");
  await expect
    .poll(() => page.evaluate(() => window.layoutHarness.workers.length))
    .toBeGreaterThan(pendingJob + 1);
  expect(
    await page.evaluate(
      (i) => window.layoutHarness.workers[i].terminated,
      pendingJob,
    ),
  ).toBe(true);
  const atlas: Atlas = await Bun.file(
    new URL("../public/data/atlas.json", import.meta.url),
  ).json();
  const concerts: ConcertIndex = await Bun.file(
    new URL("../public/data/concerts.json", import.meta.url),
  ).json();
  const period = concertWindow(
    concerts.timeline,
    monthIndex("2018-01"),
    monthIndex("2022-12"),
  );
  // min=10 keeps musicians with at least ten concerts.
  const expected = filterGraph(
    { nodes: atlas.nodes, edges: period.edges },
    period.counts,
    9,
    period.counts,
  );
  const request = await page.evaluate(
    () => window.layoutHarness.workers.at(-1)!.request!,
  );
  expect(request.nodes).toEqual(
    expected.nodes.map((n) => ({ id: n.id, count: period.counts[n.id] || 0 })),
  );
  const orderedEdges = (edges: Atlas["edges"]) =>
    [...edges].sort((a, b) => a.source - b.source || a.target - b.target);
  expect(orderedEdges(request.edges)).toEqual(orderedEdges(expected.edges));
  await page.evaluate(
    (i) =>
      window.layoutHarness.workers[i].onmessage?.(
        new MessageEvent("message", {
          data: { status: "ready", positions: [] },
        }),
      ),
    pendingJob,
  );
  await expect(canvas).toHaveAttribute("data-layout", "pending");
  await expect(progress).toBeVisible();
  await complete();
  await ready();
  // Live physics reuses the ready layout without starting new layout jobs.
  await page.getByRole("button", { name: "Canlı modu", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-physics", "running");
  await page.getByRole("button", { name: "Tarihi oynat" }).click();
  await expect(progress).toHaveCount(0);
  const cursor = page.getByLabel("Gösterilen tarih", { exact: true });
  const heldDate = await cursor.inputValue();
  const heldJobs = await page.evaluate(
    () => window.layoutHarness.workers.length,
  );
  await expect
    .poll(async () => Number(await cursor.inputValue()))
    .toBeGreaterThan(Number(heldDate));
  expect(await page.evaluate(() => window.layoutHarness.workers.length)).toBe(
    heldJobs,
  );
  await page.getByRole("button", { name: "Tarihi duraklat" }).click();
  await expect(canvas).toHaveAttribute("data-physics", "running");
  await page.goto(`${base}?min=999999&worker-error=1`);
  await expect(page.locator(".empty-state")).toBeVisible();
  await expect(canvas).toHaveAttribute("data-layout", "ready");
  await expect(progress).toHaveCount(0);
  expect(await page.evaluate(() => window.layoutHarness.workers.length)).toBe(
    0,
  );
  expect(errors).toEqual([]);
  console.log(
    "Progress checks passed: held workers, mobile panels, reduced motion, busy semantics, preserved positions, retry, stale callbacks, dated worker inputs and cancellation, construction/submission failures, empty graph.",
  );
} finally {
  await browser.close();
}
