import { mkdirSync, copyFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT_DIR || 'docs/look';
const ARTIFACTS = '/opt/cursor/artifacts';

mkdirSync(OUT, { recursive: true });
mkdirSync(ARTIFACTS, { recursive: true });

const browser = await chromium.launch({ headless: true });
const jobUrl = `${BASE}/jobs/audit-doc-job?auditAuth=1&look=crew2#job-schedule`;

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

async function openSchedulePeople(page) {
  await page.goto(jobUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-crew-assignment-helper="1"]', { timeout: 30000 });
  const tab = page.getByRole('button', { name: 'Schedule & people' });
  if (await tab.count()) await tab.click();
  await page.locator('#job-schedule').scrollIntoViewIfNeeded();
}

async function shot(page, name, tag) {
  const rel = `${OUT}/crew2-${name}-${tag}.png`;
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: rel, type: 'png' });
  copyFileSync(rel, `${ARTIFACTS}/crew2-${name}-${tag}.png`);
  console.log('wrote', rel);
}

for (const { w, tag } of [{ w: 375, tag: '375' }, { w: 390, tag: '390' }, { w: 1280, tag: '1280' }]) {
  const ctx = await contextFor(w);
  const page = await ctx.newPage();
  await openSchedulePeople(page);
  await shot(page, 'before-tap', tag);
  await ctx.close();
}

for (const { w, tag } of [{ w: 375, tag: '375' }, { w: 390, tag: '390' }, { w: 1280, tag: '1280' }]) {
  const ctx = await contextFor(w);
  const page = await ctx.newPage();
  await openSchedulePeople(page);
  await page.getByRole('button', { name: 'Grafter CoS Test' }).click();
  await page.waitForFunction(() => {
    const helper = document.querySelector('[data-crew-assignment-helper="1"]');
    return helper != null && helper.textContent?.includes('Grafter CoS Test');
  });
  await shot(page, 'after-tap', tag);
  await ctx.close();
}

for (const { w, tag } of [{ w: 375, tag: '375' }, { w: 390, tag: '390' }, { w: 1280, tag: '1280' }]) {
  const ctx = await contextFor(w);
  const page = await ctx.newPage();
  await openSchedulePeople(page);
  await page.evaluate(() => {
    const pick = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Grafter CoS Test');
    pick?.click();
  });
  await page.waitForFunction(() => document.querySelector('[data-crew-assignment-helper="1"]')?.textContent?.includes('Grafter CoS Test'));
  await page.evaluate(() => {
    const clear = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Clear crew');
    clear?.click();
  });
  await page.waitForFunction(() => {
    const helper = document.querySelector('[data-crew-assignment-helper="1"]');
    return helper != null && helper.textContent?.includes('Unassigned');
  });
  await shot(page, 'after-clear', tag);
  await ctx.close();
}

await browser.close();
