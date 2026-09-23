import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import type { ProjectData } from "../src/runtime-data";

const base = process.env.ATLAS_TEST_URL || "http://localhost:18824";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Local server required");
const projects: ProjectData = await Bun.file(
  new URL("../public/data/projects.json", import.meta.url),
).json();
const ensemble =
  projects.ensembles.find((e) => e.name === "Can Tutuğ Trio") ??
  projects.ensembles.find((e) => e.name.includes("Trio"))!;
await mkdir(new URL("../.cache", import.meta.url), { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const errors: string[] = [];
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1512, height: 982 },
      reducedMotion: "reduce",
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base);
    await expect(page.locator("canvas")).toHaveAttribute(
      "data-layout",
      "ready",
      { timeout: 45000 },
    );
    const search = page.getByRole("combobox", {
      name: "Müzisyen veya grup ara",
    });
    await search.fill("can tutug");
    await page
      .getByRole("option")
      .filter({ hasText: /^Can TutuğDiğer$/ })
      .click();
    const portrait = page.getByRole("img", { name: "Can Tutuğ portresi" });
    await expect(portrait).toBeVisible();
    await expect
      .poll(() =>
        portrait.evaluate((img) => (img as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    await page.screenshot({
      path: `.cache/portrait-${mobile ? "mobile" : "desktop"}.png`,
    });
    // A failed image leaves initials, and a subsequent selection tries its own image.
    await page.route("**/OnderFocan_p.webp", (route) =>
      route.fulfill({ status: 404 }),
    );
    await search.fill("onder focan");
    await page.getByRole("option").first().click();
    await expect(page.locator(".selection-panel h2")).toHaveText("Önder Focan");
    await expect(page.locator(".musician-avatar img")).toHaveCount(0);
    await expect(page.locator(".musician-avatar")).toContainText("ÖF");
    await search.fill("can tutug");
    await search.press("Enter");
    await expect(portrait).toBeVisible();
    await search.fill(ensemble.name);
    await page.getByRole("button", { name: "Gruplar", exact: true }).click();
    await expect(page.getByRole("option").first()).toContainText(ensemble.name);
    await search.focus();
    await search.press("Enter");
    const panel = page.getByRole("region", {
      name: "Seçili grup",
      exact: true,
    });
    await expect(panel.locator("h2")).toHaveText(ensemble.name);
    await expect(panel.locator(".collaborators > button")).toHaveCount(
      Object.keys(ensemble.musicians).length,
    );
    expect(new URL(page.url()).searchParams.get("g")).toBe(ensemble.id);
    expect(new URL(page.url()).searchParams.has("m")).toBe(false);
    await expect(page.locator("canvas")).not.toHaveAttribute(
      "data-highlighted",
      "",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.cache/group-${mobile ? "mobile" : "desktop"}.png`,
    });
    await page.reload();
    await expect(panel.locator("h2")).toHaveText(ensemble.name);
    const first = panel.locator(".collaborators > button").first();
    const name = await first.locator("span").textContent();
    await first.click();
    await expect(page.locator(".selection-panel h2")).toHaveText(name!);
    expect(new URL(page.url()).searchParams.has("g")).toBe(false);
    await page
      .getByRole("button", { name: "Seçimi kaldır", exact: true })
      .click();
    await expect(page.locator(".selection-panel")).toHaveCount(0);
    await page.close();
  }
  const spatial = await browser.newPage({
    viewport: { width: 1512, height: 982 },
    reducedMotion: "reduce",
  });
  spatial.on("pageerror", (error) => errors.push(error.message));
  await spatial.goto(
    `${base}/?view=3d&min=500&g=${encodeURIComponent(ensemble.id)}`,
  );
  await expect(spatial.locator("canvas")).toHaveAttribute(
    "data-layout",
    "ready",
    { timeout: 45000 },
  );
  await spatial
    .getByRole("button", { name: "Tüm kadroyu haritada göster" })
    .click();
  await expect(spatial.locator("canvas")).toHaveAttribute(
    "data-layout",
    "ready",
    { timeout: 45000 },
  );
  await expect
    .poll(async () =>
      (await spatial.locator("canvas").getAttribute("data-highlighted"))
        ?.split(",")
        .sort(),
    )
    .toEqual(Object.keys(ensemble.musicians).sort());
  expect(new URL(spatial.url()).searchParams.get("min")).toBeNull();
  await spatial
    .getByRole("button", { name: "Seçimi kaldır", exact: true })
    .click();
  await expect(spatial.locator("canvas")).toHaveAttribute(
    "data-highlighted",
    "",
  );
  await spatial.close();
  const page = await browser.newPage();
  await page.route("**/data/projects.json", (route) =>
    route.fulfill({ status: 503 }),
  );
  await page.goto(`${base}/?min=all&g=${encodeURIComponent(ensemble.id)}`);
  const search = page.getByRole("combobox", { name: "Müzisyen veya grup ara" });
  await search.fill(ensemble.name);
  await page.getByRole("button", { name: "Gruplar", exact: true }).click();
  const retry = page.getByRole("button", {
    name: "Gruplar yüklenemedi. Tekrar dene",
    exact: true,
  });
  await expect(retry).toBeVisible();
  await page.unroute("**/data/projects.json");
  await retry.click();
  await expect(page.getByRole("option").first()).toContainText(ensemble.name);
  await search.fill("does not exist xyz");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Bu filtrelerde sonuç bulunamadı." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  console.log(
    "Verified desktop/mobile portraits, image failure recovery, group search, keyboard selection, roster navigation, graph highlights, URL restore, empty results and project retry.",
  );
} finally {
  await browser.close();
}
