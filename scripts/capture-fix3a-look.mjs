// FIX-3a LOOK: phone unscheduled chip after full week + desktop parity frame.
// Run: node scripts/capture-fix3a-look.mjs (needs `npm run dev` on this branch).
// Main desktop compare: node scripts/capture-fix3a-look.mjs --main-1280
//   (uses week-board look — fix3a-schedule seed exists only on this branch).
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT_DIR || '/opt/cursor/artifacts';
const STORE = process.env.LOOK_STORE_DIR || '/cursor/stores/self/artifacts';
const mainOnly = process.argv.includes('--main-1280');
const PATH = mainOnly
  ? '/schedule?auditAuth=1&look=week-board'
  : '/schedule?auditAuth=1&look=fix3a-schedule';

mkdirSync(OUT, { recursive: true });
mkdirSync(STORE, { recursive: true });

function md5File(path) {
  return createHash('md5').update(readFileSync(path)).digest('hex');
}

function saveBoth(file) {
  const from = `${OUT}/${file}`;
  copyFileSync(from, `${STORE}/${file}`);
  return md5File(from);
}

const browser = await chromium.launch({ headless: true });

async function openPhone(width, height) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: 'en-AU',
    timezoneId: 'Australia/Brisbane',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${PATH}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-week-sheet="1"]', { timeout: 30000 });
  await page.waitForSelector('[data-schedule-unscheduled-chip="1"]', { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  return { ctx, page };
}

async function shot(page, file, opts = {}) {
  const { clip, ...rest } = opts;
  await page.screenshot({
    path: `${OUT}/${file}`,
    type: 'png',
    ...(clip ? { clip } : rest),
  });
  const md5 = saveBoth(file);
  console.log('wrote', file, md5);
  return md5;
}

async function captureDesktop1280(file) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    locale: 'en-AU',
    timezoneId: 'Australia/Brisbane',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${PATH}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-week-sheet="1"]', { timeout: 30000 });
  await page.waitForFunction(() => (
    [...document.querySelectorAll('[data-week-board="1"]')]
      .some((el) => el.getBoundingClientRect().width > 0)
  ), { timeout: 20000 });
  const layout = await page.evaluate(() => {
    const chip = document.querySelector('[data-schedule-unscheduled-chip="1"]');
    const rail = document.querySelector('[data-schedule-rail="1"]');
    const board = [...document.querySelectorAll('[data-week-board="1"]')]
      .find((el) => el.getBoundingClientRect().width > 0);
    const chipBox = chip?.getBoundingClientRect();
    const boardBox = board?.getBoundingClientRect();
    const railBox = rail?.getBoundingClientRect();
    return {
      chipVisible: !!chipBox && chipBox.width > 0 && chipBox.height > 0,
      railVisible: !!railBox && railBox.width > 0 && railBox.height > 0,
      boardWidth: boardBox?.width ?? 0,
      boardHeight: boardBox?.height ?? 0,
      viewportW: window.innerWidth,
    };
  });
  if (layout.viewportW !== 1280) throw new Error(`viewport not 1280: ${layout.viewportW}`);
  if (layout.chipVisible) throw new Error(`desktop chip visible ${JSON.stringify(layout)}`);
  if (!layout.railVisible && !mainOnly) throw new Error(`desktop rail missing ${JSON.stringify(layout)}`);
  if (layout.boardWidth < 600) throw new Error(`week board too narrow ${JSON.stringify(layout)}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const box = await page.locator('[data-week-sheet="1"]').boundingBox();
  if (!box) throw new Error('week sheet missing bounding box');
  const md5 = await shot(page, file, { clip: box });
  await ctx.close();
  return md5;
}

const md5s = {};

if (mainOnly) {
  md5s.desktop1280Main = await captureDesktop1280('fix3a-1280-main.png');
} else {
  {
    const { ctx, page } = await openPhone(375, 812);
    const booked = await page.evaluate(() => {
      const row = document.querySelector('[data-schedule-job="fix3a-booked-1"]');
      const chip = document.querySelector('[data-schedule-unscheduled-chip="1"]');
      const lastDay = [...document.querySelectorAll('[data-agenda-day]')].pop();
      if (!row || !chip || !lastDay) return { ok: false };
      const order = row.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING;
      const afterWeek = lastDay.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING;
      return { ok: order > 0 && afterWeek > 0 };
    });
    if (!booked.ok) throw new Error('375 DOM order: chip must follow booked rows and last day');
    md5s.collapsed375 = await shot(page, 'fix3a-collapsed-375.png', { fullPage: true });
    await ctx.close();
  }

  {
    const { ctx, page } = await openPhone(390, 844);
    md5s.collapsed390 = await shot(page, 'fix3a-collapsed-390.png', { fullPage: true });
    await ctx.close();
  }

  {
    const { ctx, page } = await openPhone(390, 844);
    await page.locator('[data-schedule-unscheduled-chip="1"]').click();
    await page.waitForSelector('[data-schedule-unscheduled-list="1"]', { timeout: 10000 });
    const row = await page.evaluate(() => {
      const card = document.querySelector('[data-schedule-rail-job="fix3a-unscheduled-1"]');
      return {
        client: card?.textContent?.includes('Valley Apartments') ?? false,
        title: card?.textContent?.includes('Leak under kitchen sink') ?? false,
      };
    });
    if (!row.client || !row.title) throw new Error(`390 expanded row fail ${JSON.stringify(row)}`);
    md5s.expanded390 = await shot(page, 'fix3a-expanded-390.png', { fullPage: true });
    await ctx.close();
  }

  md5s.desktop1280 = await captureDesktop1280('fix3a-1280.png');
}

await browser.close();

if (!mainOnly) {
  const unique = new Set(Object.values(md5s));
  if (unique.size !== Object.keys(md5s).length) {
    throw new Error(`duplicate frame md5s ${JSON.stringify(md5s)}`);
  }
}

console.log(JSON.stringify({ md5s, mainOnly, path: PATH }, null, 2));
