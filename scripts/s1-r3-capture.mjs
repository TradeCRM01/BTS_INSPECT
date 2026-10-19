import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.S1_OUT || 'docs/look/s1';
const SIDE = process.env.S1_SIDE || 'after';
const CLOCK = '2026-10-19T09:41:00+10:00';
const HEIGHT = 844;
const DPR = 2;
const N53 = 'Northside Plumbing & Gas Maintenance Services Pty Ltd';
const WORD20 = 'Brisbanewideplumbing';
const WORD42 = 'Brisbanewideplumbingandgasmaintyservicesxx';
const LONG_WRAP = 'Northside Plumbing & Gas Maintenance Pty Ltd';

mkdirSync(OUT, { recursive: true });

function visEl(el) {
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

const browser = await chromium.launch({ headless: true });

async function boot(page, path, wait) {
  await page.clock.install({ time: new Date(CLOCK) });
  await page.addInitScript(() => {
    try { localStorage.removeItem('grafter-theme'); } catch {}
  });
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(wait, { timeout: 25000 });
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(300);
}

async function headerMeasure(page) {
  return page.evaluate(() => {
    const vis = (el) => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const header = document.querySelector('.shell-header');
    const name = document.querySelector('[data-shell-switcher-name]');
    const btn = name?.closest('button');
    const caret = btn?.querySelector('[data-shell-switcher-chevron]');
    const search = [...document.querySelectorAll('.shell-header button, .shell-header a')].find((el) =>
      (el.getAttribute('aria-label') || el.textContent || '').includes('Search'),
    );
    const searchLabel = search?.querySelector('span');
    const nameBox = name && vis(name) ? name.getBoundingClientRect() : null;
    const caretBox = caret && vis(caret) ? caret.getBoundingClientRect() : null;
    const overlap = nameBox && caretBox
      ? !(nameBox.right <= caretBox.left + 0.5 || caretBox.right <= nameBox.left + 0.5
        || nameBox.bottom <= caretBox.top + 0.5 || caretBox.bottom <= nameBox.top + 0.5)
      : false;
    const range = name && vis(name) ? document.createRange() : null;
    if (range) range.selectNodeContents(name);
    const lineRects = range ? [...range.getClientRects()] : [];
    const lineHeight = name && vis(name) ? parseFloat(getComputedStyle(name).lineHeight) || 16 : 16;
    const headerButtons = header
      ? [...header.querySelectorAll('a,button,[role=button]')].filter(vis).map((el) => ({
        label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 48),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        ok: el.scrollWidth <= el.clientWidth + 1,
        h: +el.getBoundingClientRect().height.toFixed(2),
      }))
      : [];
    const all = [...document.querySelectorAll('body *')].filter(vis);
    let maxRight = 0;
    for (const el of all) {
      if (el.closest('svg') && el.tagName !== 'svg') continue;
      const r = el.getBoundingClientRect();
      if (r.right > maxRight) maxRight = r.right;
    }
    return {
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      maxRight: +maxRight.toFixed(2),
      headerH: header && vis(header) ? +header.getBoundingClientRect().height.toFixed(2) : 0,
      name: name && vis(name)
        ? {
          text: name.textContent,
          lines: Math.max(1, Math.round(nameBox.height / lineHeight)),
          rangeLines: lineRects.length,
          scrollWidth: name.scrollWidth,
          clientWidth: name.clientWidth,
          h: +nameBox.height.toFixed(2),
          className: name.className,
        }
        : { text: name?.textContent ?? null, hidden: true, lines: 0 },
      button: btn && vis(btn)
        ? {
          scrollWidth: btn.scrollWidth,
          clientWidth: btn.clientWidth,
          h: +btn.getBoundingClientRect().height.toFixed(2),
          ok: btn.scrollWidth <= btn.clientWidth + 1,
          heightOk: btn.getBoundingClientRect().height <= 44.5,
        }
        : null,
      caret: caretBox ? { l: +caretBox.left.toFixed(2), r: +caretBox.right.toFixed(2) } : null,
      nameRight: nameBox ? +nameBox.right.toFixed(2) : null,
      caretOverlap: overlap,
      searchPlaceholder: searchLabel && vis(searchLabel)
        ? {
          text: searchLabel.textContent,
          scrollWidth: searchLabel.scrollWidth,
          clientWidth: searchLabel.clientWidth,
          ok: searchLabel.scrollWidth <= searchLabel.clientWidth + 1,
        }
        : null,
      headerButtons,
      headerButtonsOk: headerButtons.every((b) => b.ok),
      headerFails: (btn && vis(btn) && btn.scrollWidth > btn.clientWidth + 1 ? 1 : 0)
        + (headerButtons.some((b) => !b.ok) ? 1 : 0)
        + (overlap ? 1 : 0),
      overflowDocOk: document.documentElement.scrollWidth <= window.innerWidth,
      overflowMaxOk: maxRight <= window.innerWidth + 0.5,
      mark: (() => {
        const svg = document.querySelector('[data-grafter-mark="mitre"]');
        if (!svg) return null;
        return { w: +svg.getAttribute('width'), h: +svg.getAttribute('height') };
      })(),
      wordmark: (() => {
        const wm = document.querySelector('[data-grafter-wordmark]');
        if (!wm) return null;
        const cs = getComputedStyle(wm);
        return {
          text: wm.textContent,
          aria: wm.getAttribute('aria-label'),
          transform: cs.textTransform,
          tracking: cs.letterSpacing,
          className: wm.className,
        };
      })(),
    };
  });
}

