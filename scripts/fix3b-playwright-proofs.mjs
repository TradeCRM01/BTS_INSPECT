// FIX-3b — Playwright proofs (chip taps, set date, place job) + C2 evidence frames.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright';

async function diffBbox(fileA, fileB) {
  const { PNG } = await import('pngjs');
  const a = PNG.sync.read(readFileSync(`${OUT}/${fileA}`));
  const b = PNG.sync.read(readFileSync(`${OUT}/${fileB}`));
  if (a.width !== b.width || a.height !== b.height) return { error: 'size mismatch' };
  let minX = a.width; let minY = a.height; let maxX = -1; let maxY = -1; let n = 0;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const i = (a.width * y + x) * 4;
      if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) {
        n++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!n) return { diffPixels: 0, bbox: null };
  return { diffPixels: n, bbox: { left: minX, top: minY, right: maxX, bottom: maxY, width: maxX - minX + 1, height: maxY - minY + 1 } };
}

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const MAIN_BASE = process.env.LOOK_MAIN_BASE_URL || 'http://127.0.0.1:5174';
const OUT = process.env.LOOK_OUT_DIR || '/opt/cursor/artifacts';
const STORE = process.env.LOOK_STORE_DIR || '/cursor/stores/self/artifacts';
const MIN_BOARD_H = 280;
const RAIL_CAP_OUTER_PX = Math.min(0.34 * 800, 300);
const RAIL_CAP_INNER_PX = Math.min(0.3 * 800, 260);

mkdirSync(OUT, { recursive: true });
mkdirSync(STORE, { recursive: true });

function md5File(path) {
  return createHash('md5').update(readFileSync(path)).digest('hex');
}

function saveBoth(file, meta = {}) {
  copyFileSync(`${OUT}/${file}`, `${STORE}/${file}`);
  const md5 = md5File(`${OUT}/${file}`);
  console.log('wrote', file, md5, meta);
  return md5;
}

async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => {
    const sheet = document.querySelector('[data-week-sheet="1"]');
    return sheet && parseFloat(getComputedStyle(sheet).opacity) >= 0.99;
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
}

async function boardBox(page) {
  return page.evaluate(() => {
    const board = [...document.querySelectorAll('[data-week-board="1"]')]
      .find((el) => el.getBoundingClientRect().width > 0);
    const day = [...document.querySelectorAll('[data-day-board="1"]')]
      .find((el) => el.getBoundingClientRect().width > 0);
    const el = board ?? day;
    const r = el?.getBoundingClientRect();
    return { kind: board ? 'week' : 'day', height: r?.height ?? 0, width: r?.width ?? 0 };
  });
}

async function openDesktop(path) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    locale: 'en-AU',
    timezoneId: 'Australia/Brisbane',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-week-sheet="1"]', { timeout: 30000 });
  await settle(page);
  return { browser, page };
}

async function railMetrics(page) {
  return page.evaluate(({ outerCap, innerCap }) => {
    const rail = document.querySelector('[data-schedule-rail="1"]');
    const inner = rail?.querySelector('.max-h-\\[70vh\\]');
    const railRect = rail?.getBoundingClientRect();
    const innerEl = inner ?? rail?.querySelector('.p-2');
    const docH = document.documentElement.scrollHeight;
    const railBottomDoc = (railRect?.bottom ?? 0) + window.scrollY;
    return {
      railHeight: railRect?.height ?? 0,
      innerClientHeight: innerEl?.clientHeight ?? 0,
      innerScrollHeight: innerEl?.scrollHeight ?? 0,
      outerCapPx: outerCap,
      innerCapPx: innerCap,
      documentScrollHeight: docH,
      railBottomInDocument: railBottomDoc,
      scrollY: window.scrollY,
      cardCount: rail?.querySelectorAll('[data-schedule-rail-job]').length ?? 0,
      boardBottom: document.querySelector('[data-week-board="1"]')?.getBoundingClientRect().bottom ?? 0,
    };
  }, { outerCap: RAIL_CAP_OUTER_PX, innerCap: RAIL_CAP_INNER_PX });
}

