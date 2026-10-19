import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const AFTER = process.env.S1_AFTER_URL || 'http://127.0.0.1:5173';
const BEFORE = process.env.S1_BEFORE_URL || '';
const OUT = process.env.S1_OUT || 'docs/look/s1';
const LONG_NAME = 'Northside Plumbing & Gas Maintenance Pty Ltd';
const CLOCK = '2026-10-19T09:41:00+10:00';
const HEIGHT = 844;
const DPR = 2;
const TABLE_WIDTHS = [375, 390, 1024, 1280];
const HEADER_WIDTHS = [375, 390, 768, 800, 900, 1000, 1024, 1280];

mkdirSync(OUT, { recursive: true });

const PAGES = [
  { page: 'header', path: `/jobs?auditAuth=1&look=jobs-list&auditName=${encodeURIComponent(LONG_NAME)}`, wait: '.shell-header', states: ['view'] },
  { page: 'jobs', path: `/jobs?auditAuth=1&look=jobs-list&auditName=${encodeURIComponent(LONG_NAME)}`, wait: '.hub-jobs-list-doc .hub-jobs-row', states: ['view', 'edit'] },
  { page: 'signin', path: '/login', wait: '[data-grafter-lockup], .hub-auth-nav', states: ['view'] },
  { page: 'quotes', path: `/quotes?auditAuth=1&look=letterhead&auditName=${encodeURIComponent(LONG_NAME)}`, wait: '.hub-quote-sheet, .shell-header, .hub-quote-letterhead', states: ['view', 'edit'] },
];

function vis(el, cs) {
  if (cs.display === 'none' || cs.visibility === 'hidden') return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

async function measure(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const visEl = (el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const all = [...document.querySelectorAll('body *')].filter(visEl);
    let maxRight = 0;
    let maxRightTag = '';
    for (const el of all) {
      if (el.closest('svg') && el.tagName !== 'svg') continue;
      const r = el.getBoundingClientRect();
      if (r.right > maxRight) {
        maxRight = r.right;
        maxRightTag = `${el.tagName}.${(el.className || '').toString().split(' ')[0] || ''}`.slice(0, 60);
      }
    }
    const header = document.querySelector('.shell-header');
    const headerBox = header && visEl(header) ? header.getBoundingClientRect() : null;
    let headerChildMax = 0;
    const headerButtons = [];
    if (header) {
      for (const el of header.querySelectorAll('*')) {
        if (!visEl(el)) continue;
        if (el.closest('svg') && el.tagName !== 'svg') continue;
        const r = el.getBoundingClientRect();
        if (r.right > headerChildMax) headerChildMax = r.right;
      }
      for (const el of [...header.querySelectorAll('a,button,[role=button]')].filter(visEl)) {
        headerButtons.push({
          label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 48),
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          ok: el.scrollWidth <= el.clientWidth + 1,
        });
      }
    }
    const name = document.querySelector('[data-shell-switcher-name]');
    const nameCs = name ? getComputedStyle(name) : null;
    const nameVis = !!(name && nameCs && visEl(name));
    const companyName = nameVis
      ? {
        text: name.textContent,
        scrollWidth: name.scrollWidth,
        clientWidth: name.clientWidth,
        ok: name.scrollWidth <= name.clientWidth + 1,
        hidden: false,
      }
      : { text: name?.textContent ?? null, hidden: true, ok: true, scrollWidth: 0, clientWidth: 0 };
    const clips = [];
    for (const el of all) {
      const cs = getComputedStyle(el);
      if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) {
        if (el.hasAttribute('data-shell-switcher-name')) {
          clips.push(`switcher ellipsis: sw=${el.scrollWidth} cw=${el.clientWidth}`);
        }
      }
      const tn = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
      if (!tn.length || el.closest('svg')) continue;
      for (const t of tn) {
        const rg = document.createRange();
        rg.selectNodeContents(t);
        const tr = rg.getBoundingClientRect();
        if (tr.right > vw + 0.5) clips.push(`text off screen: ${t.textContent.trim().slice(0, 40)}`);
      }
    }
    return {
      innerWidth: vw,
      scrollWidth: document.documentElement.scrollWidth,
      maxRight: +maxRight.toFixed(2),
      maxRightTag,
      overflowDocOk: document.documentElement.scrollWidth <= vw,
      overflowMaxOk: maxRight <= vw + 0.5,
      snippetA: document.documentElement.scrollWidth <= vw && maxRight <= vw + 0.5,
      snippetB: clips.length === 0 && companyName.ok,
      clips,
      headerRight: headerBox ? +headerBox.right.toFixed(2) : 0,
      headerHeight: headerBox ? +headerBox.height.toFixed(2) : 0,
      headerChildMax: +headerChildMax.toFixed(2),
      headerContains: !headerBox || headerChildMax <= headerBox.right + 0.5,
      headerButtons,
      headerButtonsOk: headerButtons.every((b) => b.ok),
      companyName,
    };
  });
}

