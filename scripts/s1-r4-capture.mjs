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

const browser = await chromium.launch({ headless: true });
const report = { side: SIDE, header: [], tabs: [], overflow: [], frames: [] };

async function boot(page, path, wait) {
  await page.clock.install({ time: new Date(CLOCK) });
  await page.addInitScript(() => {
    try { localStorage.removeItem('grafter-theme'); } catch {}
  });
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(wait, { timeout: 25000 });
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(250);
}

async function overflowMeasure(page) {
  return page.evaluate(() => {
    const vis = (el) => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const all = [...document.querySelectorAll('body *')].filter(vis);
    let maxRight = 0;
    let maxEl = null;
    for (const el of all) {
      if (el.closest('svg') && el.tagName !== 'svg') continue;
      const r = el.getBoundingClientRect();
      if (r.right > maxRight) {
        maxRight = r.right;
        maxEl = el;
      }
    }
    const cls = maxEl ? (maxEl.className && typeof maxEl.className === 'string' ? maxEl.className.slice(0, 80) : maxEl.tagName) : null;
    const scroller = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      return {
        sel,
        scrollWidth: +el.scrollWidth.toFixed(2),
        clientWidth: +el.clientWidth.toFixed(2),
      };
    };
    return {
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      maxRight: +maxRight.toFixed(2),
      maxEl: cls,
      overflowDocOk: document.documentElement.scrollWidth <= window.innerWidth,
      overflowMaxOk: maxRight <= window.innerWidth + 0.5,
      jobsFilters: scroller('.hub-jobs-list-filters'),
      settingsNav: scroller('.hub-company-snav-row'),
      jobTabs: scroller('.job-sheet-tabs'),
    };
  });
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
    const name = document.querySelector('[data-shell-switcher-name]');
    const btn = name?.closest('button');
    const search = document.querySelector('.shell-header button[aria-label="Search"]');
    const nameBox = name && vis(name) ? name.getBoundingClientRect() : null;
    const lineHeight = name && vis(name) ? parseFloat(getComputedStyle(name).lineHeight) || 16 : 16;
    return {
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      name: name && vis(name)
        ? {
          text: name.textContent,
          lines: Math.max(1, Math.round(nameBox.height / lineHeight)),
          h: +nameBox.height.toFixed(2),
        }
        : { text: name?.textContent ?? null, hidden: true, lines: 0 },
      button: btn && vis(btn)
        ? {
          scrollWidth: btn.scrollWidth,
          clientWidth: btn.clientWidth,
          w: +btn.getBoundingClientRect().width.toFixed(2),
          h: +btn.getBoundingClientRect().height.toFixed(2),
          ok: btn.scrollWidth <= btn.clientWidth + 1,
          heightOk: btn.getBoundingClientRect().height >= 43.5,
        }
        : null,
      search: search && vis(search)
        ? {
          w: +search.getBoundingClientRect().width.toFixed(2),
          h: +search.getBoundingClientRect().height.toFixed(2),
          aria: search.getAttribute('aria-label'),
        }
        : null,
      headerFails: (btn && vis(btn) && btn.scrollWidth > btn.clientWidth + 1 ? 1 : 0),
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
        scrollWidth: rail.scrollWidth,
        clientWidth: rail.clientWidth,
        scrolls: rail.scrollWidth > rail.clientWidth + 1,
      },
      tabs: tabs.map((t, i, arr) => {
        const r = t.getBoundingClientRect();
        const cs = getComputedStyle(t);
        const padL = parseFloat(cs.paddingLeft) || 0;
        const padR = parseFloat(cs.paddingRight) || 0;
        const next = arr[i + 1];
        const nextBox = next ? next.getBoundingClientRect() : null;
        const nextPad = next ? parseFloat(getComputedStyle(next).paddingLeft) || 0 : 0;
        const contentGap = nextBox ? +((nextBox.left + nextPad) - (r.right - padR)).toFixed(2) : null;
        return {
          label: t.textContent.trim(),
          w: +r.width.toFixed(2),
          h: +r.height.toFixed(2),
          contentGap,
          inside: r.left >= railBox.left - 13 && r.right <= railBox.right + 1,
        };
      }),
    };
  });
}

async function shot(page, name) {
  const file = join(OUT, `s1-${name}-${SIDE}.png`);
  await page.screenshot({ path: file, fullPage: false });
  report.frames.push(file);
}

async function cropTabs(page, name) {
  const el = page.locator('.job-sheet-tabs').first();
  if (await el.count()) {
    const file = join(OUT, `s1-${name}-${SIDE}.png`);
    await el.screenshot({ path: file });
    report.frames.push(file);
  }
}

async function cropHeader(page, name) {
  const header = page.locator('.shell-header');
  if (await header.count()) {
    const file = join(OUT, `s1-${name}-${SIDE}.png`);
    await header.screenshot({ path: file });
    report.frames.push(file);
  }
}

const HEADER_WIDTHS = [768, 800, 900, 1000, 1024, 1280, 1920];
const OVERFLOW_WIDTHS = [375, 390, 1024, 1280];