async function tabMeasure(page) {
  return page.evaluate(() => {
    const rail = document.querySelector('.job-sheet-tabs');
    if (!rail) return { missing: true };
    const tabs = [...rail.querySelectorAll('.job-sheet-tab')];
    const railBox = rail.getBoundingClientRect();
    return {
      innerWidth: window.innerWidth,
      rail: {
        l: +railBox.left.toFixed(2),
        r: +railBox.right.toFixed(2),
        w: +railBox.width.toFixed(2),
        scrollWidth: rail.scrollWidth,
        clientWidth: rail.clientWidth,
        scrolls: rail.scrollWidth > rail.clientWidth + 1,
      },
      tabs: tabs.map((t) => {
        const r = t.getBoundingClientRect();
        return {
          label: t.textContent.trim(),
          l: +r.left.toFixed(2),
          r: +r.right.toFixed(2),
          w: +r.width.toFixed(2),
          inside: r.left >= railBox.left - 13 && r.right <= railBox.right + 1,
          visibleText: t.scrollWidth <= t.clientWidth + 1,
        };
      }),
      lastRightVsRail: tabs.length
        ? +(tabs[tabs.length - 1].getBoundingClientRect().right - railBox.right).toFixed(2)
        : null,
    };
  });
}

const report = { side: SIDE, header: [], words: [], tabs: [], overflow: [], frames: [] };

async function shot(page, name) {
  const file = join(OUT, `s1-${name}-${SIDE}.png`);
  await page.screenshot({ path: file, fullPage: false });
  report.frames.push(file);
  return file;
}

async function cropHeader(page, name) {
  const header = page.locator('.shell-header');
  if (await header.count()) {
    const file = join(OUT, `s1-${name}-${SIDE}.png`);
    await header.screenshot({ path: file });
    report.frames.push(file);
  }
}

async function cropLockup(page, name, sel) {
  const el = page.locator(sel).first();
  if (await el.count()) {
    const file = join(OUT, `s1-${name}-${SIDE}.png`);
    await el.screenshot({ path: file });
    report.frames.push(file);
  }
}

async function cropTabs(page, name) {
  const el = page.locator('.job-sheet-tabs').first();
  if (await el.count()) {
    const file = join(OUT, `s1-${name}-${SIDE}.png`);
    await el.screenshot({ path: file });
    report.frames.push(file);
  }
}

const HEADER_WIDTHS = [768, 800, 900, 1000, 1024, 1280, 1920];
const GUARD_WIDTHS = [375, 390, 768, 800, 900, 1000, 1024, 1280];
const OVERFLOW_WIDTHS = [375, 390, 1024, 1280];

for (const name of [
  { id: 'n53', value: N53 },
  { id: 'word20', value: WORD20 },
  { id: 'word42', value: WORD42 },
  { id: 'wrap', value: LONG_WRAP },
]) {
  for (const width of name.id === 'n53' ? HEADER_WIDTHS : [1024, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: HEIGHT }, deviceScaleFactor: DPR });
    const page = await context.newPage();
    await boot(page, `/jobs?auditAuth=1&look=jobs-list&auditName=${encodeURIComponent(name.value)}`, '.shell-header');
    const m = await headerMeasure(page);
    report.header.push({ kind: name.id, label: name.value, width, measureName: m.name, ...m });
    if (name.id === 'n53' && [1024, 1280, 1920].includes(width)) {
      await cropHeader(page, `hname-n53-${width}`);
    }
    if (name.id === 'word20' && width === 1024) await cropHeader(page, 'hname-word20-1024');
    if (name.id === 'word42' && width === 1280) await cropHeader(page, 'hname-word42-1280');
    await context.close();
  }
}

