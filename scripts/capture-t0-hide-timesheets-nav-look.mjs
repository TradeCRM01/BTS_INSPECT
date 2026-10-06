import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT_DIR || 'docs/look';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function openFinancialsMenu(page, width) {
  await page.goto(`${BASE}/?auditAuth=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.querySelector('.ops-page-title')?.textContent === 'Dashboard',
    null,
    { timeout: 20000 },
  );
  if (width < 500) {
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('button', { name: 'Financials' }).click();
  } else {
    await page.getByRole('button', { name: 'Financials' }).click();
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

async function captureNav(width, tag) {
  const context = await browser.newContext({
    viewport: { width, height: width < 500 ? 844 : 900 },
    deviceScaleFactor: 1,
    locale: 'en-AU',
    isMobile: width < 500,
    hasTouch: width < 500,
  });
  const page = await context.newPage();
  await openFinancialsMenu(page, width);
  const path = `${OUT}/t0-nav-financials-${tag}.png`;
  await page.screenshot({ path, type: 'png' });
  await context.close();
  console.log('wrote', path);
}

for (const { w, tag } of [
  { w: 375, tag: '375' },
  { w: 390, tag: '390' },
  { w: 1280, tag: '1280' },
]) {
  await captureNav(w, tag);
}

const direct = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
  locale: 'en-AU',
});
const directPage = await direct.newPage();
await directPage.goto(`${BASE}/timesheets?auditAuth=1`, { waitUntil: 'domcontentloaded' });
await directPage.waitForFunction(
  () => document.querySelector('.hub-timesheets .ops-page-title')?.textContent === 'Timesheets',
  null,
  { timeout: 20000 },
);
await directPage.evaluate(() => document.fonts.ready);
await directPage.waitForTimeout(400);
const directPath = `${OUT}/t0-timesheets-direct-1280.png`;
await directPage.screenshot({ path: directPath, type: 'png' });
console.log('wrote', directPath);
await direct.close();

await browser.close();
