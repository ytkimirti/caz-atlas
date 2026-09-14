import { chromium, expect } from "@playwright/test";
const base = process.env.ATLAS_TEST_URL || "http://localhost:18830";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("UI checks must target a local development server.");
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({
  viewport: { width: 1512, height: 982 },
  deviceScaleFactor: 1,
  reducedMotion: "reduce",
});
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(base);
  await expect(page.locator(".network-canvas")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".footer-note")).toContainText(
    "Arşiv taraması tamamlandı",
  );
  await page.screenshot({ path: ".cache/desktop.png" });
  const search = page.getByRole("combobox", { name: "Bir müzisyen ara..." });
  await search.fill("asude sasmaz");
  await page.getByRole("option").first().click();
  await expect(page.locator(".musician-panel h2")).toHaveText("Asude Şaşmaz");
  await expect(page.locator(".collaborator")).not.toHaveCount(0);
  await expect(page).toHaveURL(/m=AsudeSasmaz/);
  await page.screenshot({ path: ".cache/musician.png" });
  await page.getByRole("button", { name: "Müzisyen kartını kapat" }).click();
  await page.getByRole("button", { name: "Enstrüman adaları" }).click();
  await expect(page).toHaveURL(/mode=islands/);
  await page.waitForTimeout(250);
  await page.screenshot({ path: ".cache/islands.png" });
  await page.getByRole("button", { name: "Plak koleksiyonu" }).click();
  await expect(page).toHaveURL(/mode=record/);
  await page.reload();
  await expect(page.locator(".network-canvas")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Plak koleksiyonu" }),
  ).toHaveClass(/mode-active/);
  await page.getByRole("button", { name: "Aramızda kaç nota?" }).click();
  await page
    .getByRole("combobox", { name: "Başlangıç müzisyeni" })
    .fill("Asude Sasmaz");
  await page.getByRole("option").first().click();
  await page
    .getByRole("combobox", { name: "Varış müzisyeni" })
    .fill("Onder Focan");
  await page.getByRole("option").first().click();
  await expect(page.locator(".path-result")).toContainText(
    "bağlantıyla buluştular",
  );
  await expect(page.locator(".path-stops button")).not.toHaveCount(0);
  await page.screenshot({ path: ".cache/path.png" });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Grafı PNG olarak indir" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("caz-atlasi.png");
  await download.saveAs(".cache/export.png");
  await page.getByRole("button", { name: /Müzisyenler/ }).click();
  await page
    .getByRole("textbox", { name: "Arşivde ara", exact: true })
    .fill("Miles Davis");
  await expect(page.locator(".archive-card")).toHaveCount(1);
  await page.locator(".archive-card").click();
  await expect(page.locator(".musician-panel h2")).toHaveText("Miles Davis");
  await page.getByRole("button", { name: "Müzisyen kartını kapat" }).click();
  await page.getByRole("button", { name: "Veri & yöntem" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(
    "Taranmayı bekleyen kayıt yok.",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Jam session başlat" }).click();
  await expect(
    page.getByRole("button", { name: "Jam session durdur" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Jam session durdur" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Caz atlası ana görünüm" }).click();
  await page.waitForTimeout(250);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: ".cache/mobile.png", fullPage: true });
  await search.fill("asude sasmaz");
  await page.getByRole("option").first().click();
  await expect(page.locator(".musician-panel h2")).toHaveText("Asude Şaşmaz");
  await page.screenshot({ path: ".cache/mobile-selected.png", fullPage: true });
  expect(errors).toEqual([]);
  console.log(
    "UI verified: full dataset, Turkish search, musician connections, modes, reloaded state, shortest path, PNG download, archive search, modal keyboard dismissal, jam control, mobile layout, zero runtime errors.",
  );
} finally {
  await browser.close();
}
