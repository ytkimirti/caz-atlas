import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import type { Atlas, ConcertIndex } from "../src/types";
import { adjacency, shortestPath, filterGraph } from "../src/graph";
const base = process.env.ATLAS_TEST_URL || "http://localhost:18837";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("UI checks must target a local development server.");
await mkdir(new URL("../.cache", import.meta.url), { recursive: true });
const data: Atlas = await Bun.file(
  new URL("../public/data/atlas.json", import.meta.url),
).json();
const concerts: ConcertIndex = await Bun.file(
  new URL("../public/data/concerts.json", import.meta.url),
).json();
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({
  viewport: { width: 1512, height: 982 },
  deviceScaleFactor: 1,
  reducedMotion: "reduce",
  colorScheme: "dark",
});
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
const canvas = page.locator(".network-canvas");
const search = page.getByRole("combobox", {
  name: "Müzisyen ara",
  exact: true,
});
const ready = () =>
  expect(canvas).toHaveAttribute("data-layout", "ready", { timeout: 45000 });
async function choose(name: string) {
  await search.fill(name);
  await page.locator(".search-results").getByRole("option").first().click();
}
try {
  await page.goto(base);
  await ready();
  expect(await canvas.boundingBox()).toEqual({
    x: 0,
    y: 0,
    width: 1512,
    height: 854,
  });
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).colorScheme,
    ),
  ).toBe("light");
  await expect(page.locator("nav")).toHaveCount(0);
  await expect(
    page.getByText(/Jam session|Plak koleksiyonu|Hikâyesi/),
  ).toHaveCount(0);
  const defaultGraph = filterGraph(
    { nodes: data.nodes, edges: concerts.edges },
    concerts.counts,
    10,
    "",
  );
  const visibleEdges = Number(await canvas.getAttribute("data-visible-edges"));
  expect(visibleEdges).toBeGreaterThan(0);
  expect(visibleEdges).toBeLessThan(defaultGraph.edges.length / 10);
  await page.screenshot({ path: ".cache/minimal-desktop.png" });

  await choose("asude sasmaz");
  await expect(page.locator(".selection-panel h2")).toHaveText("Asude Şaşmaz");
  await expect(page).toHaveURL(/m=AsudeSasmaz/);
  const from = data.nodes.find((n) => n.key === "AsudeSasmaz")!;
  // Exercise canvas hit testing at the rendered selected node.
  await expect(canvas).not.toHaveAttribute("data-selected-position", "");
  const [selectedX, selectedY] = (await canvas.getAttribute(
    "data-selected-position",
  ))!
    .split(",")
    .map(Number);
  await page.mouse.move(selectedX, selectedY);
  await expect(canvas).toHaveAttribute("data-focus", String(from.id));
  await expect(page.locator(".hover-readout")).toContainText("Asude Şaşmaz");
  await page.mouse.move(1510, 700);
  await expect(page.locator(".hover-readout")).toHaveCount(0);
  const graph = adjacency(defaultGraph);
  const target = defaultGraph.nodes.find(
    (n) => shortestPath(graph, from.id, n.id).length === 3,
  )!;
  expect(target).toBeTruthy();
  const expectedPath = shortestPath(graph, from.id, target.id);
  await search.fill(target.name);
  await page.locator(".search-results").getByRole("option").first().hover();
  await expect(page.locator(".path-caption")).toHaveText("En kısa yol · 2 bağ");
  await expect(canvas).toHaveAttribute("data-path", expectedPath.join(","));
  await expect(page.locator(".selection-panel h2")).toHaveText("Asude Şaşmaz");
  await page.screenshot({ path: ".cache/minimal-path.png" });
  const disconnected = defaultGraph.nodes.find(
    (n) => !shortestPath(graph, from.id, n.id).length,
  )!;
  expect(disconnected).toBeTruthy();
  await search.fill(disconnected.name);
  await page.locator(".search-results").getByRole("option").first().hover();
  await expect(page.locator(".path-readout")).toContainText("yol bulunamadı");
  await expect(canvas).toHaveAttribute("data-path", "");
  await search.press("Escape");
  await expect(page.locator(".path-readout")).toHaveCount(0);
  await expect(canvas).toHaveAttribute("data-path", "");
  await page.getByRole("button", { name: "Seçimi kaldır" }).click();

  await page.getByRole("button", { name: "Filtreler", exact: true }).click();
  await page.getByLabel("Konser sayısı", { exact: true }).fill("100");
  await ready();
  const expected = filterGraph(
    { nodes: data.nodes, edges: concerts.edges },
    concerts.counts,
    100,
    "",
  );
  await expect(page.locator(".filter-footer")).toContainText(
    expected.nodes.length.toLocaleString("tr-TR"),
  );
  await page.screenshot({ path: ".cache/minimal-filters.png" });
  await page.getByLabel("Konser sayısı", { exact: true }).fill("999999");
  await expect(page.locator(".empty-state")).toBeVisible();
  await page.getByLabel("Konser sayısı", { exact: true }).fill("10");
  await page.getByLabel("Mekan", { exact: true }).fill("nardis");
  await page.getByRole("button", { name: /Nardis Jazz Club/ }).click();
  await ready();
  const venue = concerts.venues.find((v) => v.id === "NardisJazzClub")!;
  const venueGraph = filterGraph(
    { nodes: data.nodes, edges: venue.edges },
    venue.musicians,
    10,
    "",
    venue.musicians,
  );
  await expect(page.locator(".filter-footer")).toContainText(
    venueGraph.nodes.length.toLocaleString("tr-TR"),
  );
  await expect(page).toHaveURL(/venue=NardisJazzClub/);
  await page.getByRole("button", { name: "Filtreleri kapat" }).click();
  await page.screenshot({ path: ".cache/minimal-venue.png" });
  await page.reload();
  await ready();
  await expect(page.locator(".active-filters")).toContainText(
    "Nardis Jazz Club",
  );
  await page.getByRole("button", { name: "Filtreler", exact: true }).click();
  await page.getByLabel("Enstrüman", { exact: true }).selectOption("Guitar");
  await ready();
  await search.fill("Asude");
  await expect(page.locator(".search-results").getByRole("option")).toHaveCount(
    0,
  );
  await search.press("Escape");
  await page
    .getByRole("button", { name: "Filtreleri temizle", exact: true })
    .click();
  await page.getByLabel("Konser sayısı", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Filtreleri kapat" }).click();
  await ready();
  await page.getByRole("button", { name: "Yakınlaştır", exact: true }).click();
  await page.getByRole("button", { name: "Grafı ekrana sığdır" }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await canvas.boundingBox())?.width).toBe(390);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: ".cache/minimal-mobile.png" });
  await choose("asude sasmaz");
  await expect(page.locator(".selection-panel h2")).toHaveText("Asude Şaşmaz");
  await page.screenshot({ path: ".cache/minimal-mobile-selected.png" });
  await page.getByRole("button", { name: "Filtreler", exact: true }).click();
  await expect(page.locator(".selection-panel")).not.toBeVisible();
  await expect(page.locator(".filter-panel")).toBeVisible();
  const bounds = await page.locator(".filter-panel").boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThan(844);
  await page.screenshot({ path: ".cache/minimal-mobile-filters.png" });
  await page.keyboard.press("Escape");
  await expect(page.locator(".filter-panel")).toHaveCount(0);
  await expect(page.locator(".selection-panel")).toHaveCount(0);
  await page.keyboard.press("Control+k");
  await expect(search).toBeFocused();
  await search.press("Escape");
  await search.blur();
  const cdp = await page.context().newCDPSession(page);
  // Releasing one finger after a pinch must not select the remaining node.
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { id: 1, x: 100, y: 380 },
      { id: 2, x: 250, y: 450 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { id: 1, x: 65, y: 350 },
      { id: 2, x: 285, y: 480 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [{ id: 1, x: 65, y: 350 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.locator(".selection-panel")).toHaveCount(0);
  await page.getByRole("button", { name: "Grafı ekrana sığdır" }).click();

  await page.setViewportSize({ width: 1512, height: 982 });
  await page
    .getByRole("button", { name: "Konser sayısı filtresini kaldır" })
    .click();
  await ready();
  await expect(canvas).toHaveAttribute(
    "aria-label",
    new RegExp(`^${Object.keys(concerts.counts).length} müzisyenin`),
  );
  await page.screenshot({ path: ".cache/minimal-all.png" });

  // Recover from a failed dataset request without a page reload.
  const recovery = await browser.newPage();
  await recovery.route("**/data/concerts.json", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await recovery.goto(base);
  await expect(
    recovery.getByRole("button", { name: "Tekrar dene" }),
  ).toBeVisible();
  await recovery.unroute("**/data/concerts.json");
  await recovery.getByRole("button", { name: "Tekrar dene" }).click();
  await expect(recovery.locator("canvas")).toBeVisible();
  await recovery.close();
  expect(errors).toEqual([]);
  console.log(
    "UI verified: light graph above timeline, sparse links, canvas hover, selected-to-hover shortest path, strict concert filter, empty results, venue-only collaborations, instrument intersection, URL reload, keyboard controls, mobile overlays, failed-load recovery, zero runtime errors.",
  );
} finally {
  await browser.close();
}
