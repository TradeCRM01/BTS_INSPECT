// LOOK + FUNCTION proof for the job sheet section rail.
// Opens the DEV audit job (/jobs/audit-doc-job?auditAuth=1) at laptop 1280 and phone 390, measures the rail
// against the paper kit, walks every tab and reads which trays are on the page, then writes the frames.
// Run: node scripts/capture-job-sheet-tabs-look.mjs (needs `npm run dev` on LOOK_BASE_URL).
// Set LOOK_EXTRA_DIR to also write the Bill and Gallery views there.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = 'docs/look';
const EXTRA_DIR = process.env.LOOK_EXTRA_DIR || null;
const JOB = '/jobs/audit-doc-job';

const PAGE = 'rgb(245, 240, 230)';
const SHEET = 'rgb(255, 253, 248)';
const INK = 'rgb(10, 37, 64)';
const MUTED = 'rgb(91, 107, 124)';
const LINE = 'rgb(226, 217, 204)';
const ACTION = 'rgb(46, 117, 182)';

const TABS = ['Overview', 'Quotes', 'Bill', 'Safety', 'Time', 'Notes & photos', 'Inspections', 'Gallery'];
const PANES = {
  overview: ['.hub-jobs-ledger', '#job-schedule'],
  quotes: ['[data-job-tab="quotes"]'],
  bill: ['#job-bill', '[data-job-tab="bill"]:not(#job-bill)'],
  safety: ['#job-swms'],
  time: ['#job-hours'],
  notes: ['#job-visit-notes'],
  inspections: ['#job-insp', '#job-testing-due'],
  gallery: ['#job-gallery'],
};

mkdirSync(OUT, { recursive: true });
if (EXTRA_DIR) mkdirSync(EXTRA_DIR, { recursive: true });

let passes = 0;
function assert(ok, message) {
  if (!ok) throw new Error(message);
  passes += 1;
}

// LOOK_BROWSER_CHANNEL=chrome runs on an installed Google Chrome when the bundled Chromium is absent.
const browser = await chromium.launch({ headless: true, channel: process.env.LOOK_BROWSER_CHANNEL || undefined });