{
  const context = await browser.newContext({ viewport: { width: 1280, height: HEIGHT }, deviceScaleFactor: DPR });
  const page = await context.newPage();
  await boot(page, `/jobs?auditAuth=1&look=jobs-list&auditName=${encodeURIComponent(LONG_WRAP)}`, '.shell-header');
  await cropLockup(page, 'brandmark-header', '[data-grafter-lockup="header"]');
  await context.close();
}

{
  const context = await browser.newContext({ viewport: { width: 390, height: HEIGHT }, deviceScaleFactor: DPR });
  const page = await context.newPage();
  await boot(page, '/login', '[data-grafter-lockup], .hub-auth-nav');
  const m = await headerMeasure(page);
  report.words.push({ page: 'login', width: 390, wordmark: m.wordmark, mark: m.mark });
  await cropLockup(page, 'wordmark-signin-390', '[data-grafter-lockup="marketing"]');
  await cropLockup(page, 'brandmark-signin-390', '[data-grafter-mark="mitre"]');
  await shot(page, 'signin-view-390');
  await context.close();
}

for (const width of [375, 390]) {
  for (const mode of ['view', 'edit']) {
    const context = await browser.newContext({ viewport: { width, height: HEIGHT }, deviceScaleFactor: DPR });
    const page = await context.newPage();
    await boot(page, '/jobs/audit-doc-job?auditAuth=1', '.job-sheet-tabs .job-sheet-tab');
    if (mode === 'edit') {
      const edit = page.locator('.hub-jobs-document button:has-text("Edit"), .hub-jobs-ledger button, .hub-jobs-identity button').first();
      if (await edit.count()) {
        await edit.click({ force: true }).catch(() => {});
        await page.waitForTimeout(250);
      }
    }
    const m = await tabMeasure(page);
    report.tabs.push({ width, mode, ...m });
    await cropTabs(page, `job-tabs-${mode}-${width}`);
    await context.close();
  }
}

for (const theme of ['light', 'dark']) {
  for (const width of OVERFLOW_WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: HEIGHT }, deviceScaleFactor: DPR });
    const page = await context.newPage();
    await boot(page, `/jobs?auditAuth=1&look=jobs-list&auditName=${encodeURIComponent(LONG_WRAP)}`, '.hub-jobs-list-doc .hub-jobs-row, .shell-header');
    if (theme === 'dark') {
      await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
      await page.waitForTimeout(80);
    }
    const m = await headerMeasure(page);
    report.overflow.push({ page: 'jobs-list', theme, width, ...m });
    await shot(page, `jobs-view-${theme}-${width}`);
    await context.close();
  }
}

for (const width of GUARD_WIDTHS) {
  const context = await browser.newContext({ viewport: { width, height: HEIGHT }, deviceScaleFactor: DPR });
  const page = await context.newPage();
  await boot(page, `/jobs?auditAuth=1&look=jobs-list&auditName=${encodeURIComponent(LONG_WRAP)}`, '.shell-header');
  const m = await headerMeasure(page);
  report.header.push({ kind: 'guard', label: LONG_WRAP, width, measureName: m.name, ...m });
  await context.close();
}

writeFileSync(join(OUT, `s1-r3-${SIDE}.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  side: SIDE,
  frames: report.frames.length,
  n53: report.header.filter((r) => r.kind === 'n53').map((r) => ({
    w: r.width,
    lines: r.measureName?.lines,
    btnH: r.button?.h,
    btnOk: r.button?.ok,
    heightOk: r.button?.heightOk,
    searchOk: r.searchPlaceholder?.ok,
    headerFails: r.headerFails,
    buttonsOk: r.headerButtonsOk,
  })),
  words: report.header.filter((r) => r.kind === 'word20' || r.kind === 'word42').map((r) => ({
    kind: r.kind,
    w: r.width,
    btnSw: r.button?.scrollWidth,
    btnCw: r.button?.clientWidth,
    btnOk: r.button?.ok,
    caretOverlap: r.caretOverlap,
    headerFails: r.headerFails,
    lines: r.measureName?.lines,
    nameSw: r.measureName?.scrollWidth,
    nameCw: r.measureName?.clientWidth,
  })),
  tabs: report.tabs.map((r) => ({
    width: r.width,
    mode: r.mode,
    rail: r.rail,
    lastRightVsRail: r.lastRightVsRail,
    tabs: r.tabs,
  })),
  wordmark: report.words,
  overflow: report.overflow.map((r) => ({
    theme: r.theme,
    width: r.width,
    sw: r.scrollWidth,
    iw: r.innerWidth,
    maxR: r.maxRight,
    docOk: r.overflowDocOk,
    maxOk: r.overflowMaxOk,
  })),
}, null, 2));

await browser.close();
