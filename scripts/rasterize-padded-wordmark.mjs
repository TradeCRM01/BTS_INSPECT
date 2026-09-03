import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
});
await page.goto(`${BASE}/look/wordmark-padded-field-audit.svg`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(200);
await page.screenshot({
  path: 'public/look/wordmark-padded-field-audit.png',
  type: 'png',
  omitBackground: false,
});
await browser.close();
console.log('wrote public/look/wordmark-padded-field-audit.png');
