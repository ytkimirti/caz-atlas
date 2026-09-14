import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { Position } from "../src/layout";
import { project3D, sceneBounds } from "../src/projection";
import { orbitRadius } from "../src/camera";

const base = process.env.ATLAS_TEST_URL || "http://localhost:18868";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Local server required");
await mkdir(new URL("../.cache", import.meta.url), { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const errors: string[] = [];
async function setup(page: Page) {
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", (event) => {
          if (event.data.positions)
            Object.assign(window, { layoutPositions: event.data.positions });
        });
      }
    };
  });
  await page.goto(`${base}/?view=3d&min=50`);
  await expect(page.locator("canvas")).toHaveAttribute("data-layout", "ready", {
    timeout: 45000,
  });
}
async function settled(page: Page) {
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-animating",
    "false",
  );
}
async function choose(page: Page, name: string) {
  await page
    .getByRole("combobox", { name: "Müzisyen veya grup ara", exact: true })
    .fill(name);
  await page.locator(".search-results [role=option]").first().click();
  await settled(page);
}
async function centered(page: Page) {
  const canvas = page.locator("canvas");
  const id = Number(await canvas.getAttribute("data-focus"));
  const positions = await page.evaluate(
    () =>
      (window as unknown as { layoutPositions: Position[] }).layoutPositions,
  );
  const selected = positions.find((p) => p.id === id)!;
  expect(
    (await canvas.getAttribute("data-pivot"))!.split(",").map(Number),
  ).toEqual([selected.x, selected.y, selected.z]);
  const [x, y] = (await canvas.getAttribute("data-selected-position"))!
    .split(",")
    .map(Number);
  const bounds = await page.locator(".selection-panel").boundingBox();
  if (page.viewportSize()!.width > 700) {
    expect(x).toBeLessThan(bounds!.x - 20);
    expect(x).toBeGreaterThan(280);
  } else {
    const instrument = await page.locator(".instrument-explorer").boundingBox();
    expect(y).toBeGreaterThan(instrument!.y + instrument!.height);
    expect(y).toBeLessThan(bounds!.y);
    expect(bounds!.y - instrument!.y - instrument!.height).toBeGreaterThan(200);
  }
  return { id, x, y, positions };
}
try {
  const page = await browser.newPage({
    viewport: { width: 1512, height: 982 },
  });
  await setup(page);
  const canvas = page.locator("canvas");
  await choose(page, "Can Tutuğ");
  const first = await centered(page);
  await expect(canvas).not.toHaveAttribute("data-focused-nodes", "");
  await page.screenshot({ path: ".cache/focus-desktop.png" });
  const rotation = await canvas.getAttribute("data-rotation");
  await page.mouse.move(800, 550);
  await page.mouse.down();
  await page.mouse.move(920, 570, { steps: 8 });
  await page.mouse.up();
  const released = await canvas.getAttribute("data-rotation");
  await expect(canvas).not.toHaveAttribute("data-rotation", released!);
  await expect(canvas).not.toHaveAttribute("data-rotation", rotation!);
  await settled(page);
  const orbited = await centered(page);
  expect(orbited.x).toBeCloseTo(first.x, 3);
  expect(orbited.y).toBeCloseTo(first.y, 3);
  await page.mouse.wheel(0, -140);
  await settled(page);
  const zoomed = await centered(page);
  expect(zoomed.x).toBeCloseTo(first.x, 3);
  expect(zoomed.y).toBeCloseTo(first.y, 3);
  await canvas.focus();
  await page.keyboard.press("+");
  await settled(page);
  const keyed = await centered(page);
  expect(keyed.x).toBeCloseTo(first.x, 3);
  expect(keyed.y).toBeCloseTo(first.y, 3);
  await page.locator(".collaborators > button").first().click();
  await settled(page);
  expect((await centered(page)).id).not.toBe(first.id);
  // Click a projected collaborator directly, then verify the camera follows it.
  const current = await centered(page);
  const ids = new Set(
    (await canvas.getAttribute("data-focused-nodes"))!.split(",").map(Number),
  );
  const [yaw, pitch] = (await canvas.getAttribute("data-rotation"))!
    .split(",")
    .map(Number);
  const [zoom, panX, panY] = (await canvas.getAttribute("data-view"))!
    .split(",")
    .map(Number);
  const pivot = current.positions.find((p) => p.id === current.id)!;
  const radius = orbitRadius(sceneBounds(current.positions), pivot);
  const candidate = current.positions
    .filter((p) => ids.has(p.id) && p.id !== current.id)
    .map((p) => {
      const q = project3D(p, pivot, radius, yaw, pitch);
      return { id: p.id, x: q.x * zoom + panX, y: q.y * zoom + panY };
    })
    .find(
      (p) =>
        p.x > 300 &&
        p.x < 1100 &&
        p.y > 220 &&
        p.y < 700 &&
        Math.hypot(p.x - current.x, p.y - current.y) > 30,
    )!;
  expect(candidate).toBeDefined();
  await page.mouse.click(candidate.x, candidate.y);
  await settled(page);
  const clicked = await centered(page);
  expect(clicked.id).not.toBe(current.id);
  await page.reload();
  await expect(canvas).toHaveAttribute("data-layout", "ready", {
    timeout: 45000,
  });
  await settled(page);
  expect((await centered(page)).id).toBe(clicked.id);
  await page.keyboard.press("Escape");
  await settled(page);
  await expect(canvas).toHaveAttribute("data-focused-nodes", "");
  // Reduced motion and touch use the same focus target without camera easing.
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  await setup(mobile);
  await choose(mobile, "Can Tutuğ");
  const phone = await centered(mobile);
  const cdp = await mobile.context().newCDPSession(mobile);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 270, y: phone.y, id: 1 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 330, y: phone.y + 15, id: 1 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await settled(mobile);
  const rotatedPhone = await centered(mobile);
  expect(rotatedPhone.x).toBeCloseTo(phone.x, 3);
  expect(rotatedPhone.y).toBeCloseTo(phone.y, 3);
  await mobile.screenshot({ path: ".cache/focus-mobile.png" });
  expect(errors).toEqual([]);
  console.log(
    "Focus verified: search, graph clicks, collaborators, orbit anchor, wheel and keyboard zoom, URL restore, clear selection and touch.",
  );
} finally {
  await browser.close();
}
