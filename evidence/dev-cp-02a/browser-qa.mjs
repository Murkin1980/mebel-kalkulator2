/**
 * DEV-CP-02A real-browser QA harness.
 * Drives real Chromium 153 (@sparticuz/chromium binary) via playwright-core
 * against the locally running app. Writes real PNG screenshots + a summary.
 */
import chromium from '@sparticuz/chromium';
import { chromium as pw } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const BASE = process.env.QA_BASE || 'http://127.0.0.1:5000';
const OUT = '/home/user/mebel-kalkulator2/evidence/dev-cp-02a/browser';
const SUMMARY_JSON = '/home/user/qa-browser/qa-summary.json';
const SUMMARY_MD = '/home/user/qa-browser/qa-summary.md';
const WIDTHS = [320, 375, 430];

fs.mkdirSync(OUT, { recursive: true });

const results = [];
const screenshots = [];
const dialogs = [];

function record(id, name, width, status, detail = '') {
  results.push({ id, name, width, status, detail });
  console.log(`[${status}] ${id} | ${name}${width ? ` @${width}px` : ''}${detail ? ` — ${detail}` : ''}`);
}

function check(cond, id, name, width, detailOk = '', detailFail = '') {
  if (cond) record(id, name, width, 'PASS', detailOk);
  else record(id, name, width, 'FAIL', detailFail || detailOk);
  return Boolean(cond);
}

function step(label) {
  console.log(`\n### STEP: ${label} (${new Date().toISOString()})`);
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`TIMEOUT after ${ms}ms: ${label}`)), ms);
    }),
  ]);
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await withTimeout(page.screenshot({ path: file, fullPage: true }), 20000, `screenshot ${name}`);
  screenshots.push(path.relative('/home/user/mebel-kalkulator2', file));
  console.log(`  screenshot: ${name}.png`);
}

async function shotViewport(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await withTimeout(page.screenshot({ path: file, fullPage: false }), 20000, `screenshot ${name}`);
  screenshots.push(path.relative('/home/user/mebel-kalkulator2', file));
  console.log(`  screenshot (viewport): ${name}.png`);
}

async function layoutAudit(page, width, label) {
  const audit = await withTimeout(
    page.evaluate(() => {
      const vw = window.innerWidth;
      const overflowX = document.documentElement.scrollWidth > vw + 1 || document.body.scrollWidth > vw + 1;
      const offenders = [];
      for (const el of document.querySelectorAll('*')) {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > vw + 1 || r.left < -1) {
          offenders.push(
            `${el.tagName.toLowerCase()}${el.getAttribute('data-testid') ? `[${el.getAttribute('data-testid')}]` : ''} left=${Math.round(r.left)} right=${Math.round(r.right)}`,
          );
          if (offenders.length >= 5) break;
        }
      }
      const clippedFields = [];
      for (const el of document.querySelectorAll('input, textarea, select')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > vw + 1 || r.left < -1) {
          clippedFields.push(`${el.tagName.toLowerCase()}#${el.id || '?'} left=${Math.round(r.left)} right=${Math.round(r.right)}`);
        }
      }
      const smallTargets = [];
      const midTargets = [];
      for (const el of document.querySelectorAll('button')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const tid = el.getAttribute('data-testid');
        if (!tid) continue;
        // Checkbox/radio controls may be visually small; their associated
        // <label for> text is part of the real tap target on mobile.
        let box = r;
        const role = el.getAttribute('role');
        if ((role === 'checkbox' || role === 'radio') && el.id) {
          const label = document.querySelector(`label[for="${el.id}"]`);
          if (label) {
            const lr = label.getBoundingClientRect();
            if (lr.width > 0) {
              const left = Math.min(r.left, lr.left);
              const right = Math.max(r.right, lr.right);
              const top = Math.min(r.top, lr.top);
              const bottom = Math.max(r.bottom, lr.bottom);
              box = { width: right - left, height: bottom - top };
            }
          }
        }
        if (box.height < 24 || box.width < 24) {
          smallTargets.push(`${tid} ${Math.round(box.width)}x${Math.round(box.height)} (raw ${Math.round(r.width)}x${Math.round(r.height)})`);
        } else if (box.height < 40 || box.width < 40) {
          midTargets.push(`${tid} ${Math.round(box.width)}x${Math.round(box.height)} (raw ${Math.round(r.width)}x${Math.round(r.height)})`);
        }
      }
      return {
        innerWidth: vw,
        docScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        overflowX,
        offenders,
        clippedFields,
        smallTargets,
        midTargets,
      };
    }),
    10000,
    `layoutAudit ${label}`,
  );
  check(!audit.overflowX, 'LAYOUT-NO-HSCROLL', `No horizontal scroll (${label})`, width,
    `doc=${audit.docScrollWidth} body=${audit.bodyScrollWidth} vw=${audit.innerWidth}`,
    `doc=${audit.docScrollWidth} body=${audit.bodyScrollWidth} vw=${audit.innerWidth}`);
  check(audit.offenders.length === 0 && audit.clippedFields.length === 0,
    'LAYOUT-NO-CLIP', `No clipped/out-of-viewport elements (${label})`, width,
    'all elements inside viewport',
    `offenders=${JSON.stringify(audit.offenders)} clipped=${JSON.stringify(audit.clippedFields)}`);
  check(audit.smallTargets.length === 0, 'LAYOUT-TARGETS', `No unreachable/tiny controls (<24px) (${label})`, width,
    `all testid buttons >= 24px; mid-size: ${JSON.stringify(audit.midTargets)}`,
    JSON.stringify(audit.smallTargets));
  return audit;
}

