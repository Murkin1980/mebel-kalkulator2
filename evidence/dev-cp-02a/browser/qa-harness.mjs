/**
 * DEV-CP-02A — real-browser QA harness (Chromium via Playwright, real IndexedDB).
 *
 * Evidence tool only: not imported by the application and not part of the build.
 * Every check below runs against a real Chromium document, a real IndexedDB and
 * real mobile viewports (320 / 375 / 430 px). Screenshots and qa-report.json are
 * written next to this file.
 *
 * Usage (paths are environment-specific):
 *   BASE_URL=http://127.0.0.1:5000 \
 *   CHROMIUM_EXECUTABLE=/path/to/chromium \
 *   PLAYWRIGHT_CORE_PATH=/path/to/playwright-core/index.js \
 *   LD_LIBRARY_PATH=/path/to/chromium/libs \
 *   node qa-harness.mjs
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

const pw = await import(process.env.PLAYWRIGHT_CORE_PATH || "playwright-core");
const chromium = pw.chromium ?? pw.default.chromium;

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:5000";
const OUT_DIR = process.env.OUT_DIR || path.resolve("evidence/dev-cp-02a/browser");
const VIEWPORTS = (process.env.VIEWPORTS || "320,375,430").split(",").map((v) => Number(v.trim()));
const PROFILE_NAME = "Моя мастерская";
const EDITED_PRICE = "180000";
const RENAMED = "Моя мастерская QA";
const TARIFF_ID = "wardrobe-ldsp-russia";

await mkdir(OUT_DIR, { recursive: true });

const results = {
  startedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  browser: null,
  viewports: {},
  checks: [],
  dialogs: [],
  consoleErrors: [],
};

function record(check, ok, detail = null) {
  results.checks.push({ check, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${check}${detail ? ` :: ${JSON.stringify(detail).slice(0, 900)}` : ""}`);
}
function assert(condition, check, detail = null) {
  record(check, Boolean(condition), detail);
  return Boolean(condition);
}

// ── in-browser layout / accessibility audit ─────────────────────────────────
async function auditLayout(page) {
  const viewportWidth = page.viewportSize().width;
  return page.evaluate((vw) => {
    const doc = document.documentElement;
    const isVisible = (el) => {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const describe = (el) => {
      const testId = el.getAttribute("data-testid");
      const text = (el.innerText || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 50);
      return `${el.tagName.toLowerCase()}${testId ? `[${testId}]` : ""}${text ? ` "${text}"` : ""}`;
    };

    const overflowers = [];
    for (const el of document.querySelectorAll("body *")) {
      if (!isVisible(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right > vw + 1 || rect.left < -1) {
        overflowers.push({ element: describe(el), left: Math.round(rect.left), right: Math.round(rect.right) });
      }
    }

    const clippedFields = [];
    for (const el of document.querySelectorAll("input, select, textarea")) {
      if (!isVisible(el)) continue;
      // Visually hidden controls (e.g. the sr-only file input) are not clipped content.
      if (el.getBoundingClientRect().width <= 1 && el.getBoundingClientRect().height <= 1) continue;
      const rect = el.getBoundingClientRect();
      if (el.scrollWidth > el.clientWidth + 1) {
        clippedFields.push({ element: describe(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
      }
      if (rect.right > vw + 1 || rect.left < -1) {
        clippedFields.push({ element: describe(el), reason: "outside-viewport", left: Math.round(rect.left), right: Math.round(rect.right) });
      }
    }

    // Control labels must not be clipped by their own box (nowrap text).
    const clippedControls = [];
    for (const el of document.querySelectorAll("main button, main a[href]")) {
      if (!isVisible(el)) continue;
      if (el.scrollWidth > el.clientWidth + 1) {
        clippedControls.push({ element: describe(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
      }
    }

    const smallTargets = [];
    const informational = [];
    let interactiveCount = 0;
    for (const el of document.querySelectorAll("main button, main a[href], main input, main select, main textarea, main [role=checkbox]")) {
      if (!isVisible(el)) continue;
      if (el.disabled) continue;
      const rect = el.getBoundingClientRect();
      interactiveCount += 1;
      if (rect.width >= 44 && rect.height >= 44) continue;

      const info = {
        element: describe(el),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        testId: el.getAttribute("data-testid"),
      };
      const label = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
      if (label) {
        const labelRect = label.getBoundingClientRect();
        info.labelTarget = { width: Math.round(labelRect.width), height: Math.round(labelRect.height) };
        if (labelRect.height >= 44) {
          informational.push({ ...info, reason: "checkbox box is small; its <label> is the ≥44px touch target" });
          continue;
        }
      }
      if (el.closest("p")) {
        informational.push({ ...info, reason: "inline text link inside a paragraph (WCAG inline exception)" });
        continue;
      }
      if (el.tagName === "INPUT" && el.type === "file" && rect.width <= 1 && rect.height <= 1) {
        informational.push({ ...info, reason: "visually hidden file input; the Import button opens it" });
        continue;
      }
      smallTargets.push(info);
    }

    return {
      viewportWidth: vw,
      documentClientWidth: doc.clientWidth,
      documentScrollWidth: doc.scrollWidth,
      horizontalOverflowPx: doc.scrollWidth - doc.clientWidth,
      overflowersCount: overflowers.length,
      overflowers: overflowers.slice(0, 10),
      clippedFields,
      clippedControls,
      clippedControlsCount: clippedControls.length,
      interactiveCount,
      smallTargets,
      smallTargetsCount: smallTargets.length,
      informationalTargets: informational,
    };
  }, viewportWidth);
}

async function hitTestAll(page) {
  const problems = await page.evaluate(async () => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    const out = [];
    // A modal dialog makes the rest of the page inert, so scope the check to it.
    const dialog = document.querySelector('[role="dialog"]');
    const elements = Array.from(dialog ? dialog.querySelectorAll("button, a[href]") : document.querySelectorAll("main button, main a[href]"));
    for (const el of elements) {
      const rect0 = el.getBoundingClientRect();
      if (rect0.width === 0 || rect0.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      el.scrollIntoView({ block: "center", inline: "nearest" });
      await frame();
      // Keep the control clear of the sticky header before hit-testing.
      const headerHeight = (document.querySelector("header")?.getBoundingClientRect().height ?? 0) + 4;
      let rect = el.getBoundingClientRect();
      if (rect.top < headerHeight) {
        window.scrollBy(0, rect.top - headerHeight);
        await frame();
        rect = el.getBoundingClientRect();
      }
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      if (cy < 0 || cy > window.innerHeight) continue;
      const hit = document.elementFromPoint(cx, cy);
      const reachable = hit === el || el.contains(hit) || (hit && hit.contains(el));
      if (!reachable) {
        out.push({
          label: (el.innerText || el.getAttribute("aria-label") || el.getAttribute("data-testid") || el.tagName).trim().slice(0, 40),
          coveredBy: hit ? hit.tagName.toLowerCase() : null,
          coveredByTestId: hit ? hit.getAttribute("data-testid") : null,
          coveredByClass: hit ? String(hit.className).slice(0, 80) : null,
          rect: { top: Math.round(rect.top), bottom: Math.round(rect.bottom), left: Math.round(rect.left), right: Math.round(rect.right) },
        });
      }
    }
    return out;
  });
  return problems;
}

async function shot(page, name, options = {}) {
  const file = path.join(OUT_DIR, name);
  await page.screenshot({ path: file, animations: "disabled", ...options });
  return path.basename(file);
}

async function readIndexedDb(page, profileId) {
  return page.evaluate(async (id) => {
    const wrap = (request) =>
      new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("salamat-calc", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const stores = Array.from(db.objectStoreNames);
    const tx = db.transaction(["profiles", "meta"], "readonly");
    const profile = await wrap(tx.objectStore("profiles").get(id));
    const keys = await wrap(tx.objectStore("profiles").getAllKeys());
    const active = await wrap(tx.objectStore("meta").get("activeProfileId"));
    db.close();
    const databases = typeof indexedDB.databases === "function" ? await indexedDB.databases() : [];
    return { profile: profile ?? null, keys, active: active ?? null, stores, databases };
  }, profileId);
}

async function seedCorruptRecord(page) {
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("salamat-calc", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("profiles")) database.createObjectStore("profiles", { keyPath: "profileId" });
        if (!database.objectStoreNames.contains("meta")) database.createObjectStore("meta");
      };
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(["profiles"], "readwrite");
      tx.objectStore("profiles").put({ profileId: "corrupt-qa-record", name: "Повреждённая запись QA", schemaVersion: 1 });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
}

async function withDialogCapture(page, action, accept) {
  let dialogInfo = null;
  const handler = async (dialog) => {
    dialogInfo = { type: dialog.type(), message: dialog.message() };
    results.dialogs.push(dialogInfo);
    if (accept) await dialog.accept();
    else await dialog.dismiss();
  };
  page.once("dialog", handler);
  const outcome = await action();
  await page.waitForTimeout(400);
  page.off("dialog", handler);
  return { dialogInfo, outcome };
}

async function expectNoDialog(page, action) {
  let seen = null;
  const handler = async (dialog) => {
    seen = { type: dialog.type(), message: dialog.message() };
    results.dialogs.push({ unexpected: true, ...seen });
    await dialog.dismiss();
  };
  page.once("dialog", handler);
  await action();
  await page.waitForTimeout(400);
  page.off("dialog", handler);
  return seen;
}

async function runViewport(browser, width) {
  const context = await browser.newContext({
    viewport: { width, height: 740 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    acceptDownloads: true,
    locale: "ru-RU",
    timezoneId: "Asia/Almaty",
  });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return route.continue();
    // External font CDNs are unreachable here; aborting keeps screenshots deterministic.
    return route.abort();
  });

  const page = await context.newPage();
  page.on("pageerror", (error) => results.consoleErrors.push({ width, type: "pageerror", message: String(error) }));
  page.on("console", (message) => {
    if (message.type() === "error" && !/net::ERR|Failed to load resource|validateDOMNesting/i.test(message.text())) {
      results.consoleErrors.push({ width, type: "console", message: message.text().slice(0, 300) });
    }
  });

  const result = { viewport: { width, height: 740 }, steps: {}, audits: {}, screenshots: [] };
  const step = async (name, fn) => {
    try {
      result.steps[name] = { ok: true, value: await fn() };
      return result.steps[name].value;
    } catch (error) {
      const message = String(error && error.message ? error.message : error);
      result.steps[name] = { ok: false, error: message };
      record(`${width}px ${name}`, false, message.slice(0, 300));
      return null;
    }
  };
  const check = (ok, name, detail) => assert(ok, `${width}px ${name}`, detail);

  // 1 — profiles list on a fresh IndexedDB
  await step("profiles-load", async () => {
    await page.goto(`${BASE_URL}/#/tariffs`, { waitUntil: "load", timeout: 60000 });
    await page.waitForSelector('[data-testid="profiles-page"]', { timeout: 30000 });
    await page.waitForTimeout(300);
  });
  result.audits.profiles = await auditLayout(page);
  check(result.audits.profiles.horizontalOverflowPx <= 0, "profiles: no horizontal scroll", result.audits.profiles);
  check(result.audits.profiles.smallTargetsCount === 0, "profiles: no undersized controls", result.audits.profiles.smallTargets);
  check(result.audits.profiles.clippedControlsCount === 0, "profiles: no clipped button labels", result.audits.profiles.clippedControls);
  check(await page.locator('[data-testid="template-profile"]').isVisible(), "template profile visible");
  check(await page.locator('[data-testid="profiles-empty"]').isVisible(), "empty state on fresh IndexedDB");
  result.screenshots.push(await shot(page, `${width}-01-profiles.png`, { fullPage: true }));

  // 2 — create dialog
  await step("open-create-dialog", async () => {
    await page.locator('[data-testid="create-profile"]').click();
    await page.waitForSelector('[data-testid="new-profile-name"]', { timeout: 10000 });
  });
  result.audits.createDialog = await auditLayout(page);
  check(result.audits.createDialog.horizontalOverflowPx <= 0, "create dialog: no horizontal scroll", result.audits.createDialog);
  const dialogHitProblems = await hitTestAll(page);
  check(dialogHitProblems.length === 0, "create dialog: every button is tappable", dialogHitProblems);
  result.screenshots.push(await shot(page, `${width}-02-create-dialog.png`));

  await step("create-profile", async () => {
    await page.locator('[data-testid="new-profile-name"]').fill(PROFILE_NAME);
    await page.locator('[data-testid="confirm-create"]').click();
    await page.waitForSelector('[data-testid="tariff-editor"]', { timeout: 20000 });
    await page.waitForTimeout(400);
  });
  const profileId = decodeURIComponent(page.url().split("/tariffs/")[1] || "");
  result.profileId = profileId;
  check(profileId.startsWith("user-"), "profile created with a user id", profileId);
  const createdKeys = (await readIndexedDb(page, profileId)).keys;
  check(createdKeys.includes(profileId), "created profile is really in IndexedDB", createdKeys);

  result.audits.editor = await auditLayout(page);
  check(result.audits.editor.horizontalOverflowPx <= 0, "editor: no horizontal scroll", result.audits.editor);
  check(result.audits.editor.smallTargetsCount === 0, "editor: no undersized controls", result.audits.editor.smallTargets);
  check(result.audits.editor.clippedControlsCount === 0, "editor: no clipped button labels", result.audits.editor.clippedControls);
  result.screenshots.push(await shot(page, `${width}-03-editor-top.png`));

  // 3 — edit a placeholder tariff
  await step("edit-tariff", async () => {
    const toggle = page.locator(`[data-testid="toggle-tariff-${TARIFF_ID}"]`);
    await toggle.scrollIntoViewIfNeeded();
    await toggle.click();
    const price = page.locator(`[data-testid="tariff-${TARIFF_ID}-price"]`);
    await price.waitFor({ timeout: 10000 });
    await price.scrollIntoViewIfNeeded();
    await price.fill("-5");
    await page.waitForSelector(`#tariff-${TARIFF_ID}-price-error`, { timeout: 5000 });
  });
  check(await page.locator(`#tariff-${TARIFF_ID}-price-error`).isVisible(), "negative price rejected with an inline message");

  await step("fill-tariff", async () => {
    const price = page.locator(`[data-testid="tariff-${TARIFF_ID}-price"]`);
    await price.fill(EDITED_PRICE);
    await page.locator(`[data-testid="tariff-${TARIFF_ID}-confirmed"]`).click();
  });
  // The checkbox box is 16px; its <label> must be the ≥44px touch target.
  const confirmTarget = await page.evaluate((tariffId) => {
    const box = document.querySelector(`[data-testid="tariff-${tariffId}-confirmed"]`);
    const label = document.querySelector(`label[for="${box.id}"]`);
    const rect = label.getBoundingClientRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height) };
  }, TARIFF_ID);
  check(confirmTarget.height >= 44, "confirmation checkbox is operated through a ≥44px label", confirmTarget);

  result.audits.editorOpen = await auditLayout(page);
  check(result.audits.editorOpen.horizontalOverflowPx <= 0, "editor with open tariff: no horizontal scroll", result.audits.editorOpen);
  check(result.audits.editorOpen.smallTargetsCount === 0, "editor with open tariff: no undersized controls", result.audits.editorOpen.smallTargets);
  check(result.audits.editorOpen.clippedControlsCount === 0, "editor with open tariff: no clipped button labels", result.audits.editorOpen.clippedControls);
  check(await page.locator('[data-testid="dirty-indicator"]').isVisible(), "dirty indicator after edit");
  result.screenshots.push(await shot(page, `${width}-04-editor-tariff-open.png`, { fullPage: true }));

  // 4 — save and inspect the real IndexedDB record
  await step("save-profile", async () => {
    await page.locator('[data-testid="save-profile"]').click();
    await page.waitForSelector('[data-testid="saved-indicator"]', { timeout: 15000 });
  });
  result.screenshots.push(await shot(page, `${width}-05-editor-saved.png`));
  const stored = await readIndexedDb(page, profileId);
  result.indexedDb = { keys: stored.keys, stores: stored.stores, databases: stored.databases, version: stored.profile?.version };
  const storedTariff = stored.profile?.tariffs?.find((item) => item.tariffId === TARIFF_ID);
  check(stored.profile?.version === 2, "saved profile version incremented", stored.profile?.version);
  check(storedTariff?.priceKzt === Number(EDITED_PRICE), "edited price persisted in IndexedDB", storedTariff?.priceKzt);
  check(storedTariff?.isConfirmed === true, "confirmation persisted in IndexedDB");
  check(JSON.stringify(stored.databases).includes("salamat-calc"), "real IndexedDB database present", stored.databases);
  check(stored.stores.includes("profiles") && stored.stores.includes("meta"), "IndexedDB object stores", stored.stores);

  // 5 — reload and reopen
  await step("reload-reopen", async () => {
    await page.reload({ waitUntil: "load", timeout: 60000 });
    await page.waitForSelector('[data-testid="tariff-editor"]', { timeout: 30000 });
    await page.locator(`[data-testid="toggle-tariff-${TARIFF_ID}"]`).click();
    const value = await page.locator(`[data-testid="tariff-${TARIFF_ID}-price"]`).inputValue();
    if (value !== EDITED_PRICE) throw new Error(`price after reload = ${value}`);
    const state = await page.locator(`[data-testid="tariff-${TARIFF_ID}-confirmed"]`).getAttribute("data-state");
    if (state !== "checked") throw new Error(`confirmed after reload = ${state}`);
  });
  check((await page.locator('[data-testid="tariff-editor"]').count()) === 1, "editor reopened after a real page reload");
  result.screenshots.push(await shot(page, `${width}-06-editor-reopened.png`, { fullPage: true }));

  await step("reopen-from-list", async () => {
    await page.locator('[data-testid="back-to-profiles"]').click();
    await page.waitForSelector('[data-testid="profiles-page"]', { timeout: 20000 });
    await page.locator(`[data-testid="edit-${profileId}"]`).click();
    await page.waitForSelector('[data-testid="tariff-editor"]', { timeout: 20000 });
    await page.locator(`[data-testid="toggle-tariff-${TARIFF_ID}"]`).click();
    const value = await page.locator(`[data-testid="tariff-${TARIFF_ID}-price"]`).inputValue();
    if (value !== EDITED_PRICE) throw new Error(`price after list reopen = ${value}`);
  });
  result.screenshots.push(await shot(page, `${width}-07-reopened-from-list.png`));

  // 6 — unsaved changes: beforeunload + Browser Back/Forward
  await step("dirty-draft", async () => {
    await page.locator('[data-testid="profile-name"]').fill(RENAMED);
    await page.waitForSelector('[data-testid="dirty-indicator"]', { timeout: 10000 });
    await page.waitForTimeout(200);
  });
  result.screenshots.push(await shot(page, `${width}-08-dirty-draft.png`));

  const beforeUnload = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return { defaultPrevented: event.defaultPrevented, returnValue: event.returnValue };
  });
  check(beforeUnload.defaultPrevented === true, "beforeunload handler prevents unload with a dirty draft", beforeUnload);

  const reloadAttempt = await step("native-beforeunload-dialog", async () => {
    const { dialogInfo } = await withDialogCapture(page, () => page.reload({ waitUntil: "load", timeout: 20000 }).catch((error) => String(error).slice(0, 120)), false);
    await page.waitForTimeout(400);
    return {
      dialogInfo,
      stillOnEditor: await page.locator('[data-testid="tariff-editor"]').isVisible(),
      stillDirty: await page.locator('[data-testid="dirty-indicator"]').isVisible(),
    };
  });
  if (reloadAttempt) {
    check(reloadAttempt.dialogInfo?.type === "beforeunload", "native beforeunload dialog shown on reload", reloadAttempt.dialogInfo);
    check(reloadAttempt.stillOnEditor && reloadAttempt.stillDirty, "dismissing the beforeunload dialog keeps the dirty draft");
  }
  result.screenshots.push(await shot(page, `${width}-09-beforeunload-stay.png`));

  const backStay = await step("browser-back-stay", async () => {
    const { dialogInfo } = await withDialogCapture(page, () => page.goBack({ waitUntil: "load", timeout: 20000 }).catch((error) => String(error).slice(0, 120)), false);
    await page.waitForTimeout(700);
    return {
      dialogInfo,
      url: page.url(),
      editorVisible: await page.locator('[data-testid="tariff-editor"]').isVisible(),
      name: await page.locator('[data-testid="profile-name"]').inputValue().catch(() => null),
      dirty: await page.locator('[data-testid="dirty-indicator"]').isVisible(),
    };
  });
  if (backStay) {
    check(backStay.dialogInfo?.type === "confirm", "Browser Back asks before discarding a dirty draft", backStay.dialogInfo);
    check(/несохран[её]н/i.test(backStay.dialogInfo?.message ?? ""), "confirmation text mentions unsaved changes", backStay.dialogInfo?.message);
    check(backStay.editorVisible && backStay.url.includes(profileId), "declining Back keeps the editor mounted", backStay.url);
    check(backStay.dirty && backStay.name === RENAMED, "declining Back keeps the unsaved draft", { name: backStay.name });
  }
  result.screenshots.push(await shot(page, `${width}-10-back-stay.png`));

  const backLeave = await step("browser-back-leave", async () => {
    const { dialogInfo } = await withDialogCapture(page, () => page.goBack({ waitUntil: "load", timeout: 20000 }).catch((error) => String(error).slice(0, 120)), true);
    await page.waitForSelector('[data-testid="profiles-page"]', { timeout: 20000 });
    return { dialogInfo, url: page.url() };
  });
  if (backLeave) {
    check(backLeave.dialogInfo?.type === "confirm", "accepting Back asks exactly once", backLeave.dialogInfo);
    check(backLeave.url.includes("/tariffs") && !backLeave.url.includes(profileId), "accepted Back leaves the editor", backLeave.url);
  }
  result.screenshots.push(await shot(page, `${width}-11-back-discarded.png`));

  const forwardState = await step("browser-forward", async () => {
    await page.goForward({ waitUntil: "load", timeout: 20000 });
    await page.waitForSelector('[data-testid="tariff-editor"]', { timeout: 20000 });
    await page.waitForTimeout(600);
    return { url: page.url(), name: await page.locator('[data-testid="profile-name"]').inputValue(), dirty: await page.locator('[data-testid="dirty-indicator"]').isVisible() };
  });
  if (forwardState) {
    check(forwardState.url.includes(profileId), "Forward returns to the editor route", forwardState.url);
    check(forwardState.name === PROFILE_NAME, "Forward shows the saved profile, not the discarded draft", forwardState.name);
    check(forwardState.dirty === false, "Forward leaves no dirty state behind");
  }
  result.screenshots.push(await shot(page, `${width}-12-forward.png`));

  // 7 — clean Back must not ask
  const cleanBackDialog = await step("clean-back", async () => {
    await page.locator('[data-testid="back-to-profiles"]').click();
    await page.waitForSelector('[data-testid="profiles-page"]', { timeout: 20000 });
    const dialog = await expectNoDialog(page, () => page.goBack({ waitUntil: "load", timeout: 20000 }).catch(() => null));
    await page.waitForTimeout(400);
    return { dialog, url: page.url() };
  });
  if (cleanBackDialog) check(cleanBackDialog.dialog === null, "clean editor navigates without a confirmation", cleanBackDialog.dialog);

  // 8 — corrupted record: warning + real local export
  await step("seed-corrupt-record", async () => {
    await seedCorruptRecord(page);
    await page.goto(`${BASE_URL}/#/tariffs`, { waitUntil: "load", timeout: 60000 });
    await page.reload({ waitUntil: "load", timeout: 60000 });
    await page.waitForSelector('[data-testid="rejected-profiles-warning"]', { timeout: 30000 });
  });
  result.audits.rejected = await auditLayout(page);
  check(result.audits.rejected.horizontalOverflowPx <= 0, "rejected-record warning: no horizontal scroll", result.audits.rejected);
  check(result.audits.rejected.smallTargetsCount === 0, "rejected-record warning: no undersized controls", result.audits.rejected.smallTargets);
  check(result.audits.rejected.clippedControlsCount === 0, "rejected-record warning: no clipped button labels", result.audits.rejected.clippedControls);
  result.screenshots.push(await shot(page, `${width}-13-rejected-warning.png`, { fullPage: true }));

  const exportResult = await step("export-rejected-records", async () => {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 20000 }),
      page.locator('[data-testid="export-rejected-profiles"]').click(),
    ]);
    const target = path.join(OUT_DIR, `${width}-rejected-export.json`);
    await download.saveAs(target);
    const content = JSON.parse(await readFile(target, "utf8"));
    const after = await readIndexedDb(page, profileId);
    return {
      fileName: download.suggestedFilename(),
      format: content.format,
      keys: content.records?.map((item) => item.key),
      reason: content.records?.[0]?.reason,
      rawHasRecord: JSON.stringify(content.records?.[0]?.raw ?? {}).includes("corrupt-qa-record"),
      keysAfterExport: after.keys,
    };
  });
  if (exportResult) {
    check(exportResult.keys?.includes("corrupt-qa-record"), "damaged record key is exported", exportResult.keys);
    check(exportResult.rawHasRecord, "raw damaged payload is exported for recovery");
    check(exportResult.keysAfterExport?.includes("corrupt-qa-record"), "export does not delete the damaged record", exportResult.keysAfterExport);
    check(exportResult.keysAfterExport?.includes(profileId), "export keeps valid profiles intact");
    check(await page.locator(`[data-testid="profile-${profileId}"]`).isVisible(), "valid profile is still listed next to the damaged one");
  }
  result.screenshots.push(await shot(page, `${width}-14-rejected-exported.png`, { fullPage: true }));

  // 9 — read-only template editor
  await step("template-editor", async () => {
    await page.locator('[data-testid="open-template"]').click();
    await page.waitForSelector('[data-testid="template-banner"]', { timeout: 20000 });
    await page.waitForTimeout(300);
  });
  const templateAudit = await auditLayout(page);
  result.audits.template = templateAudit;
  check(templateAudit.horizontalOverflowPx <= 0, "template editor: no horizontal scroll", templateAudit);
  check(templateAudit.clippedControlsCount === 0, "template editor: no clipped button labels", templateAudit.clippedControls);
  check(await page.locator('[data-testid="profile-name"]').isDisabled(), "template profile fields are read-only");
  check((await page.locator('[data-testid="save-profile"]').count()) === 0, "template has no save button");
  result.screenshots.push(await shot(page, `${width}-15-template-readonly.png`, { fullPage: true }));

  // 10 — own editor: preview block, fixed save bar, tappability
  await step("preview-block", async () => {
    await page.goto(`${BASE_URL}/#/tariffs`, { waitUntil: "load", timeout: 60000 });
    await page.waitForSelector(`[data-testid="profile-${profileId}"]`, { timeout: 20000 });
    await page.locator(`[data-testid="edit-${profileId}"]`).click();
    await page.waitForSelector('[data-testid="tariff-preview"]', { timeout: 20000 });
    await page.locator('[data-testid="tariff-preview"]').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(400);
  });
  const barCheck = await page.evaluate(() => {
    const preview = document.querySelector('[data-testid="tariff-preview"]');
    const save = document.querySelector('[data-testid="save-profile"]');
    const bar = save ? save.closest(".fixed") : null;
    if (!preview || !bar) return { error: "preview or save bar missing" };
    const previewRect = preview.getBoundingClientRect();
    const barRect = bar.getBoundingClientRect();
    return {
      previewBottom: Math.round(previewRect.bottom),
      barTop: Math.round(barRect.top),
      barHeight: Math.round(barRect.height),
      barInsideViewport: barRect.left >= 0 && barRect.right <= window.innerWidth + 1,
      covered: previewRect.bottom > barRect.top + 1,
    };
  });
  result.fixedBar = barCheck;
  check(!barCheck.error && barCheck.barInsideViewport === true, "save bar stays inside the viewport", barCheck);
  check(!barCheck.error && barCheck.covered === false, "save bar does not cover the preview content", barCheck);
  const previewAudit = await auditLayout(page);
  result.audits.preview = previewAudit;
  check(previewAudit.horizontalOverflowPx <= 0, "editor preview: no horizontal scroll", previewAudit);
  check(previewAudit.smallTargetsCount === 0, "editor preview: no undersized controls", previewAudit.smallTargets);
  check(previewAudit.clippedControlsCount === 0, "editor preview: no clipped button labels", previewAudit.clippedControls);
  const hitProblems = await hitTestAll(page);
  result.hitTestProblems = hitProblems;
  check(hitProblems.length === 0, "every visible button/link is hit-testable", hitProblems);
  result.screenshots.push(await shot(page, `${width}-16-preview.png`, { fullPage: true }));

  await context.close();
  return result;
}

// ── run ─────────────────────────────────────────────────────────────────────
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--font-render-hinting=none"],
  env: process.env.LD_LIBRARY_PATH ? { ...process.env } : undefined,
  timeout: 60000,
});
results.browser = { version: browser.version(), userAgent: await browser.newPage().then((p) => p.evaluate(() => navigator.userAgent).finally(() => p.close())) };

for (const width of VIEWPORTS) {
  try {
    results.viewports[`${width}px`] = await runViewport(browser, width);
  } catch (error) {
    results.viewports[`${width}px`] = { fatal: String(error && error.stack ? error.stack : error) };
    record(`${width}px scenario`, false, String(error && error.message ? error.message : error));
  }
}

results.finishedAt = new Date().toISOString();
results.summary = {
  total: results.checks.length,
  passed: results.checks.filter((item) => item.ok).length,
  failed: results.checks.filter((item) => !item.ok).length,
};

await writeFile(path.join(OUT_DIR, "qa-report.json"), JSON.stringify(results, null, 2));
await writeFile(
  path.join(OUT_DIR, "dialogs.json"),
  JSON.stringify({ note: "Native browser dialogs cannot be screenshotted; texts captured through Playwright dialog events.", dialogs: results.dialogs }, null, 2),
);
console.log(`\nSUMMARY: ${results.summary.passed}/${results.summary.total} passed, ${results.summary.failed} failed`);
await browser.close();
if (results.summary.failed > 0) process.exitCode = 1;
