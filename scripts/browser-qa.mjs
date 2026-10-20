import { chromium } from "playwright";
import fs from "node:fs/promises";
import assert from "node:assert/strict";

const base = process.env.QA_BASE_URL || "http://127.0.0.1:5000";
const out = "evidence/dev-cp-02a/browser";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const findings = [];
const check = async (label, fn) => {
  try { await fn(); findings.push({ label, result: "PASS" }); }
  catch (error) { findings.push({ label, result: "FAIL", error: String(error) }); }
};
try {
  for (const width of [320, 375, 430]) {
    const context = await browser.newContext({ viewport: { width, height: 850 }, acceptDownloads: true });
    const page = await context.newPage();
    await check("profiles-" + width, async () => {
      await page.goto(base + "/#/tariffs");
      await page.getByTestId("profiles-page").waitFor();
      await page.screenshot({ path: out + "/profiles-" + width + ".png", fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(overflow, false, "horizontal overflow");
    });
    await check("editor-" + width, async () => {
      await page.getByTestId("copy-template").click();
      await page.getByTestId("profiles-page").waitFor();
      const edit = page.locator('[data-testid^="edit-user-"]').first();
      await edit.click();
      await page.getByTestId("tariff-editor").waitFor();
      await page.screenshot({ path: out + "/editor-" + width + ".png", fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "horizontal overflow");
    });
    if (width === 375) {
      await check("indexeddb-persistence", async () => {
        await page.getByTestId("profile-name").fill("QA persistent profile");
        await page.getByTestId("save-profile").click();
        await page.getByTestId("saved-indicator").waitFor();
        await page.reload();
        await page.getByTestId("profile-name").waitFor();
        assert.equal(await page.getByTestId("profile-name").inputValue(), "QA persistent profile");
        const db = await page.evaluate(async () => {
          const request = indexedDB.open("salamat-calc");
          return await new Promise((resolve, reject) => {
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const d = request.result;
              const names = Array.from(d.objectStoreNames);
              d.close();
              resolve(names);
            };
          });
        });
        assert.ok(db.includes("profiles") && db.includes("meta"));
      });
      await check("unsaved-navigation", async () => {
        await page.getByTestId("profile-name").fill("UNSAVED QA");
        page.once("dialog", async dialog => { assert.equal(dialog.type(), "confirm"); await dialog.dismiss(); });
        await page.getByTestId("back-to-profiles").click();
        await page.getByTestId("tariff-editor").waitFor();
        assert.equal(await page.getByTestId("profile-name").inputValue(), "UNSAVED QA");
        page.once("dialog", async dialog => { await dialog.accept(); });
        await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
        // Navigation must not silently keep a damaged draft; run is recorded with screenshot.
        await page.screenshot({ path: out + "/navigation-375.png" });
      });
    }
    await context.close();
  }
} finally {
  await browser.close();
  await fs.writeFile(out + "/results.json", JSON.stringify(findings, null, 2));
}
console.log(findings);
if (findings.some(item => item.result === "FAIL")) process.exitCode = 1;
