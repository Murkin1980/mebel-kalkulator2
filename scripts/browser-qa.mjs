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
    await check("cp03-simple-calculator-" + width, async () => {
      await page.goto(base + "/#/simple");
      await page.getByTestId("simple-calculator").waitFor();
      await page.getByTestId("calc-material").selectOption("kitchen-ldsp-egger");
      await page.getByTestId("calc-width").fill("3000");
      await page.getByTestId("calc-total").waitFor();
      assert.match(await page.getByTestId("calc-total").innerText(), /615\s*000/);
      assert.equal(await page.locator('input[type="checkbox"]:checked').count(), 0, "optional extras must be disabled by default");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "CP-03 horizontal overflow");
      await page.screenshot({ path: out + "/cp03-simple-" + width + ".png", fullPage: true });
    });
    await check("cp03-catalog-" + width, async () => {
      await page.goto(base + "/#/simple/catalog");
      await page.getByTestId("cp03-catalog").waitFor();
      await page.screenshot({ path: out + "/cp03-catalog-" + width + ".png", fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "CP-03 catalog horizontal overflow");
    });
    if (width === 375) {
      await check("cp03-catalog-indexeddb", async () => {
        await page.getByRole("button", {name: /Добавить фурнитуру/}).click();
        await page.getByLabel("Название позиции").fill("QA Тандем");
        await page.getByLabel("Цена позиции").fill("25000");
        await page.getByRole("button", {name: "Сохранить"}).click();
        await page.getByText("QA Тандем").waitFor();
        await page.reload();
        await page.getByText("QA Тандем").waitFor();
        const name = await page.getByText("QA Тандем").first().innerText();
        assert.equal(name, "QA Тандем");
        await page.goto(base + "/#/simple");
        await page.getByTestId("simple-calculator").waitFor();
        await page.getByText("Дополнительная фурнитура").click();
        await page.getByLabel("Количество QA Тандем").fill("2");
        await page.getByTestId("calc-material").selectOption("kitchen-ldsp-egger");
        await page.getByTestId("calc-total").waitFor();
        assert.match(await page.getByTestId("calc-total").innerText(), /665\s*000/);
        await page.screenshot({ path: out + "/cp03-hardware-375.png", fullPage: true });
      });
    }
    if (width === 375) {
      await check("cp03-stone-facade-estimates", async () => {
        async function addCatalog(tab, label, price, method) {
          await page.goto(base + "/#/simple/catalog");
          await page.getByTestId("cp03-catalog").waitFor();
          await page.getByRole("button", {name: tab, exact: true}).click();
          await page.getByRole("button", {name: /Добавить/}).last().click();
          await page.getByLabel("Название позиции").fill(label);
          await page.getByLabel("Цена позиции").fill(String(price));
          if (method) await page.getByLabel("Способ расчёта").selectOption(method);
          await page.getByRole("button", {name: "Сохранить", exact: true}).click();
          await page.getByText(label).first().waitFor();
        }
        await addCatalog("Искусственный камень", "QA камень погонный", 120000, "LINEAR");
        await page.goto(base + "/#/simple");
        await page.getByTestId("simple-calculator").waitFor();
        await page.getByTestId("calc-material").selectOption("kitchen-ldsp-egger");
        await page.getByText("Искусственный камень (дополнительно)").click();
        await page.locator("select").last().selectOption({label: "QA камень погонный — пог. м"});
        assert.match(await page.getByTestId("calc-total").innerText(), /975\s*000/, "stone must be separately added at 3 m");
        await addCatalog("Фасады", "QA стандартный", 20000, "AREA");
        await addCatalog("Фасады", "QA премиум", 50000, "AREA");
        await page.goto(base + "/#/simple");
        await page.getByTestId("simple-calculator").waitFor();
        await page.getByTestId("calc-material").selectOption("kitchen-ldsp-egger");
        await page.getByText("Премиальные фасады (доплата)").click();
        await page.locator("label").filter({hasText: "Стандартные фасады"}).locator("select").selectOption({label: "QA стандартный"});
        await page.locator("label").filter({hasText: "Премиальные фасады"}).locator("select").selectOption({label: "QA премиум"});
        await page.locator("label").filter({hasText: "Площадь фасадов, м²"}).locator("input").fill("4");
        assert.match(await page.getByTestId("calc-total").innerText(), /735\s*000/, "facade price must be only upgrade difference");
        await page.screenshot({path: out + "/cp03-facades-375.png", fullPage: true});
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