function installDialogPlan(page) {
  const plan = [];
  page.on('dialog', (dialog) => {
    const entry = { type: dialog.type(), message: dialog.message(), action: plan.shift() ?? 'dismiss' };
    dialogs.push(entry);
    console.log(`  dialog(${entry.type}): "${entry.message}" -> ${entry.action}`);
    if (entry.action === 'accept') dialog.accept().catch(() => {});
    else dialog.dismiss().catch(() => {});
  });
  return plan;
}

async function gotoHash(page, hash) {
  await withTimeout(page.goto(`${BASE}/${hash}`, { waitUntil: 'domcontentloaded' }), 20000, `goto ${hash}`);
}

const idbScript = async ([op, arg]) => {
  return await new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open('salamat-calc', 1);
    } catch (e) {
      reject(new Error('IDB open threw: ' + e.message));
      return;
    }
    req.onerror = () => reject(new Error('IDB open failed: ' + (req.error && req.error.message)));
    req.onblocked = () => reject(new Error('IDB open blocked'));
    req.onsuccess = () => {
      const db = req.result;
      try {
        if (op === 'read') {
          const tx = db.transaction(['profiles', 'meta'], 'readonly');
          const g = tx.objectStore('profiles').getAll();
          g.onsuccess = () => {
            const m = tx.objectStore('meta').get('activeProfileId');
            m.onsuccess = () => {
              const all = g.result || [];
              db.close();
              resolve({
                names: all.map((r) => r && r.name),
                total: all.length,
                active: m.result == null ? null : m.result,
              });
            };
            m.onerror = () => { db.close(); reject(new Error('meta get failed')); };
          };
          g.onerror = () => { db.close(); reject(new Error('profiles getAll failed')); };
        } else if (op === 'get') {
          const tx = db.transaction(['profiles'], 'readonly');
          const g = tx.objectStore('profiles').get(arg);
          g.onsuccess = () => {
            const rec = g.result;
            db.close();
            if (!rec) return resolve(null);
            const t = (rec.tariffs || []).find((x) => x.label === 'QA кухня EGGER 18 мм');
            resolve({
              name: rec.name,
              version: rec.version,
              tariff: t ? { label: t.label, priceKzt: t.priceKzt, isConfirmed: t.isConfirmed } : null,
            });
          };
          g.onerror = () => { db.close(); reject(new Error('profiles get failed')); };
        } else if (op === 'corrupt') {
          const tx = db.transaction(['profiles'], 'readwrite');
          tx.objectStore('profiles').put({ profileId: 'qa-broken-001', schemaVersion: 999999 });
          tx.objectStore('profiles').put({ profileId: 'qa-broken-002', schemaVersion: 1, name: 42 });
          tx.oncomplete = () => { db.close(); resolve(true); };
          tx.onerror = () => { db.close(); reject(new Error('corrupt put failed')); };
          tx.onabort = () => { db.close(); reject(new Error('corrupt put aborted')); };
        } else {
          db.close();
          reject(new Error('unknown op ' + op));
        }
      } catch (e) {
        db.close();
        reject(new Error('IDB op threw: ' + e.message));
      }
    };
  });
};

