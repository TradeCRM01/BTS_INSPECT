// FIX-3b C2 — rail scroll frames, settled phone week-board, md5 + metrics (no product code).
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const MAIN_BASE = process.env.LOOK_MAIN_BASE_URL || 'http://127.0.0.1:5174';
const OUT = process.env.LOOK_OUT_DIR || '/opt/cursor/artifacts';
const STORE = process.env.LOOK_STORE_DIR || '/cursor/stores/self/artifacts';
const RAIL_CAP_OUTER_PX = Math.min(0.34 * 800, 300); // min(34vh, 300px) @ 800px viewport
const RAIL_CAP_INNER_PX = Math.min(0.3 * 800, 260);

mkdirSync(OUT, { recursive: true });
mkdirSync(STORE, { recursive: true });

function md5File(path) {
  return createHash('md5').update(readFileSync(path)).digest('hex');
}

function saveBoth(file) {
  copyFileSync(`${OUT}/${file}`, `${STORE}/${file}`);
  return md5File(`${OUT}/${file}`);
}

async function waitSettled(page) {
  await page.goto(page.url(), { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForFunction(() => {
    const sheet = document.querySelector('[data-week-sheet="1"]');
    if (!sheet) return false;
    const op = parseFloat(getComputedStyle(sheet).opacity);
    return op >= 0.99;
  }, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
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
  await page.waitForSelector('[data-schedule-rail="1"]', { timeout: 30000 });
  await page.waitForFunction(() => {
    const sheet = document.querySelector('[data-week-sheet="1"]');
    return sheet && parseFloat(getComputedStyle(sheet).opacity) >= 0.99;
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  return { browser, page };
}

async function railMetrics(page) {
  return page.evaluate(({ outerCap, innerCap }) => {
    const rail = document.querySelector('.hub-schedule-needs-date-rail[data-schedule-rail="1"]')
      ?? document.querySelector('[data-schedule-rail="1"]');
    const board = [...document.querySelectorAll('[data-week-board="1"]')]
      .find((el) => el.getBoundingClientRect().width > 0);
    const inner = rail?.querySelector('.max-h-\\[70vh\\]') ?? rail?.querySelector('[class*="max-h-"]');
    const railRect = rail?.getBoundingClientRect();
    const boardRect = board?.getBoundingClientRect();
    const innerEl = inner ?? rail?.querySelector('.p-2');
    const scrollReachable = (() => {
      if (!rail) return { ok: false, reason: 'no rail' };
      let clipped = false;
      let node = rail;
      while (node && node !== document.body) {
        const st = getComputedStyle(node);
        if (st.overflow === 'hidden' || st.overflowY === 'hidden') {
          const r = node.getBoundingClientRect();
          const rr = rail.getBoundingClientRect();
          if (rr.bottom > r.bottom + 1 || rr.top < r.top - 1) clipped = true;
        }
        node = node.parentElement;
      }
      const docH = document.documentElement.scrollHeight;
      const railBottomDoc = (railRect?.bottom ?? 0) + window.scrollY;
      return {
        ok: !clipped && railBottomDoc <= docH + 1,
        clipped,
        documentScrollHeight: docH,
        viewportH: window.innerHeight,
        scrollY: window.scrollY,
        railBottomInDocument: railBottomDoc,
      };
    })();
    return {
      railHeight: railRect?.height ?? 0,
      railWidth: railRect?.width ?? 0,
      railTop: railRect?.top ?? 0,
      railBottom: railRect?.bottom ?? 0,
      boardBottom: boardRect?.bottom ?? 0,
      boardTop: boardRect?.top ?? 0,
      label: rail?.innerText?.slice(0, 80) ?? '',
      innerClientHeight: innerEl?.clientHeight ?? 0,
      innerScrollHeight: innerEl?.scrollHeight ?? 0,
      outerCapPx: outerCap,
      innerCapPx: innerCap,
      scrollReachable,
      cardCount: rail?.querySelectorAll('[data-schedule-rail-job]').length ?? 0,
    };
  }, { outerCap: RAIL_CAP_OUTER_PX, innerCap: RAIL_CAP_INNER_PX });
}

async function scrollRailIntoView(page) {
  await page.evaluate(() => {
    const rail = document.querySelector('[data-schedule-rail="1"]');
    const board = document.querySelector('[data-week-board="1"]');
    if (!rail || !board) return;
    const railTop = rail.getBoundingClientRect().top + window.scrollY;
    const boardBottom = board.getBoundingClientRect().bottom + window.scrollY;
    const target = Math.max(0, Math.min(railTop - 320, boardBottom - 520));
    window.scrollTo(0, target);
  });
  await page.waitForTimeout(300);
}

async function captureRailFrame(path, file) {
  const { browser, page } = await openDesktop(path);
  await scrollRailIntoView(page);
  const metrics = await railMetrics(page);
  if (metrics.railHeight > RAIL_CAP_OUTER_PX + 2) {
    throw new Error(`rail height ${metrics.railHeight} > cap ${RAIL_CAP_OUTER_PX} ${JSON.stringify(metrics)}`);
  }
  if (metrics.cardCount < 3) {
    throw new Error(`expected ≥3 rail cards, got ${metrics.cardCount}`);
  }
  if (metrics.railTop < 0 || metrics.railBottom > 800) {
    throw new Error(`rail not in viewport ${JSON.stringify(metrics)}`);
  }
  await page.screenshot({ path: `${OUT}/${file}`, type: 'png', fullPage: false });
  const md5 = saveBoth(file);
  await browser.close();
  return { md5, metrics };
}

async function openPhone(base, path) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: 'en-AU',
    timezoneId: 'Australia/Brisbane',
  });
  const page = await ctx.newPage();
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-week-agenda="1"]', { timeout: 30000 });
  await page.waitForFunction(() => {
    const agenda = document.querySelector('[data-week-agenda="1"]');
    const sheet = document.querySelector('[data-week-sheet="1"]');
    const opA = agenda ? parseFloat(getComputedStyle(agenda).opacity) : 1;
    const opS = sheet ? parseFloat(getComputedStyle(sheet).opacity) : 1;
    return opA >= 0.99 && opS >= 0.99;
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const agenda = document.querySelector('[data-week-agenda="1"]');
    if (agenda) agenda.scrollTop = agenda.scrollHeight;
  });
  await page.waitForTimeout(300);
  const sun = await page.locator('body').innerText();
  if (!sun.includes('Sun 11 Oct') && path.includes('week-board')) {
    throw new Error('Sun 11 Oct not in viewport text');
  }
  return { browser, page };
}

async function capturePhoneWeekboard(base, file) {
  const { browser, page } = await openPhone(base, '/schedule?auditAuth=1&look=week-board');
  const footer = await page.locator('.hub-phone-unscheduled-footer').count();
  await page.screenshot({ path: `${OUT}/${file}`, type: 'png', fullPage: false });
  const md5 = saveBoth(file);
  await browser.close();
  return { md5, footer };
}

function diffBbox(aPath, bPath) {
  const a = PNG.sync.read(readFileSync(aPath));
  const b = PNG.sync.read(readFileSync(bPath));
  if (a.width !== b.width || a.height !== b.height) {
    return { error: 'size mismatch', aw: a.width, bh: b.height };
  }
  let minX = a.width;
  let minY = a.height;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const i = (a.width * y + x) * 4;
      if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) {
        count++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (count === 0) return { diffPixels: 0, bbox: null };
  return {
    diffPixels: count,
    bbox: { left: minX, top: minY, right: maxX, bottom: maxY, width: maxX - minX + 1, height: maxY - minY + 1 },
  };
}

const report = { rails: {}, phones: {}, md5s: {} };

report.rails.week17 = await captureRailFrame(
  '/schedule?auditAuth=1&look=fix3a-schedule',
  'fix3b-week-17-rail-1280.png',
);
report.rails.week60 = await captureRailFrame(
  '/schedule?auditAuth=1&look=fix3a-schedule&unscheduled=60',
  'fix3b-week-60-rail-1280.png',
);

report.phones.weekboardHead = await capturePhoneWeekboard(BASE, 'fix3b-phone-weekboard-head.png');
report.phones.weekboardMain = await capturePhoneWeekboard(MAIN_BASE, 'fix3b-phone-weekboard-main.png');

{
  const { browser, page } = await openPhone(BASE, '/schedule?auditAuth=1&look=fix3a-schedule&unscheduled=0');
  await page.screenshot({ path: `${OUT}/fix3b-phone-390-zero-head.png`, type: 'png', fullPage: false });
  report.phones.zeroHead = { md5: saveBoth('fix3b-phone-390-zero-head.png') };
  await browser.close();
}

const weekboardDiff = diffBbox(
  `${OUT}/fix3b-phone-weekboard-head.png`,
  `${OUT}/fix3b-phone-weekboard-main.png`,
);
report.phones.weekboardDiff = weekboardDiff;

for (const name of readdirSync(OUT).filter((f) => f.startsWith('fix3b-') && f.endsWith('.png'))) {
  report.md5s[name] = md5File(`${OUT}/${name}`);
}

console.log(JSON.stringify({
  headSha: process.env.HEAD_SHA,
  railCaps: { outerPx: RAIL_CAP_OUTER_PX, innerPx: RAIL_CAP_INNER_PX },
  report,
}, null, 2));