async function open(page, query) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto(`${BASE}${JOB}${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.job-sheet-tabs .job-sheet-tab.is-on', { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  return pageErrors;
}

async function readRail(page) {
  return page.evaluate(() => {
    const cs = el => getComputedStyle(el);
    const rail = document.querySelector('.job-sheet-tabs');
    const tabs = [...rail.querySelectorAll('.job-sheet-tab')];
    const on = rail.querySelector('.job-sheet-tab.is-on');
    const off = tabs.find(t => t !== on);
    const primary = document.querySelector('.hub-jobs-document .hub-jobs-tools .btn-primary');
    const railRect = rail.getBoundingClientRect();
    const onRect = on.getBoundingClientRect();
    return {
      url: location.search + location.hash,
      labels: tabs.map(t => t.textContent.trim()),
      roles: [rail.getAttribute('role'), ...new Set(tabs.map(t => t.getAttribute('role')))],
      selectedCount: tabs.filter(t => t.getAttribute('aria-selected') === 'true').length,
      on: on.dataset.tab,
      onColor: cs(on).color,
      onWeight: cs(on).fontWeight,
      onShadow: cs(on).boxShadow,
      offColor: cs(off).color,
      offShadow: cs(off).boxShadow,
      tabH: Math.round(onRect.height),
      tabFont: `${cs(on).fontFamily} ${cs(on).fontSize}`,
      hairline: cs(rail).borderBottom,
      scrolls: rail.scrollWidth > rail.clientWidth,
      // The first chip carries margin-left: -12px so its text lines up with the hero, like the list strip.
      onInsideRail: onRect.left >= railRect.left - 13 && onRect.right <= railRect.right + 1,
      primaryGap: Math.round(railRect.top - primary.getBoundingClientRect().bottom),
      primaryH: Math.round(primary.getBoundingClientRect().height),
      primaryBg: cs(primary).backgroundColor,
      sheetBg: cs(document.querySelector('.hub-jobs-sheet-body')).backgroundColor,
      pageBg: cs(document.querySelector('.hub-jobs') || document.body).backgroundColor,
      historyLength: history.length,
    };
  });
}

async function visiblePanes(page) {
  return page.evaluate(() => {
    const shown = [...document.querySelectorAll('[data-job-tab]')]
      .filter(el => el.checkVisibility() || getComputedStyle(el).display === 'contents' && !el.hidden)
      .map(el => el.dataset.jobTab);
    return [...new Set(shown)];
  });
}

async function isShown(page, selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return null;
    if (el.hidden) return false;
    return el.checkVisibility() || getComputedStyle(el).display === 'contents';
  }, selector);
}

function checkLook(label, m) {
  assert(JSON.stringify(m.labels) === JSON.stringify(TABS), `${label}: tabs ${JSON.stringify(m.labels)}`);
  assert(JSON.stringify(m.roles) === JSON.stringify(['tablist', 'tab']), `${label}: roles ${JSON.stringify(m.roles)}`);
  assert(m.selectedCount === 1, `${label}: ${m.selectedCount} tabs selected`);
  assert(m.onColor === INK && m.onWeight === '600', `${label}: on tab ${m.onColor} ${m.onWeight}`);
  assert(m.onShadow.includes(ACTION) && m.onShadow.includes('inset'), `${label}: on tab underline ${m.onShadow}`);
  assert(m.offColor === MUTED && m.offShadow === 'none', `${label}: off tab ${m.offColor} ${m.offShadow}`);
  assert(m.tabH === 44, `${label}: tab height ${m.tabH}`);
  assert(m.tabFont.includes('Source Sans 3') && m.tabFont.endsWith('14px'), `${label}: tab font ${m.tabFont}`);
  assert(m.hairline === `1px solid ${LINE}`, `${label}: rail hairline ${m.hairline}`);
  assert(m.primaryGap >= 8 && m.primaryGap <= 24, `${label}: rail sits ${m.primaryGap}px under the primary`);
  assert(m.primaryH === 44 && m.primaryBg === ACTION, `${label}: primary ${m.primaryH} ${m.primaryBg}`);
  assert(m.sheetBg === SHEET, `${label}: sheet ${m.sheetBg}`);
  assert(m.pageBg === PAGE, `${label}: page ${m.pageBg}`);
}

async function checkTab(page, label, tab) {
  const shown = await visiblePanes(page);
  assert(JSON.stringify(shown) === JSON.stringify([tab]), `${label}: ${tab} shows panes ${JSON.stringify(shown)}`);
  for (const sel of PANES[tab]) {
    assert((await isShown(page, sel)) === true, `${label}: ${tab} should show ${sel}`);
  }
  for (const [other, sels] of Object.entries(PANES)) {
    if (other === tab) continue;
    for (const sel of sels) {
      const state = await isShown(page, sel);
      assert(state === false || state === null, `${label}: ${tab} still shows ${sel}`);
    }
  }
}

async function clickTab(page, tab) {
  await page.click(`.job-sheet-tab[data-tab="${tab}"]`);
  await page.waitForSelector(`.job-sheet-tab.is-on[data-tab="${tab}"]`);
  await page.waitForTimeout(150);
}

async function frame(context, label, viewport) {
  const page = await context.newPage();
  const pageErrors = await open(page, '?auditAuth=1');

  const fresh = await readRail(page);
  console.log(label, fresh);
  checkLook(label, fresh);
  assert(fresh.on === 'overview' && !fresh.url.includes('tab='), `${label}: default ${fresh.on} ${fresh.url}`);
  await checkTab(page, label, 'overview');
  await page.screenshot({ path: `${OUT}/job-sheet-tabs-${viewport}.png`, type: 'png' });

  const walk = ['quotes', 'bill', 'safety', 'time', 'notes', 'inspections', 'gallery', 'overview'];
  for (const tab of walk) {
    await clickTab(page, tab);
    const m = await readRail(page);
    assert(m.on === tab, `${label}: clicked ${tab}, rail says ${m.on}`);
    assert(tab === 'overview' ? !m.url.includes('tab=') : m.url.includes(`tab=${tab}`), `${label}: ${tab} url ${m.url}`);
    assert(m.url.includes('auditAuth=1'), `${label}: ${tab} dropped other params ${m.url}`);
    assert(m.historyLength === fresh.historyLength, `${label}: ${tab} pushed history ${fresh.historyLength} -> ${m.historyLength}`);
    assert(m.onInsideRail, `${label}: ${tab} chip sits outside the rail`);
    await checkTab(page, label, tab);
    if (EXTRA_DIR && (tab === 'bill' || tab === 'gallery')) {
      await page.screenshot({ path: `${EXTRA_DIR}/job-sheet-tabs-${tab}-${viewport}.png`, type: 'png' });
    }
  }
  assert(fresh.scrolls === (viewport === 'phone-390'), `${label}: rail scrolls ${fresh.scrolls}`);

  const safety = await page.evaluate(() => {
    const titles = [...document.querySelectorAll('#job-swms .ops-section-title')].map(el => el.textContent.trim());
    return titles;
  });
  assert(safety.some(t => t.startsWith('JHA / SWMS')) && safety.some(t => t.startsWith('Take 5')), `${label}: safety trays ${JSON.stringify(safety)}`);

  await page.close();
  assert(pageErrors.length === 0, `${label}: page errors ${JSON.stringify(pageErrors)}`);

  const deep = await context.newPage();
  const deepErrors = await open(deep, '?auditAuth=1&tab=time');
  assert((await readRail(deep)).on === 'time', `${label}: ?tab=time did not open Time`);
  await checkTab(deep, label, 'time');
  await deep.close();
  assert(deepErrors.length === 0, `${label}: deep link page errors ${JSON.stringify(deepErrors)}`);

  const hash = await context.newPage();
  const hashErrors = await open(hash, '?auditAuth=1#job-gallery');
  assert((await readRail(hash)).on === 'gallery', `${label}: #job-gallery did not open Gallery`);
  await checkTab(hash, label, 'gallery');
  const galleryTop = await hash.evaluate(() => Math.round(document.querySelector('#job-gallery').getBoundingClientRect().top));
  assert(galleryTop < 400, `${label}: #job-gallery not scrolled into view (top ${galleryTop})`);
  await clickTab(hash, 'overview');
  assert((await readRail(hash)).on === 'overview', `${label}: Overview unreachable after a hash load`);
  await hash.close();
  assert(hashErrors.length === 0, `${label}: hash page errors ${JSON.stringify(hashErrors)}`);

  const resched = await context.newPage();
  const reschedErrors = await open(resched, '?auditAuth=1&tab=bill&reschedule=1');
  await resched.waitForTimeout(300);
  const r = await readRail(resched);
  assert(r.on === 'overview' && r.url.includes('reschedule=1') && !r.url.includes('tab='), `${label}: reschedule ${r.on} ${r.url}`);
  await resched.close();
  assert(reschedErrors.length === 0, `${label}: reschedule page errors ${JSON.stringify(reschedErrors)}`);
}

const laptop = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
  locale: 'en-AU',
});
await frame(laptop, 'laptop', 'laptop-1280');
await laptop.close();

const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  locale: 'en-AU',
});
await frame(phone, 'phone', 'phone-390');
await phone.close();

await browser.close();
console.log(`${passes} checks passed. Wrote job sheet tab rail LOOK frames.`);