async function idb(page, op, arg) {
  return withTimeout(page.evaluate(idbScript, arg === undefined ? [op] : [op, arg]), 15000, `idb ${op}`);
}

async function main() {
  const exe = await chromium.executablePath();
  console.log('Chromium executable:', exe);

  let browser;
  try {
    browser = await pw.launch({
      executablePath: exe,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--force-color-profile=srgb',
      ],
      env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chromium-libs/lib' },
    });

    const context = await browser.newContext({
      viewport: { width: 320, height: 800 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: 'ru-RU',
      acceptDownloads: true,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(20000);
    const dialogPlan = installDialogPlan(page);

    const VERSION = await browser.version();
    record('BROWSER', `Real Chromium browser version: ${VERSION}`, null, 'PASS', 'playwright-core driven');

    // ───────────────────────────────────────────────────────────────────────
    step('Phase 1 — empty profiles page at each width');
    for (const w of WIDTHS) {
      step(`Phase 1 @${w}`);
      await page.setViewportSize({ width: w, height: 800 });
      await gotoHash(page, '#/tariffs');
      await page.waitForSelector('[data-testid=profiles-page]');
      await page.waitForSelector('[data-testid=profiles-empty]');
      check(true, 'PROFILES-EMPTY', 'Profiles page renders (empty state)', w);
      await layoutAudit(page, w, 'profiles empty');
      await shot(page, `profiles-empty-${w}w`);
      for (const tid of ['create-profile', 'import-profile', 'open-template', 'copy-template']) {
        const visible = await page.locator(`[data-testid=${tid}]`).isVisible();
        check(visible, 'PROFILES-CTA', `Button ${tid} visible and clickable`, w);
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    step('Phase 2 — create profile through real IndexedDB at each width');
    const createdNames = {};
    for (const w of WIDTHS) {
      step(`Phase 2 @${w}`);
      await page.setViewportSize({ width: w, height: 800 });
      await gotoHash(page, '#/tariffs');
      await page.waitForSelector('[data-testid=profiles-page]');
      await page.click('[data-testid=create-profile]');
      await page.waitForSelector('[data-testid=new-profile-name]');
      await page.waitForSelector('[data-testid=confirm-create]');
      await shot(page, `profiles-create-dialog-${w}w`);
      const name = `QA ${w}`;
      createdNames[w] = name;
      await page.fill('[data-testid=new-profile-name]', name);
      await page.click('[data-testid=confirm-create]');
      await page.waitForSelector('[data-testid=tariff-editor]');
      const value = await page.inputValue('[data-testid=profile-name]');
      check(value === name, 'IDB-CREATE', `Create profile "${name}" opens editor`, w, `profile-name="${value}"`, `expected "${name}" got "${value}"`);
      await layoutAudit(page, w, 'editor after create');
      await shot(page, `editor-after-create-${w}w`);
      if (w !== 375) {
        const before = dialogs.length;
        await page.click('[data-testid=back-to-profiles]');
        await page.waitForSelector('[data-testid=profiles-page]');
        check(dialogs.length === before, 'NAV-CLEAN-NO-CONFIRM', 'Back from clean editor needs no confirm', w);
      }
    }

    step('Phase 2 — raw IndexedDB inspection');
    const rawCount = await idb(page, 'read');
    check(
      WIDTHS.every((w) => rawCount.names.includes(createdNames[w])),
      'IDB-RAW-PERSIST',
      'Created profiles exist in real IndexedDB (salamat-calc)',
      null,
      JSON.stringify(rawCount),
      JSON.stringify(rawCount),
    );

    // ───────────────────────────────────────────────────────────────────────
    step('Phase 3 — edit/save/reopen workflow at 375px (real IndexedDB)');
    const w = 375;
    await page.setViewportSize({ width: w, height: 800 });
    await gotoHash(page, '#/tariffs');
    await page.waitForSelector('[data-testid=profiles-page]');

    const profileCard = page.locator('[data-testid^=profile-]').filter({ hasText: createdNames[375] });
    const cardTestId = await profileCard.getAttribute('data-testid');
    const profileId = cardTestId.replace('profile-', '');
    await page.click(`[data-testid=edit-${profileId}]`);
    await page.waitForSelector('[data-testid=tariff-editor]');

    const rowIdsBefore = await page.$$eval('[data-testid^="tariff-row-"]', (els) =>
      els.map((e) => e.getAttribute('data-testid').slice('tariff-row-'.length)),
    );
    await page.click('[data-testid=add-tariff]');
    const rowIdsAfter = await page.$$eval('[data-testid^="tariff-row-"]', (els) =>
      els.map((e) => e.getAttribute('data-testid').slice('tariff-row-'.length)),
    );
    const newTariffId = rowIdsAfter.find((id) => !rowIdsBefore.includes(id)) ?? rowIdsAfter[rowIdsAfter.length - 1];
    console.log('  new tariff id:', newTariffId, '(rows:', rowIdsAfter.join(','), ')');
    await page.fill(`[data-testid=tariff-${newTariffId}-label]`, 'QA кухня EGGER 18 мм');
    await page.fill(`[data-testid=tariff-${newTariffId}-price]`, '55000');
    await page.click(`[data-testid=tariff-${newTariffId}-confirmed]`);
    const confirmed = await page.getAttribute(`[data-testid=tariff-${newTariffId}-confirmed]`, 'aria-checked');
    check(confirmed === 'true', 'EDITOR-CONFIRMED-PRICE', 'Price marked as confirmed', w, `aria-checked=${confirmed}`);
    await layoutAudit(page, w, 'editor tariff form');
    await shot(page, `editor-tariff-form-${w}w`);

    const dirtyVisible = await page.locator('[data-testid=dirty-indicator]').isVisible();
    check(dirtyVisible, 'EDITOR-DIRTY', 'Unsaved indicator shown after edit', w);
    await shotViewport(page, `editor-dirty-save-bar-${w}w`);

    await page.click('[data-testid=save-profile]');
    await page.waitForSelector('[data-testid=saved-indicator]');
    check(true, 'EDITOR-SAVE', 'Save persists draft (saved indicator)', w);
    await shot(page, `editor-saved-${w}w`);

    const savedRaw = await idb(page, 'get', profileId);
    check(
      Boolean(savedRaw && savedRaw.tariff && savedRaw.tariff.priceKzt === 55000 && savedRaw.tariff.isConfirmed === true),
      'IDB-SAVE-RAW',
      'Saved tariff present in real IndexedDB after save',
      w,
      JSON.stringify(savedRaw),
      JSON.stringify(savedRaw),
    );

    // Reopen after full reload
    await withTimeout(page.reload({ waitUntil: 'domcontentloaded' }), 20000, 'reload after save');
    await page.waitForSelector('[data-testid=tariff-editor]');
    const reopenedName = await page.inputValue('[data-testid=profile-name]');
    const rowText = await page.locator(`[data-testid=tariff-row-${newTariffId}]`).innerText();
    await page.click(`[data-testid=toggle-tariff-${newTariffId}]`);
    const reopenedPrice = await page.inputValue(`[data-testid=tariff-${newTariffId}-price]`);
    const reopenedConfirmed = await page.getAttribute(`[data-testid=tariff-${newTariffId}-confirmed]`, 'aria-checked');
    const reopenOk =
      reopenedName === createdNames[375] &&
      rowText.includes('QA кухня EGGER 18 мм') &&
      reopenedPrice === '55000' &&
      reopenedConfirmed === 'true';
    check(reopenOk, 'IDB-REOPEN', 'Profile reopens after reload with saved values', w,
      `name=${reopenedName} price=${reopenedPrice} confirmed=${reopenedConfirmed}`,
      `name=${reopenedName} price=${reopenedPrice} confirmed=${reopenedConfirmed} row=${JSON.stringify(rowText.slice(0, 80))}`);
    await shot(page, `editor-reopened-${w}w`);

    const beforeClean = dialogs.length;
    await page.click('[data-testid=back-to-profiles]');
    await page.waitForSelector('[data-testid=profiles-page]');
    check(dialogs.length === beforeClean, 'NAV-SAVED-NO-CONFIRM', 'Back after save needs no confirm', w);
    await layoutAudit(page, w, 'profiles with data');
    await shot(page, `profiles-with-profiles-${w}w`);

    await page.click(`[data-testid=activate-${profileId}]`);
    await page.waitForSelector(`[data-testid=profile-${profileId}]:has-text("активный")`);
    check(true, 'IDB-ACTIVE', 'Active profile marked in UI', w);
    await shot(page, `profiles-active-${w}w`);
    await withTimeout(page.reload({ waitUntil: 'domcontentloaded' }), 20000, 'reload active');
    await page.waitForSelector('[data-testid=profiles-page]');
    const activeText = await page.locator(`[data-testid=profile-${profileId}]`).innerText();
    check(activeText.includes('активный'), 'IDB-ACTIVE-PERSIST', 'Active profile survives reload (real meta store)', w);

    // ───────────────────────────────────────────────────────────────────────
    step('Phase 4 — Browser Back/Forward + unsaved-changes warnings @375');
    await page.click(`[data-testid=edit-${profileId}]`);
    await page.waitForSelector('[data-testid=tariff-editor]');
    await page.fill('[data-testid=profile-name]', `${createdNames[375]} dirty`);
    await page.waitForSelector('[data-testid=dirty-indicator]');

    // 1) in-app back button with unsaved changes -> cancel keeps the draft
    dialogPlan.push('dismiss');
    const d0 = dialogs.length;
    await page.click('[data-testid=back-to-profiles]');
    await page.waitForTimeout(500);
    check(dialogs.length > d0 && dialogs[dialogs.length - 1].message.includes('несохранённые'),
      'NAV-WARN-DIALOG', 'Unsaved-changes confirm dialog appears', w,
      JSON.stringify(dialogs[dialogs.length - 1] ?? null));
    const stillEditor = await page.locator('[data-testid=tariff-editor]').isVisible().catch(() => false);
    const dirtyName = await page.inputValue('[data-testid=profile-name]').catch(() => '');
    check(stillEditor && dirtyName.includes('dirty'),
      'NAV-WARN-STAY', 'Cancel keeps editor and unsaved draft', w,
      `name="${dirtyName}"`);
    await shot(page, `nav-confirm-stayed-${w}w`);
    await shotViewport(page, `nav-confirm-stayed-viewport-${w}w`);

    // 2) Browser Back with unsaved changes -> cancel reverses history, editor stays
    dialogPlan.push('dismiss');
    const hashBeforeBack = new URL(page.url()).hash;
    await page.goBack();
    await page.waitForTimeout(700);
    const afterBackUrl = new URL(page.url()).hash;
    const editorStill = await page.locator('[data-testid=tariff-editor]').isVisible().catch(() => false);
    const nameAfterBack = await page.inputValue('[data-testid=profile-name]').catch(() => '');
    check(editorStill && nameAfterBack.includes('dirty') && afterBackUrl === hashBeforeBack,
      'NAV-BACK-STAY', 'Browser Back + cancel: history restored, draft intact', w,
      `hash ${hashBeforeBack} -> ${afterBackUrl}, name="${nameAfterBack}"`,
      `hash ${hashBeforeBack} -> ${afterBackUrl}, name="${nameAfterBack}", editor=${editorStill}`);

    // 3) Browser Back again + confirm leave -> navigates away
    dialogPlan.push('accept');
    await page.goBack();
    await page.waitForTimeout(700);
    const onProfiles = await page.locator('[data-testid=profiles-page]').isVisible().catch(() => false);
    check(onProfiles, 'NAV-BACK-LEAVE', 'Browser Back + confirm: navigates to profiles', w);

    // 4) Browser Forward returns to the editor route
    await page.goForward();
    await page.waitForTimeout(700);
    const editorAfterForward = await page.locator('[data-testid=tariff-editor]').isVisible().catch(() => false);
    const nameAfterForward = await page.inputValue('[data-testid=profile-name]').catch(() => '');
    check(editorAfterForward && !nameAfterForward.includes('dirty'),
      'NAV-FORWARD', 'Browser Forward reopens editor from storage (unsaved draft discarded)', w,
      `name="${nameAfterForward}"`,
      `name="${nameAfterForward}" editor=${editorAfterForward}`);

    // 5) dirty + in-app back + accept leaves without a second dialog
    await page.fill('[data-testid=profile-name]', `${createdNames[375]} dirty2`);
    await page.waitForSelector('[data-testid=dirty-indicator]');
    dialogPlan.push('accept');
    await page.click('[data-testid=back-to-profiles]');
    await page.waitForSelector('[data-testid=profiles-page]');
    const lastDialog = dialogs[dialogs.length - 1];
    check(lastDialog && lastDialog.action === 'accept', 'NAV-WARN-LEAVE', 'Confirm leave exits without saving', w);

    // 6) Link-based navigation with dirty draft is also guarded
    await page.click(`[data-testid=edit-${profileId}]`);
    await page.waitForSelector('[data-testid=tariff-editor]');
    await page.fill('[data-testid=profile-name]', `${createdNames[375]} dirty3`);
    await page.waitForSelector('[data-testid=dirty-indicator]');
    dialogPlan.push('dismiss');
    const dLink = dialogs.length;
    const navLink = page.locator('a[href="#/"]').first();
    if (await navLink.count()) await navLink.click();
    await page.waitForTimeout(500);
    const linkGuarded = dialogs.length > dLink && (await page.locator('[data-testid=tariff-editor]').isVisible().catch(() => false));
    check(linkGuarded, 'NAV-LINK-GUARDED', 'Menu link navigation is guarded when dirty', w,
      JSON.stringify(dialogs[dialogs.length - 1] ?? null));

    // restore clean name (typing the original value makes the draft clean again)
    await page.fill('[data-testid=profile-name]', createdNames[375]);
    const dirtyAfterRevert = await page.locator('[data-testid=dirty-indicator]').isVisible().catch(() => false);
    check(!dirtyAfterRevert, 'EDITOR-REVERT-CLEAN', 'Reverting a field clears the dirty state (save disabled)', w);

    // ───────────────────────────────────────────────────────────────────────
    step('Phase 5 — beforeunload warning on reload @375');
    await page.fill('[data-testid=profile-name]', `${createdNames[375]} unload`);
    await page.waitForSelector('[data-testid=dirty-indicator]');
    const dUnload = dialogs.length;
    dialogPlan.push('accept');
    let unloadFired = false;
    const unloadWatch = new Promise((resolve) => {
      page.once('dialog', (d) => {
        if (d.type === 'beforeunload') unloadFired = true;
        resolve();
      });
      setTimeout(resolve, 6000);
    });
    const reloadResult = await Promise.race([
      withTimeout(page.reload({ waitUntil: 'domcontentloaded' }), 12000, 'reload with dirty draft').then(() => 'reloaded'),
      new Promise((r) => setTimeout(() => r('reload-pending'), 4000)),
    ]).catch((e) => `reload-error:${e.message}`);
    await unloadWatch;
    const beforeUnloadDialog = dialogs.slice(dUnload).find((d) => d.type === 'beforeunload');
    check(Boolean(beforeUnloadDialog), 'UNLOAD-WARN', 'beforeunload warning fires on reload with unsaved changes', w,
      beforeUnloadDialog ? JSON.stringify(beforeUnloadDialog) : `reload=${reloadResult} fired=${unloadFired}`,
      `dialogs=${JSON.stringify(dialogs.slice(dUnload))} reload=${reloadResult}`);
    await page.waitForSelector('[data-testid=tariff-editor]', { timeout: 8000 }).catch(() => {});

    // ───────────────────────────────────────────────────────────────────────
    step('Phase 6 — corrupt IndexedDB record: warning + local raw export');
    await idb(page, 'corrupt');
    await gotoHash(page, '#/tariffs');
    await page.waitForSelector('[data-testid=profiles-page]');
    await page.waitForSelector('[data-testid=rejected-profiles-warning]');
    const warnText = await page.locator('[data-testid=rejected-profiles-warning]').innerText();
    check(
      warnText.includes('qa-broken-001') && warnText.includes('qa-broken-002'),
      'IDB-REJECT-WARN', 'Corrupt records are reported with keys and reasons', w,
      warnText.replace(/\n/g, ' | ').slice(0, 220),
      warnText.replace(/\n/g, ' | ').slice(0, 220),
    );
    const brokenListed = await page.locator('[data-testid=profile-qa-broken-001]').count();
    check(brokenListed === 0, 'IDB-REJECT-HIDDEN', 'Corrupt records excluded from usable profile list', w);
    const validStillListed = await page.locator(`[data-testid=profile-${profileId}]`).count();
    check(validStillListed === 1, 'IDB-REJECT-VALID-OK', 'Valid profiles still listed next to the warning', w);
    await shot(page, `profiles-rejected-warning-${w}w`);
    await shotViewport(page, `profiles-rejected-warning-viewport-${w}w`);

    const downloadPromise = page.waitForEvent('download', { timeout: 8000 });
    await page.click('[data-testid=export-rejected-profiles]');
    const download = await downloadPromise;
    const dlPath = path.join(OUT, 'rejected-export-sample.json');
    await download.saveAs(dlPath);
    const exported = JSON.parse(fs.readFileSync(dlPath, 'utf-8'));
    const expOk =
      exported.format === 'salamat-calc-rejected-profiles-v1' &&
      Array.isArray(exported.records) &&
      exported.records.length === 2 &&
      exported.records.every((r) => typeof r.key === 'string' && typeof r.reason === 'string' && r.reason.length > 0 && r.raw) &&
      exported.records.some((r) => r.key === 'qa-broken-001' && r.raw.schemaVersion === 999999);
    check(expOk, 'IDB-REJECT-EXPORT', 'Local raw export of corrupt records works', w,
      `format=${exported.format}, records=${exported.records?.length}`,
      JSON.stringify(exported).slice(0, 300));
    record('IDB-REJECT-EXPORT-FILE', 'Exported file kept as evidence', w, 'PASS', 'evidence/dev-cp-02a/browser/rejected-export-sample.json');

    await withTimeout(page.reload({ waitUntil: 'domcontentloaded' }), 20000, 'reload corrupt persist');
    await page.waitForSelector('[data-testid=rejected-profiles-warning]');
    check(true, 'IDB-REJECT-PERSIST', 'Corrupt records are not silently deleted on reload', w);

    // ───────────────────────────────────────────────────────────────────────
    step('Phase 7 — template read-only banner + own copy @375');
    await page.click('[data-testid=open-template]');
    await page.waitForSelector('[data-testid=tariff-editor]');
    await page.waitForSelector('[data-testid=template-banner]');
    const nameDisabled = await page.locator('[data-testid=profile-name]').isDisabled();
    const saveCount = await page.locator('[data-testid=save-profile]').count();
    check(nameDisabled && saveCount === 0, 'TEMPLATE-READONLY', 'Template editor is read-only (no save bar)', w);
    await shot(page, `editor-template-${w}w`);
    await page.click('[data-testid=template-copy-edit]');
    await page.waitForSelector('[data-testid=save-profile]');
    check(true, 'TEMPLATE-COPY', 'Template copy becomes editable', w);

    // ───────────────────────────────────────────────────────────────────────
    step('Phase 8 — audits at 320/430 on real editor content + long values');
    for (const w2 of [320, 430]) {
      step(`Phase 8 @${w2}`);
      await page.setViewportSize({ width: w2, height: 800 });
      await gotoHash(page, '#/tariffs');
      await page.waitForSelector('[data-testid=profiles-page]');
      await layoutAudit(page, w2, 'profiles with data');
      await shot(page, `profiles-with-profiles-${w2}w`);

      const card = page.locator('[data-testid^=profile-]').filter({ hasText: createdNames[w2] });
      const cid = (await card.getAttribute('data-testid')).replace('profile-', '');
      await page.click(`[data-testid=edit-${cid}]`);
      await page.waitForSelector('[data-testid=tariff-editor]');
      await layoutAudit(page, w2, 'editor top');
      await shot(page, `editor-profile-${w2}w`);

      const firstRow = await page.$$eval('[data-testid^="tariff-row-"]', (els) =>
        els.map((e) => e.getAttribute('data-testid').slice('tariff-row-'.length)),
      );
      const tid0 = firstRow[0];
      await page.click(`[data-testid=toggle-tariff-${tid0}]`);
      await page.waitForSelector(`[data-testid=tariff-${tid0}-label]`);
      await layoutAudit(page, w2, 'editor tariff form');
      await shot(page, `editor-tariff-form-${w2}w`);

      await page.fill('[data-testid=profile-name]', 'Очень длинное название профиля для проверки переполнения на узком экране 320/430 px QA');
      await layoutAudit(page, w2, 'editor long name');
      await page.fill('[data-testid=profile-name]', createdNames[w2]);
      const backClean = dialogs.length;
      await page.click('[data-testid=back-to-profiles]');
      await page.waitForSelector('[data-testid=profiles-page]');
      check(dialogs.length === backClean, 'NAV-CLEAN-NO-CONFIRM', 'Back from clean editor needs no confirm', w2);
    }

    step('Phase 8 — dirty save bars at 320 and 430');
    await page.setViewportSize({ width: 320, height: 800 });
    await gotoHash(page, '#/tariffs');
    await page.waitForSelector('[data-testid=profiles-page]');
    const card320 = page.locator('[data-testid^=profile-]').filter({ hasText: createdNames[320] });
    const cid320 = (await card320.getAttribute('data-testid')).replace('profile-', '');
    await page.click(`[data-testid=edit-${cid320}]`);
    await page.waitForSelector('[data-testid=tariff-editor]');
    await page.fill('[data-testid=profile-name]', `${createdNames[320]} dirty`);
    await page.waitForSelector('[data-testid=dirty-indicator]');
    await shotViewport(page, `editor-dirty-save-bar-320w`);
    await layoutAudit(page, 320, 'editor dirty state');
    await page.fill('[data-testid=profile-name]', createdNames[320]);

    await page.setViewportSize({ width: 430, height: 800 });
    await gotoHash(page, '#/tariffs');
    await page.waitForSelector('[data-testid=profiles-page]');
    const card430 = page.locator('[data-testid^=profile-]').filter({ hasText: createdNames[430] });
    const cid430 = (await card430.getAttribute('data-testid')).replace('profile-', '');
    await page.click(`[data-testid=edit-${cid430}]`);
    await page.waitForSelector('[data-testid=tariff-editor]');
    await page.fill('[data-testid=profile-name]', `${createdNames[430]} dirty`);
    await page.waitForSelector('[data-testid=dirty-indicator]');
    await shotViewport(page, `editor-dirty-save-bar-430w`);
    await layoutAudit(page, 430, 'editor dirty state');
    await page.fill('[data-testid=profile-name]', createdNames[430]);

    step('All phases done');
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  const fails = results.filter((r) => r.status === 'FAIL');
  const summary = {
    date: new Date().toISOString(),
    baseUrl: BASE,
    totals: { pass: results.filter((r) => r.status === 'PASS').length, fail: fails.length },
    results,
    dialogs,
    screenshots,
  };
  fs.writeFileSync(SUMMARY_JSON, JSON.stringify(summary, null, 2));
  const md = [
    `# DEV-CP-02A browser QA summary`,
    ``,
    `- Base: ${BASE}`,
    `- Pass: ${summary.totals.pass}, Fail: ${summary.totals.fail}`,
    ``,
    `| Status | Check | Viewport | Detail |`,
    `|---|---|---|---|`,
    ...results.map((r) => `| ${r.status} | ${r.id} — ${r.name} | ${r.width ?? '-'} | ${String(r.detail).replace(/\|/g, '\\|').slice(0, 160)} |`),
    ``,
    `## Dialogs observed`,
    ...dialogs.map((d, i) => `${i + 1}. ${d.type}: "${d.message}" -> ${d.action}`),
    ``,
    `## Screenshots`,
    ...screenshots.map((s) => `- ${s}`),
  ].join('\n');
  fs.writeFileSync(SUMMARY_MD, md);

  console.log(`\n=== DONE: PASS=${summary.totals.pass} FAIL=${summary.totals.fail} ===`);
  if (fails.length) {
    console.log('FAILED CHECKS:');
    for (const f of fails) console.log(` - [${f.width}] ${f.id} ${f.name}: ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('QA HARNESS ERROR:', error);
  process.exitCode = 2;
});