async function scrollRailIntoView(page) {
  await page.evaluate(() => {
    const rail = document.querySelector('[data-schedule-rail="1"]');
    const board = document.querySelector('[data-week-board="1"]');
    if (!rail || !board) return;
    const scrollers = [
      document.querySelector('.hub-week-sheet-body'),
      document.querySelector('.hub-week-document'),
      document.querySelector('.hub-board-cal'),
      document.documentElement,
    ].filter(Boolean);
    for (const el of scrollers) {
      if (el.scrollHeight > el.clientHeight + 8) {
        const railDoc = rail.getBoundingClientRect().top + (el === document.documentElement ? window.scrollY : el.scrollTop);
        const target = Math.max(0, rail.getBoundingClientRect().top + el.scrollTop - 280);
        el.scrollTop = target;
        break;
      }
    }
    rail.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  await page.waitForTimeout(400);
}

async function shot1280(page, file) {
  const box = await boardBox(page);
  if (box.height < MIN_BOARD_H) throw new Error(`board height ${box.height} for ${file}`);
  await page.screenshot({ path: `${OUT}/${file}`, type: 'png', fullPage: false });
  return saveBoth(file, { board: box });
}

const report = { chipTaps: [], rails: {}, phones: {}, proofs: {} };

// —— Chip first-tap (10 runs) ——
for (const width of [375, 390]) {
  for (let run = 1; run <= 5; run++) {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({
      viewport: { width, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/schedule?auditAuth=1&look=fix3a-schedule`, { waitUntil: 'networkidle' });
    const chip = page.locator('[data-schedule-unscheduled-chip="1"]');
    await chip.waitFor({ state: 'visible', timeout: 20000 });
    await page.tap('[data-schedule-unscheduled-chip="1"]');
    const expanded = await page.evaluate(() => (
      document.querySelector('[data-schedule-unscheduled-chip="1"]')?.getAttribute('aria-expanded') === 'true'
      && !!document.querySelector('[data-schedule-unscheduled-list="1"]')
    ));
    report.chipTaps.push({ width, run, expanded });
    if (!expanded) throw new Error(`chip first tap failed ${width} run ${run}`);
    await browser.close();
  }
}

// —— Core 1280 frames ——
{
  const { browser, page } = await openDesktop('/schedule?auditAuth=1&look=fix3a-schedule');
  report.md5 = report.md5 || {};
  report.md5.week17 = await shot1280(page, 'fix3b-week-17-1280.png');
  await browser.close();
}
{
  const { browser, page } = await openDesktop('/schedule?auditAuth=1&look=week-board');
  report.md5.weekBoard = await shot1280(page, 'fix3b-week-board-1280.png');
  await browser.close();
}
{
  const { browser, page } = await openDesktop('/schedule?auditAuth=1&look=fix3a-schedule&unscheduled=0');
  const box = await boardBox(page);
  await page.screenshot({ path: `${OUT}/fix3b-week-0-1280.png`, type: 'png', fullPage: false });
  report.md5.week0 = saveBoth('fix3b-week-0-1280.png', { board: box });
  await browser.close();
}
{
  const { browser, page } = await openDesktop('/schedule?auditAuth=1&look=fix3a-schedule&unscheduled=60');
  report.md5.week60 = await shot1280(page, 'fix3b-week-60-1280.png');
  await browser.close();
}
{
  const { browser, page } = await openDesktop('/schedule?auditAuth=1&look=fix3a-schedule&view=day');
  const box = await boardBox(page);
  await page.screenshot({ path: `${OUT}/fix3b-day-fri-1280.png`, type: 'png', fullPage: false });
  report.md5.dayFri = saveBoth('fix3b-day-fri-1280.png', { board: box });
  await browser.close();
}

// —— Rail frames ——
for (const [suffix, path] of [
  ['17', '/schedule?auditAuth=1&look=fix3a-schedule'],
  ['60', '/schedule?auditAuth=1&look=fix3a-schedule&unscheduled=60'],
]) {
  const { browser, page } = await openDesktop(path);
  await scrollRailIntoView(page);
  const metrics = await railMetrics(page);
  if (metrics.railHeight > RAIL_CAP_OUTER_PX + 2) throw new Error(JSON.stringify(metrics));
  if (metrics.cardCount < 3) throw new Error(`cards ${metrics.cardCount}`);
  const inView = await page.evaluate(() => {
    const rail = document.querySelector('[data-schedule-rail="1"]');
    const r = rail?.getBoundingClientRect();
    return { top: r?.top ?? -1, bottom: r?.bottom ?? -1, visible: r && r.top >= 0 && r.bottom <= 800 };
  });
  if (!inView.visible) throw new Error(`rail not in viewport after scroll ${JSON.stringify(inView)}`);
  const file = `fix3b-week-${suffix}-rail-1280.png`;
  await page.screenshot({ path: `${OUT}/${file}`, type: 'png', fullPage: false });
  report.rails[suffix] = { md5: saveBoth(file, metrics), metrics };
  await browser.close();
}

// —— Set date one-tap ——
{
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/schedule?auditAuth=1&look=fix3a-schedule`, { waitUntil: 'networkidle' });
  await settle(page);
  await page.tap('[data-schedule-unscheduled-chip="1"]');
  await page.waitForSelector('[data-schedule-unscheduled-list="1"]', { timeout: 10000 });
  const jobId = await page.locator('[data-schedule-set-date]').first().getAttribute('data-schedule-set-date');
  await page.tap(`[data-schedule-set-date="${jobId}"]`);
  await page.waitForSelector('.hub-schedule-job-sheet', { timeout: 10000 });
  await page.screenshot({ path: `${OUT}/fix3b-setdate-390.png`, type: 'png', fullPage: false });
  report.proofs.setDate390 = saveBoth('fix3b-setdate-390.png', { jobId });
  await browser.close();
}
{
  const { browser, page } = await openDesktop('/schedule?auditAuth=1&look=fix3a-schedule&unscheduled=60');
  await scrollRailIntoView(page);
  const jobId = await page.locator('[data-schedule-set-date]').first().getAttribute('data-schedule-set-date');
  await page.locator(`[data-schedule-set-date="${jobId}"]`).click();
  await page.waitForSelector('.hub-schedule-job-sheet', { timeout: 10000 });
  await page.screenshot({ path: `${OUT}/fix3b-setdate-1280.png`, type: 'png', fullPage: false });
  report.proofs.setDate1280 = saveBoth('fix3b-setdate-1280.png', { jobId });
  await browser.close();
}

// —— Place job from rail ——
{
  const { browser, page } = await openDesktop('/schedule?auditAuth=1&look=fix3a-schedule');
  await scrollRailIntoView(page);
  const jobId = 'fix3a-unscheduled-1';
  await page.locator(`[data-schedule-rail-job="${jobId}"]`).click();
  await page.locator('[data-week-cell]').first().click();
  await page.waitForTimeout(400);
  const box = await boardBox(page);
  await page.screenshot({ path: `${OUT}/fix3b-place-1280.png`, type: 'png', fullPage: false });
  report.proofs.place1280 = saveBoth('fix3b-place-1280.png', { jobId, board: box });
  await browser.close();
}

// —— Phone week-board soft-1 pair ——
async function phoneWeekboard(base, file) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'en-AU',
  });
  const page = await ctx.newPage();
  await page.goto(`${base}/schedule?auditAuth=1&look=week-board`, { waitUntil: 'networkidle' });
  await settle(page);
  await page.evaluate(() => {
    const agenda = document.querySelector('[data-week-agenda="1"]');
    if (agenda) agenda.scrollTop = agenda.scrollHeight;
  });
  await page.waitForTimeout(300);
  const footer = await page.locator('.hub-phone-unscheduled-footer').count();
  await page.screenshot({ path: `${OUT}/${file}`, type: 'png', fullPage: false });
  const md5 = saveBoth(file, { footer });
  await browser.close();
  return { md5, footer };
}

report.phones.weekboardHead = await phoneWeekboard(BASE, 'fix3b-phone-weekboard-head.png');
report.phones.weekboardMain = await phoneWeekboard(MAIN_BASE, 'fix3b-phone-weekboard-main.png');
report.phones.weekboardDiff = await diffBbox('fix3b-phone-weekboard-head.png', 'fix3b-phone-weekboard-main.png');

async function phoneFix3a(base, path, file) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await settle(page);
  await page.evaluate(() => {
    const agenda = document.querySelector('[data-week-agenda="1"]');
    if (agenda) agenda.scrollTop = agenda.scrollHeight;
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${file}`, type: 'png', fullPage: false });
  const md5 = saveBoth(file);
  await browser.close();
  return md5;
}

report.phones.phone390 = await phoneFix3a(BASE, '/schedule?auditAuth=1&look=fix3a-schedule', 'fix3b-phone-390.png');
report.phones.phone390Main = await phoneFix3a(MAIN_BASE, '/schedule?auditAuth=1&look=fix3a-schedule', 'fix3b-phone-390-main.png');
report.phones.zeroHead = await phoneFix3a(BASE, '/schedule?auditAuth=1&look=fix3a-schedule&unscheduled=0', 'fix3b-phone-390-zero-head.png');

report.md5All = {};
for (const name of readdirSync(OUT).filter((f) => f.startsWith('fix3b-') && f.endsWith('.png'))) {
  report.md5All[name] = md5File(`${OUT}/${name}`);
}

console.log(JSON.stringify(report, null, 2));
