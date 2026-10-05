import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.STEP4_OUT || '/opt/cursor/artifacts';
const HARNESS = '/quotes?auditAuth=1&status=chase';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(process.env.LOOK_BROWSER_CHANNEL ? { channel: process.env.LOOK_BROWSER_CHANNEL } : {}),
});

async function openChase(page) {
  await page.goto(`${BASE}${HARNESS}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hub-quotes-sheet .hub-quotes-row', { timeout: 20000 });
  await page.waitForFunction(() => {
    const filters = [...document.querySelectorAll('.hub-quotes-filters .hub-chrome-filter')];
    const chase = filters.find((el) => (el.textContent ?? '').startsWith('Chase'));
    return chase?.textContent?.includes('Chase ·') && !chase.textContent.includes('Chase · 0');
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

const laptop = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
  locale: 'en-AU',
});
const laptopPage = await laptop.newPage();
await openChase(laptopPage);
await laptopPage.screenshot({ path: `${OUT}/step4-chase-list-laptop-1280.png`, type: 'png' });
await laptopPage.locator('.hub-quotes-chase').first().click();
await laptopPage.waitForSelector('.hub-quote-chase-preview', { timeout: 15000 });
await laptopPage.waitForTimeout(300);
await laptopPage.screenshot({ path: `${OUT}/step4-chase-dialog-laptop-1280.png`, type: 'png' });
await laptop.close();

const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  locale: 'en-AU',
});
const phonePage = await phone.newPage();
await openChase(phonePage);
await phonePage.screenshot({ path: `${OUT}/step4-chase-list-phone-390.png`, type: 'png' });
await phonePage.locator('.hub-quotes-chase').first().click();
await phonePage.waitForSelector('.hub-quote-chase-preview', { timeout: 15000 });
await phonePage.waitForTimeout(300);
await phonePage.screenshot({ path: `${OUT}/step4-chase-dialog-phone-390.png`, type: 'png' });
await phone.close();

await browser.close();
console.log('wrote step4 LOOK frames to', OUT);