if (process.env.S1_JOBS_ONLY !== '1') {
  for (const name of [
    { id: 'n53', value: N53 },
    { id: 'word20', value: WORD20 },
    { id: 'word42', value: WORD42 },
  ]) {
    for (const width of name.id === 'n53' ? HEADER_WIDTHS : [1024, 1280, 1920]) {
      const context = await browser.newContext({ viewport: { width, height: HEIGHT }, deviceScaleFactor: DPR });
      const page = await context.newPage();
      await boot(page, `/jobs?auditAuth=1&look=jobs-list&auditName=${encodeURIComponent(name.value)}`, '.shell-header');
      const m = await headerMeasure(page);
      report.header.push({ kind: name.id, label: name.value, width, ...m });
      if (name.id === 'n53' && [1024, 1280, 1920].includes(width)) await cropHeader(page, `hname-n53-${width}`);
      if (name.id === 'word20' && width === 1024) await cropHeader(page, 'hname-word20-1024');
      if (name.id === 'word42' && width === 1280) await cropHeader(page, 'hname-word42-1280');
      await context.close();
    }
  }
}

if (process.env.S1_JOBS_ONLY !== '1') {
  for (const width of [375, 390]) {
    for (const mode of ['view', 'edit']) {
      const context = await browser.newContext({ viewport: { width, height: HEIGHT }, deviceScaleFactor: DPR });
      const page = await context.newPage();
      await boot(page, '/jobs/audit-doc-job?auditAuth=1', '.job-sheet-tabs .job-sheet-tab');
      if (mode === 'edit') {
        const more = page.locator('summary[aria-label="More actions"]').first();
        await more.click({ force: true });
        await page.waitForTimeout(150);
        const details = page.getByRole('menuitem', { name: 'Details' });
        if (await details.count()) {
          await details.click({ force: true });
          await page.waitForSelector('.hub-job-form-crew, .overlay-form, [class*="JobForm"]', { timeout: 8000 }).catch(() => {});
          await page.waitForTimeout(200);
        }
      }
      const m = await tabMeasure(page);
      report.tabs.push({ width, mode, ...m });
      await cropTabs(page, `job-tabs-${mode}-${width}`);
      await context.close();
    }
  }
}

const overflowPages = [
  { id: 'jobs-list', path: `/jobs?auditAuth=1&look=jobs-list&auditName=${encodeURIComponent(LONG_WRAP)}`, wait: '.hub-jobs-list-doc .hub-jobs-row, .shell-header', modes: ['view'] },
  { id: 'job-sheet', path: '/jobs/audit-doc-job?auditAuth=1', wait: '.job-sheet-tabs .job-sheet-tab', modes: ['view', 'edit'] },
  { id: 'dashboard', path: '/?auditAuth=1&look=dashboard-seed', wait: '[data-dashboard-view-grid="1"] .dashboard-home-widget, .dashboard-home-sheet', modes: ['view', 'customize'] },
  { id: 'settings', path: '/settings/company?auditAuth=1', wait: '.shell-header', modes: ['view'] },
];

for (const spec of overflowPages) {
  for (const theme of ['light', 'dark']) {
    for (const width of OVERFLOW_WIDTHS) {
      for (const mode of spec.modes) {
        const context = await browser.newContext({ viewport: { width, height: HEIGHT }, deviceScaleFactor: DPR });
        const page = await context.newPage();
        await boot(page, spec.path, spec.wait);
        if (theme === 'dark') {
          await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
          await page.waitForTimeout(80);
        }
        if (mode === 'edit') {
          const more = page.locator('summary[aria-label="More actions"]').first();
          if (await more.count()) {
            await more.click({ force: true });
            const details = page.getByRole('menuitem', { name: 'Details' });
            if (await details.count()) {
              await details.click({ force: true });
              await page.waitForTimeout(200);
            }
          }
        }
        if (mode === 'customize') {
          const btn = page.getByRole('button', { name: /Customize|Done editing/ });
          if (await btn.count()) {
            await btn.first().click({ force: true });
            await page.waitForTimeout(200);
          }
        }
        const m = await overflowMeasure(page);
        report.overflow.push({ page: spec.id, theme, width, mode, ...m });
        if (spec.id === 'jobs-list' && mode === 'view') {
          await shot(page, `jobs-view-${theme}-${width}`);
        }
        await context.close();
      }
    }
  }
}

writeFileSync(join(OUT, `s1-r4-${SIDE}.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  side: SIDE,
  frames: report.frames.length,
  header: report.header.map((r) => ({
    kind: r.kind, w: r.width, lines: r.name?.lines, btnH: r.button?.h, btnW: r.button?.w,
    btnOk: r.button?.ok, heightOk: r.button?.heightOk, search: r.search, headerFails: r.headerFails,
  })),
  tabs: report.tabs.map((r) => ({
    width: r.width, mode: r.mode, rail: r.rail,
    tabs: r.tabs,
  })),
  overflow: report.overflow.map((r) => ({
    page: r.page, theme: r.theme, mode: r.mode, width: r.width,
    sw: r.scrollWidth, iw: r.innerWidth, maxR: r.maxRight, maxEl: r.maxEl,
    docOk: r.overflowDocOk, maxOk: r.overflowMaxOk,
    jobsFilters: r.jobsFilters, settingsNav: r.settingsNav, jobTabs: r.jobTabs,
  })),
}, null, 2));

await browser.close();
