// FIX-3a LOOK: phone unscheduled chip + unchanged desktop week board.
// Run: node scripts/capture-fix3a-look.mjs (needs `npm run dev`).
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT_DIR || '/opt/cursor/artifacts';
const STORE = process.env.LOOK_STORE_DIR || '/cursor/stores/self/artifacts';
const PATH = '/schedule?auditAuth=1&look=fix3a-schedule';

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

async function openPage(width, height, isPhone) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: isPhone,
    hasTouch: isPhone,
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

async function shot(page, file) {
  await page.screenshot({ path: `${OUT}/${file}`, type: 'png' });
  const md5 = saveBoth(file);
  console.log('wrote', file, md5);
  return md5;
}

const md5s = {};

{
  const { ctx, page } = await openPage(375, 812, true);
  const chip = await page.evaluate(() => {
    const el = document.querySelector('[data-schedule-unscheduled-chip="1"]');
    const box = el?.getBoundingClientRect();
    return {
      label: el?.textContent?.trim() ?? null,
      height: box?.height ?? 0,
      clipped: el ? el.scrollWidth > el.clientWidth + 1 : true,
    };
  });
  if (chip.label !== 'Unscheduled · 17' || chip.height < 44 || chip.clipped) {
    throw new Error(`375 chip fail ${JSON.stringify(chip)}`);
  }
  const listVisible = await page.locator('[data-schedule-unscheduled-list="1"]').count();
  if (listVisible !== 0) throw new Error('375 should be collapsed');
  md5s.collapsed375 = await shot(page, 'fix3a-collapsed-375.png');
  await ctx.close();
}

{
  const { ctx, page } = await openPage(390, 844, true);
  md5s.collapsed390 = await shot(page, 'fix3a-collapsed-390.png');
  await ctx.close();
}

{
  const { ctx, page } = await openPage(390, 844, true);
  await page.locator('[data-schedule-unscheduled-chip="1"]').click();
  await page.waitForSelector('[data-schedule-unscheduled-list="1"]', { timeout: 10000 });
  const row = await page.evaluate(() => {
    const card = document.querySelector('[data-schedule-rail-job="fix3a-unscheduled-1"]');
    return {
      client: card?.textContent?.includes('Northside Body Corp') ?? false,
      title: card?.textContent?.includes('Callback 1') ?? false,
    };
  });
  if (!row.client || !row.title) throw new Error(`390 expanded row fail ${JSON.stringify(row)}`);
  md5s.expanded390 = await shot(page, 'fix3a-expanded-390.png');
  await ctx.close();
}

{
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
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
    const chipBox = chip?.getBoundingClientRect();
    const railBox = rail?.getBoundingClientRect();
    return {
      chipVisible: !!chipBox && chipBox.width > 0 && chipBox.height > 0,
      railVisible: !!railBox && railBox.width > 0 && railBox.height > 0,
    };
  });
  if (layout.chipVisible || !layout.railVisible) {
    throw new Error(`1280 layout fail ${JSON.stringify(layout)}`);
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  md5s.desktop1280 = await shot(page, 'fix3a-1280.png');
  await ctx.close();
}

await browser.close();

const unique = new Set(Object.values(md5s));
if (unique.size !== Object.keys(md5s).length) {
  throw new Error(`duplicate frame md5s ${JSON.stringify(md5s)}`);
}

console.log(JSON.stringify({ md5s }, null, 2));
