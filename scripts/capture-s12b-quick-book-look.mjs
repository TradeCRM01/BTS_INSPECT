import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT_DIR || 'docs/look';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function contextFor(width) {
  return browser.newContext({
    viewport: { width, height: width < 500 ? 844 : 900 },
    deviceScaleFactor: 1,
    locale: 'en-AU',
    timezoneId: 'Australia/Perth',
    isMobile: width < 500,
    hasTouch: width < 500,
  });
}

async function shot(page, path) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path, type: 'png' });
  console.log('wrote', path);
}

async function openSchedule(page) {
  await page.goto(`${BASE}/schedule?auditAuth=1&look=week-board`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-schedule-voice="1"]', { timeout: 30000 });
}

for (const { w, tag } of [{ w: 375, tag: '375' }, { w: 390, tag: '390' }, { w: 1280, tag: '1280' }]) {
  const ctx = await contextFor(w);
  const page = await ctx.newPage();
  await openSchedule(page);
  const input = page.locator('#hub-schedule-voice-text');
  await input.fill('Roof leak, Nguyen, 1 Apr noon');
  await page.locator('.hub-schedule-voice-go').click();
  await page.waitForSelector('.hub-schedule-voice-new', { timeout: 15000 });
  await shot(page, `${OUT}/s12b-quick-book-unmatched-${tag}.png`);
  await ctx.close();
}

for (const { w, tag } of [{ w: 375, tag: '375' }, { w: 390, tag: '390' }, { w: 1280, tag: '1280' }]) {
  const ctx = await contextFor(w);
  const page = await ctx.newPage();
  await openSchedule(page);
  const input = page.locator('#hub-schedule-voice-text');
  await input.fill('Roof leak, Nguyen, 1 Apr noon');
  await page.locator('.hub-schedule-voice-go').click();
  await page.getByRole('button', { name: 'New job from this' }).click();
  await page.getByRole('heading', { name: 'New Job' }).waitFor({ timeout: 15000 });
  await shot(page, `${OUT}/s12b-quick-book-new-job-form-${tag}.png`);
  await ctx.close();
}

for (const { w, tag } of [{ w: 375, tag: '375' }, { w: 390, tag: '390' }, { w: 1280, tag: '1280' }]) {
  const ctx = await contextFor(w);
  const page = await ctx.newPage();
  await openSchedule(page);
  const input = page.locator('#hub-schedule-voice-text');
  await input.fill('Hot water, 1 Apr 8am, Sam');
  await page.locator('.hub-schedule-voice-go').click();
  await page.waitForSelector('.hub-schedule-sheet-new-instead', { timeout: 15000 });
  await shot(page, `${OUT}/s12b-quick-book-matched-instead-${tag}.png`);
  await ctx.close();
}

await browser.close();
