import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1000, height: 200 },
  deviceScaleFactor: 2,
});
await page.goto(`${BASE}/look/wordmark-field-audit.svg`, { waitUntil: 'networkidle' });
await page.screenshot({
  path: 'public/look/wordmark-field-audit.png',
  type: 'png',
  omitBackground: false,
});
await browser.close();
console.log('wrote public/look/wordmark-field-audit.png');
