import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

const base = process.env.ATLAS_TEST_URL || "http://localhost:18811";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("UI checks must target a local development server.");
await mkdir(new URL("../.cache", import.meta.url), { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({
  viewport: { width: 1512, height: 982 },
  reducedMotion: "reduce",
});
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
const canvas = page.locator(".network-canvas");
const ready = () =>
  expect(canvas).toHaveAttribute("data-layout", "ready", { timeout: 45000 });
const selectFirst = async () => {
  await page
    .getByRole("combobox", { name: "Müzisyen veya grup ara", exact: true })
    .fill("");
  await page
    .getByRole("combobox", { name: "Müzisyen veya grup ara", exact: true })
    .focus();
  await page.locator(".search-results [role=option]").first().click();
};
try {
  await page.goto(base);
  await ready();
  const count = await canvas.getAttribute("data-visible-nodes");
  const edges = await canvas.getAttribute("data-visible-edges");
  await selectFirst();
  const selected = await canvas.getAttribute("data-focus");
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await ready();
  await expect(canvas).toHaveAttribute("data-mode", "3d");
  await expect(canvas).toHaveAttribute("data-focus", selected!);
  await expect(canvas).toHaveAttribute("data-visible-nodes", count!);
  await expect(canvas).toHaveAttribute("data-visible-edges", edges!);
  await expect(page).toHaveURL(/view=3d/);
  await page.getByRole("button", { name: "Görünüm", exact: true }).click();
  await expect(page.getByRole("group", { name: "Gruplama" })).toHaveCount(0);
  await page.getByRole("button", { name: "Görünümü kapat" }).click();
  const initialPosition = await canvas.getAttribute("data-selected-position");
  const initialRotation = await canvas.getAttribute("data-rotation");
  await page.mouse.move(750, 550);
  await page.mouse.down();
  await page.mouse.move(930, 590, { steps: 12 });
  await page.mouse.up();
  await expect(canvas).not.toHaveAttribute("data-rotation", initialRotation!);
  await expect(canvas).toHaveAttribute(
    "data-selected-position",
    initialPosition!,
  );
  await expect(canvas).toHaveAttribute("data-focus", selected!);
  const rotation = await canvas.getAttribute("data-rotation");
  const view = await canvas.getAttribute("data-view");
  await page.keyboard.down("Shift");
  await page.mouse.move(750, 550);
  await page.mouse.down();
  await page.mouse.move(800, 580, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(canvas).toHaveAttribute("data-rotation", rotation!);
  await expect(canvas).not.toHaveAttribute("data-view", view!);
  const zoom = Number(await canvas.getAttribute("data-zoom"));
  await page.mouse.wheel(0, -150);
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-zoom")))
    .toBeGreaterThan(zoom);
  await canvas.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(canvas).not.toHaveAttribute("data-rotation", rotation!);
  await page.getByRole("button", { name: "Görünümü sıfırla" }).click();
  await expect(canvas).toHaveAttribute("data-rotation", initialRotation!);
  await page.locator(".collaborator-rows > button").first().hover();
  await expect
    .poll(
      async () => (await canvas.getAttribute("data-path"))!.split(",").length,
    )
    .toBeGreaterThan(1);
  await page.mouse.move(700, 700);
  // Hit-testing follows the current projection after an orbit and reset.
  const point = (await canvas.getAttribute("data-selected-position"))!
    .split(",")
    .map(Number);
  await page.mouse.click(point[0], point[1]);
  await expect(canvas).toHaveAttribute("data-focus", selected!);
  await page.screenshot({ path: ".cache/spatial-desktop.png" });
  await page.reload();
  await ready();
  await expect(
    page.getByRole("button", { name: "3D", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(canvas).toHaveAttribute("data-focus", selected!);
  await page
    .getByRole("navigation", { name: "Enstrüman renkleri" })
    .getByRole("button", { name: /Üflemeli/ })
    .click();
  await expect(canvas).not.toHaveAttribute("data-highlighted", "");
  await expect(canvas).toHaveAttribute("data-visible-nodes", count!);
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await ready();
  await page.getByRole("button", { name: "Görünüm", exact: true }).click();
  await expect(page.getByRole("group", { name: "Gruplama" })).toBeVisible();
  await page.getByRole("button", { name: "Görünümü kapat" }).click();
  await expect(canvas).toHaveAttribute("data-mode", "2d");
  await expect(canvas).toHaveAttribute("data-focus", selected!);
  await expect(page).not.toHaveURL(/view=3d/);
  // Empty filtered graphs and subsequent recovery work in spatial mode.
  await page.goto(`${base}/?view=3d&min=999999`);
  await ready();
  await expect(canvas).toHaveAttribute("data-visible-nodes", "0");
  await page.getByRole("button", { name: "Filtreler", exact: true }).click();
  await page.getByRole("button", { name: "En az 50 konser" }).click();
  await ready();
  await expect(canvas).not.toHaveAttribute("data-visible-nodes", "0");
  await page.getByRole("button", { name: "Filtreleri kapat" }).click();
  const beforeDate = await canvas.getAttribute("data-visible-nodes");
  await page.getByLabel("Bitiş tarihi", { exact: true }).fill("2020-01");
  await ready();
  await expect(canvas).not.toHaveAttribute("data-visible-nodes", beforeDate!);
  await expect(canvas).toHaveAttribute("data-mode", "3d");
  await expect(page).toHaveURL(/to=2020-01/);
  // Rapid mode changes cancel stale workers and finish in the requested mode.
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await ready();
  await expect(canvas).toHaveAttribute("data-mode", "3d");
  // Touch orbit and pinch, with the mode switch still available on a phone.
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  mobile.on("pageerror", (error) => errors.push(error.message));
  await mobile.goto(`${base}/?view=3d&min=50`);
  const mobileCanvas = mobile.locator(".network-canvas");
  await expect(mobileCanvas).toHaveAttribute("data-layout", "ready", {
    timeout: 45000,
  });
  const mobileRotation = await mobileCanvas.getAttribute("data-rotation");
  const cdp = await mobile.context().newCDPSession(mobile);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 270, y: 310, id: 1 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 320, y: 340, id: 1 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(mobileCanvas).not.toHaveAttribute(
    "data-rotation",
    mobileRotation!,
  );
  const mobileZoom = Number(await mobileCanvas.getAttribute("data-zoom"));
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: 240, y: 310, id: 1 },
      { x: 310, y: 310, id: 2 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: 215, y: 310, id: 1 },
      { x: 340, y: 310, id: 2 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(async () => Number(await mobileCanvas.getAttribute("data-zoom")))
    .toBeGreaterThan(mobileZoom);
  await mobile.getByRole("button", { name: "Görünümü sıfırla" }).click();
  await mobile.screenshot({ path: ".cache/spatial-mobile.png" });
  expect(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await mobile.getByRole("button", { name: "2D", exact: true }).click();
  await expect(mobileCanvas).toHaveAttribute("data-mode", "2d");
  // Failed workers leave a usable graph and expose the existing retry action.
  const recovery = await browser.newPage();
  await recovery.addInitScript(() => {
    const OriginalWorker = window.Worker;
    let fail = true;
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (fail) {
          fail = false;
          throw new Error("Intentional worker failure");
        }
        super(url, options);
      }
    };
  });
  await recovery.goto(`${base}/?view=3d&min=50`);
  await expect(recovery.locator("canvas")).toHaveAttribute(
    "data-layout",
    "fallback",
  );
  await recovery.getByRole("button", { name: "Tekrar hesapla" }).click();
  await expect(recovery.locator("canvas")).toHaveAttribute(
    "data-layout",
    "ready",
    { timeout: 45000 },
  );
  expect(errors).toEqual([]);
  console.log(
    "3D checks passed: orbit, pan, zoom, keyboard, selection, paths, URL restore, filters, 2D return and touch.",
  );
} finally {
  await browser.close();
}
