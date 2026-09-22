import { chromium, expect } from "@playwright/test";

const base = process.env.ATLAS_TEST_URL || "http://localhost:18861";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Local server required");
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
    // Exercise selection without depending on remote portrait availability.
    await page.route("https://bizimcaz.com/**", (route) => route.abort());
    await page.goto(base);
    await expect(page.locator("canvas")).toHaveAttribute(
      "data-layout",
      "ready",
      {
        timeout: 45000,
      },
    );
    const search = page.getByRole("combobox", {
      name: "Müzisyen veya grup ara",
    });
    await search.fill("onder focan");
    await search.press("Enter");
    await expect(page.locator(".selection-panel h2")).toHaveText("Önder Focan");

    // Clicking the still-focused input must reopen results after a selection.
    await search.click();
    await expect(search).toHaveAttribute("aria-expanded", "true");
    await search.press("Escape");
    await expect(search).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".selection-panel h2")).toHaveText("Önder Focan");

    // A second Escape reaches the selection rather than being swallowed forever.
    await search.press("Escape");
    await expect(page.locator(".selection-panel")).toHaveCount(0);
    await search.press("Control+k");
    await expect(search).toHaveAttribute("aria-expanded", "true");

    // Opening a closed list starts at its boundary, with no skipped result.
    await search.fill("can");
    await search.press("Escape");
    await search.press("ArrowDown");
    await expect(
      page.getByRole("listbox").getByRole("option").first(),
    ).toHaveAttribute("aria-selected", "true");
    await search.press("Escape");
    await search.press("ArrowUp");
    await expect(
      page.getByRole("listbox").getByRole("option").last(),
    ).toHaveAttribute("aria-selected", "true");
    await search.press("Escape");
    await page.getByRole("button", { name: "Aramayı temizle" }).click();
    await expect(search).toHaveValue("");
    await expect(search).toHaveAttribute("aria-expanded", "true");

    // Enter while composing text must not select a musician.
    await search.fill("onder focan");
    await search.dispatchEvent("keydown", { key: "Enter", isComposing: true });
    await expect(search).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".selection-panel")).toHaveCount(0);
    await search.press("Escape");

    // The global shortcut works even when mobile settings make the header inert.
    for (const name of ["Filtreler", "Görünüm"]) {
      await page.getByRole("button", { name, exact: true }).click();
      await page.keyboard.press(mobile ? "Control+k" : "Meta+k");
      await expect(page.locator("#filters, #view-settings")).toHaveCount(0);
      await expect(search).toBeFocused();
      await expect(search).toHaveAttribute("aria-expanded", "true");
      await search.press("Escape");
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.close();
  }
  expect(errors).toEqual([]);
  console.log(
    "Verified desktop/mobile search reopening, Escape, arrow navigation, clearing, IME input and settings-to-search focus.",
  );
} finally {
  await browser.close();
}
