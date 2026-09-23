import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
const base = process.env.ATLAS_TEST_URL || "http://localhost:18884";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Use a local server");
await mkdir(new URL("../.cache", import.meta.url), { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1512, height: 982 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const canvas = page.locator("canvas");
const detail = page.getByRole("group", { name: "Gruplama" });
const level = (name: string) => detail.getByRole("button", { name });
const levels = { "0.8": "Geniş", "3": "Ayrıntılı", "1.5": "Dengeli" } as const;
const ready = () =>
  expect(canvas).toHaveAttribute("data-layout", "ready", { timeout: 60000 });
try {
  await page.goto(base);
  await ready();
  await page.getByRole("button", { name: "Görünüm", exact: true }).click();
  const visibleEdges = await canvas.getAttribute("data-visible-edges");
  await page.screenshot({ path: ".cache/communities-balanced.png" });
  for (const value of ["0.8", "3", "1.5"] as const) {
    await level(levels[value]).click();
    await ready();
    await expect(canvas).toHaveAttribute("data-visible-edges", visibleEdges!);
    await page.screenshot({ path: `.cache/communities-${value}.png` });
  }
  await level("Ayrıntılı").click();
  await ready();
  await expect(page).toHaveURL(/resolution=3/);
  await page.reload();
  await ready();
  await page.getByRole("button", { name: "Görünüm", exact: true }).click();
  await expect(level("Ayrıntılı")).toHaveAttribute("aria-pressed", "true");
  // 3D has no community detail; returning to 2D restores it.
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await ready();
  await expect(detail).toHaveCount(0);
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await ready();
  await expect(level("Ayrıntılı")).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(detail).toBeVisible();
  await level("Dengeli").click();
  await ready();
  await page.screenshot({ path: ".cache/communities-mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${base}?min=all`);
  await ready();
  await page.screenshot({ path: ".cache/communities-all.png" });
  await page.goto(`${base}?resolution=NaN`);
  await ready();
  await page.getByRole("button", { name: "Görünüm", exact: true }).click();
  await expect(level("Dengeli")).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
  console.log(
    "Communities verified: all detail levels, unchanged visible ties, URL reload, 3D round trip, mobile, full archive, invalid URL recovery.",
  );
} finally {
  await browser.close();
}