async function boot(page, url, wait) {
  await page.clock.install({ time: new Date(CLOCK) });
  await page.addInitScript(() => {
    try { localStorage.removeItem('grafter-theme'); } catch {}
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(wait, { timeout: 25000 });
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(250);
}

async function applyTheme(page, theme) {
  await page.evaluate((next) => {
    document.documentElement.dataset.theme = next;
  }, theme);
}

async function enterEdit(page, pageId) {
  if (pageId === 'jobs') {
    const btn = page.locator('button:has-text("New job")').first();
    if (await btn.count()) {
      await btn.click({ force: true });
      await page.waitForTimeout(400);
    }
  }
  if (pageId === 'quotes') {
    const edit = page.locator('button:has-text("Edit quote")').first();
    if (await edit.count()) {
      await edit.click({ force: true });
      await page.waitForTimeout(400);
      return;
    }
    const btn = page.locator('button:has-text("New quote")').first();
    if (await btn.count()) {
      await btn.click({ force: true });
      await page.waitForTimeout(400);
    }
  }
}

const report = { parent: null, table: [], header: [], frames: [], allowDark: null, headerBefore: [] };
const browser = await chromium.launch({ headless: true });

for (const spec of PAGES) {
  for (const state of spec.states) {
    for (const theme of ['light', 'dark']) {
      for (const width of TABLE_WIDTHS) {
        const context = await browser.newContext({ viewport: { width, height: HEIGHT }, deviceScaleFactor: DPR });
        const page = await context.newPage();
        await boot(page, `${AFTER}${spec.path}`, spec.wait);
        if (state === 'edit') await enterEdit(page, spec.page);
        await applyTheme(page, theme);
        await page.waitForTimeout(80);
        const m = await measure(page);
        report.table.push({ page: spec.page, state, theme, width, ...m });
        if (state === 'view' && ['header', 'jobs', 'signin'].includes(spec.page)) {
          const file = join(OUT, `s1-${spec.page}-view-${theme}-after-${width}.png`);
          await page.screenshot({ path: file, fullPage: false });
          report.frames.push({ page: spec.page, state, theme, side: 'after', width, file });
        }
        await context.close();
      }
    }
  }
}

for (const width of HEADER_WIDTHS) {
  const context = await browser.newContext({ viewport: { width, height: HEIGHT }, deviceScaleFactor: DPR });
  const page = await context.newPage();
  await boot(page, `${AFTER}${PAGES[0].path}`, PAGES[0].wait);
  const m = await measure(page);
  const file = join(OUT, `s1-header-guard-view-light-after-${width}.png`);
  await page.screenshot({ path: file, fullPage: false });
  report.header.push({ width, ...m, file });
  await context.close();
}

if (BEFORE) {
  for (const spec of PAGES.filter((p) => ['header', 'jobs', 'signin'].includes(p.page))) {
    for (const theme of ['light', 'dark']) {
      for (const width of [375, 390, 1024, 1280]) {
        const context = await browser.newContext({ viewport: { width, height: HEIGHT }, deviceScaleFactor: DPR });
        const page = await context.newPage();
        await boot(page, `${BEFORE}${spec.path}`, spec.wait);
        await applyTheme(page, theme);
        await page.waitForTimeout(80);
        const m = await measure(page);
        const file = join(OUT, `s1-${spec.page}-view-${theme}-before-${width}.png`);
        await page.screenshot({ path: file, fullPage: false });
        report.frames.push({ page: spec.page, state: 'view', theme, side: 'before', width, file, headerHeight: m.headerHeight });
        if (spec.page === 'header' && theme === 'light') {
          report.headerBefore.push({ width, headerHeight: m.headerHeight, companyName: m.companyName });
        }
        await context.close();
      }
    }
  }
}

{
  const context = await browser.newContext({ viewport: { width: 1280, height: HEIGHT }, deviceScaleFactor: DPR });
  const page = await context.newPage();
  await boot(page, `${AFTER}${PAGES[1].path}`, PAGES[1].wait);
  const keys = ['--g-bg', '--g-ink', '--g-accent', '--g-font-sans', '--g-font-ui', '--g-font-title', '--g-font-mono', 'background-color', 'color', 'font-family'];
  const read = async () => page.evaluate((ks) => {
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    const body = getComputedStyle(document.body);
    const paper = document.querySelector('.hub-jobs-list-doc, .ops-page, main') || document.body;
    const pcs = getComputedStyle(paper);
    const out = {
      allowDark: root.getAttribute('data-allow-dark'),
      theme: root.dataset.theme || root.getAttribute('data-theme'),
      root: Object.fromEntries(ks.map((k) => [k, (k.startsWith('--') ? cs.getPropertyValue(k) : cs[k] || '').toString().trim()])),
      bodyBg: body.backgroundColor,
      paperBg: pcs.backgroundColor,
      paperColor: pcs.color,
      paperFont: pcs.fontFamily,
    };
    return out;
  }, keys);
  const light = await read();
  const lightShot = await page.locator('body').screenshot();
  await applyTheme(page, 'dark');
  await page.waitForTimeout(80);
  const forced = await read();
  const forcedShot = await page.locator('body').screenshot();
  let samePixels = lightShot.equals(forcedShot);
  let pixelDiff = 0;
  if (!samePixels) {
    // compare raw buffers; count differing bytes as a coarse fail signal
    const a = lightShot;
    const b = forcedShot;
    const n = Math.min(a.length, b.length);
    let diff = Math.abs(a.length - b.length);
    for (let i = 0; i < n; i += 17) if (a[i] !== b[i]) diff += 1;
    pixelDiff = diff;
  }
  report.allowDark = {
    light,
    forced,
    sameComputed: JSON.stringify(light) === JSON.stringify(forced),
    samePixels,
    pixelDiff,
    equalFonts: light.paperFont === forced.paperFont && light.root['--g-font-sans'] === forced.root['--g-font-sans'],
    equalColors: light.root['--g-bg'] === forced.root['--g-bg'] && light.bodyBg === forced.bodyBg,
  };
  await context.close();
}

writeFileSync(join(OUT, 's1-r2-prove.json'), JSON.stringify(report, null, 2));
const tableFails = report.table.filter((r) => !r.snippetA || !r.snippetB);
const headerFails = report.header.filter((r) => !r.headerContains || !r.headerButtonsOk || !r.companyName.ok);
const compactTable = report.table.map((r) => ({
  page: r.page,
  state: r.state,
  theme: r.theme,
  width: r.width,
  scrollWidth: r.scrollWidth,
  innerWidth: r.innerWidth,
  maxRight: r.maxRight,
  maxRightTag: r.maxRightTag,
  overflowDocOk: r.overflowDocOk,
  overflowMaxOk: r.overflowMaxOk,
  snippetA: r.snippetA,
  snippetB: r.snippetB,
  clips: r.clips,
  headerHeight: r.headerHeight,
  name: r.companyName,
}));
console.log(JSON.stringify({
  tableRows: report.table.length,
  tableFails: tableFails.length,
  headerRows: report.header.length,
  headerFails: headerFails.length,
  allowDark: report.allowDark,
  headerBefore: report.headerBefore,
  headerAfter375: report.header.filter((h) => h.width === 375).map((h) => h.headerHeight),
  table: compactTable,
  header: report.header.map((h) => ({
    width: h.width,
    headerRight: h.headerRight,
    headerChildMax: h.headerChildMax,
    headerHeight: h.headerHeight,
    maxRight: h.maxRight,
    name: h.companyName,
    buttonsOk: h.headerButtonsOk,
    buttons: h.headerButtons.map((b) => ({ label: b.label, sw: b.scrollWidth, cw: b.clientWidth, ok: b.ok })),
  })),
}, null, 2));

await browser.close();
