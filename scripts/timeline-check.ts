import { chromium, expect } from "@playwright/test";
import { concertWindow, monthIndex } from "../src/chronology";
import { filterGraph } from "../src/graph";
import type { Atlas, ConcertIndex } from "../src/types";
import { mkdir } from "node:fs/promises";
const base = process.env.ATLAS_TEST_URL || "http://localhost:18878";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Local server required");
const atlas: Atlas = await Bun.file(
  new URL("../public/data/atlas.json", import.meta.url),
).json();
const concerts: ConcertIndex = await Bun.file(
  new URL("../public/data/concerts.json", import.meta.url),
).json();
await mkdir(new URL("../.cache", import.meta.url), { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1512, height: 982 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const canvas = page.locator("canvas");
const start = page.getByLabel("Başlangıç tarihi", { exact: true });
const end = page.getByLabel("Bitiş tarihi", { exact: true });
const scrubber = page.getByLabel("Gösterilen tarih", { exact: true });
const show = async (date: string) => {
  await scrubber.fill(String(monthIndex(date)));
};
try {
  await page.goto(base);
  await expect(canvas).toHaveAttribute("data-layout", "ready", {
    timeout: 45000,
  });
  await expect(
    page.getByRole("region", { name: "Zaman çizelgesi" }),
  ).toBeVisible();
  await expect(start).toHaveValue("1956-04");
  await page.screenshot({ path: ".cache/timeline-desktop.png" });
  const selected = atlas.nodes.find((n) => n.key === "OnderFocan")!;
  const search = page.getByRole("combobox", {
    name: "Müzisyen ara",
    exact: true,
  });
  await search.fill(selected.name);
  await page.getByRole("option").first().click();
  await expect(canvas).not.toHaveAttribute("data-selected-position", "");
  const position = await canvas.getAttribute("data-selected-position");
  await show("2020-01");
  await expect(canvas).toHaveAttribute("data-animating", "true");
  await expect(canvas).toHaveAttribute("data-animating", "false");
  const windowed = concertWindow(
    concerts.timeline,
    monthIndex("1956-04"),
    monthIndex("2020-01"),
  );
  const expected = filterGraph(
    { nodes: atlas.nodes, edges: windowed.edges },
    windowed.counts,
    10,
    "",
    windowed.counts,
  );
  await expect(canvas).toHaveAttribute(
    "data-visible-nodes",
    String(expected.nodes.length),
  );
  await expect(canvas).toHaveAttribute("data-selected-position", position!);
  await expect(canvas).toHaveAttribute("data-layout", "ready");
  await page
    .getByRole("button", { name: "Seçimi kaldır", exact: true })
    .click();
  await start.fill("2018-01");
  await end.fill("2022-12");
  await expect(page).toHaveURL(/from=2018-01&to=2022-12/);
  await page.reload();
  await expect(start).toHaveValue("2018-01");
  await expect(end).toHaveValue("2022-12");
  await expect(canvas).toHaveAttribute("data-layout", "ready", {
    timeout: 45000,
  });
  await page
    .getByRole("slider", { name: "Aralık başlangıcı", exact: true })
    .press("ArrowRight");
  await expect(start).toHaveValue("2018-02");
  const handle = await page
    .getByRole("slider", { name: "Aralık başlangıcı", exact: true })
    .boundingBox();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + 15);
  await page.mouse.down();
  await page.mouse.move(handle!.x - 30, handle!.y + 15, { steps: 8 });
  await page.mouse.up();
  expect(await start.inputValue()).not.toBe("2018-02");
  await page.getByRole("button", { name: "Son 10 yıl", exact: true }).click();
  await page.getByRole("button", { name: "Ağın büyümesini oynat" }).click();
  await expect(
    page.getByRole("button", { name: "Oynatmayı duraklat" }),
  ).toBeVisible();
  await expect
    .poll(async () => Number(await scrubber.inputValue()))
    .toBeGreaterThan(Number(await scrubber.getAttribute("min")));
  await page.getByRole("button", { name: "Oynatmayı duraklat" }).click();
  const paused = await scrubber.inputValue();
  await page.screenshot({ path: ".cache/timeline-playing.png" });
  await expect(scrubber).toHaveValue(paused);
  await show("2020-01");
  await page.reload();
  await expect(scrubber).toHaveValue(String(monthIndex("2020-01")));
  await page.getByRole("button", { name: "Tüm tarihleri göster" }).click();
  await start.fill("1956-04");
  await end.fill("1956-04");
  await expect(
    page.getByRole("button", { name: "Ağın büyümesini oynat" }),
  ).toBeDisabled();
  await expect(page.locator(".empty-state")).toBeVisible();
  await end.fill("1956-05");
  await page.getByRole("button", { name: "Ağın büyümesini oynat" }).click();
  await expect(scrubber).toHaveValue(String(monthIndex("1956-05")));
  await expect(
    page.getByRole("button", { name: "Ağın büyümesini oynat" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tüm tarihleri göster" }).click();
  await page.getByRole("button", { name: "Filtreler", exact: true }).click();
  await page.getByLabel("Mekan", { exact: true }).fill("nardis");
  await page.getByRole("button", { name: /Nardis Jazz Club/ }).click();
  await page.getByRole("button", { name: "Filtreleri kapat" }).click();
  await start.fill("2020-01");
  await end.fill("2020-12");
  const venueWindow = concertWindow(
    concerts.timeline,
    monthIndex("2020-01"),
    monthIndex("2020-12"),
    "NardisJazzClub",
  );
  const venueGraph = filterGraph(
    { nodes: atlas.nodes, edges: venueWindow.edges },
    venueWindow.counts,
    10,
    "",
    venueWindow.counts,
  );
  await expect(canvas).toHaveAttribute(
    "data-visible-nodes",
    String(venueGraph.nodes.length),
  );
  await page.getByRole("button", { name: "Mekan filtresini kaldır" }).click();
  await page.getByRole("button", { name: "Tüm tarihleri göster" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await canvas.boundingBox())!.height).toBe(592);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const timeline = await page.locator(".timeline").boundingBox();
  expect(timeline!.y + timeline!.height).toBe(844);
  const dateBox = await end.boundingBox();
  expect(dateBox!.x + dateBox!.width).toBeLessThanOrEqual(390);
  const chart = await page.locator(".timeline-chart").boundingBox();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ id: 1, x: chart!.x, y: chart!.y + 20 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ id: 1, x: chart!.x + 60, y: chart!.y + 20 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  expect(await start.inputValue()).not.toBe("1956-04");
  await page.getByRole("button", { name: "Son 10 yıl", exact: true }).click();
  await page.screenshot({ path: ".cache/timeline-mobile.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".timeline")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page.getByRole("button", { name: "Tüm tarihleri göster" }).click();
  expect(errors).toEqual([]);
  console.log(
    "Timeline verified: dated graph counts, stable positions, month inputs, range dragging, keyboard, playback/pause, URL restore, empty dates, venue intersection, mobile touch and reduced motion.",
  );
} finally {
  await browser.close();
}
