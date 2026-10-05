import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.P303_OUT || '/opt/cursor/artifacts';
const HARNESS = '/p?auditAuth=1';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(process.env.LOOK_BROWSER_CHANNEL ? { channel: process.env.LOOK_BROWSER_CHANNEL } : {}),
});

async function openPortal(page) {
  await page.goto(`${BASE}${HARNESS}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-quote-id="audit-quote-10"]', { timeout: 20000 });
  await page.waitForSelector('[data-quote-id="audit-quote-42"] .portal-quote-accept', { timeout: 15000 });
  await page.waitForSelector('[data-quote-id="audit-quote-10"] .portal-quote-lapsed', { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

async function shoot(width, height, isMobile, suffix) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile,
    hasTouch: isMobile,
    locale: 'en-AU',
  });
  const page = await ctx.newPage();
  await openPortal(page);
  await page.locator('[data-quote-id="audit-quote-10"]').screenshot({
    path: `${OUT}/p303-lapsed-${suffix}.png`,
    type: 'png',
  });
  await page.locator('[data-quote-id="audit-quote-42"]').screenshot({
    path: `${OUT}/p303-valid-${suffix}.png`,
    type: 'png',
  });
  await ctx.close();
}

await shoot(1280, 900, false, 'laptop-1280');
await shoot(390, 844, true, 'phone-390');
await browser.close();
console.log('wrote p303 LOOK frames to', OUT);
