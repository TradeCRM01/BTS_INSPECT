import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT || 'docs/look';

mkdirSync(OUT, { recursive: true });

const pages = [
  { name: 'jobs', path: '/jobs?auditAuth=1&look=jobs-list', wait: '.hub-jobs-list-doc .hub-jobs-row' },
  { name: 'quotes', path: '/quotes?auditAuth=1', wait: '.hub-quotes-row' },
  { name: 'invoices', path: '/invoices?auditAuth=1', wait: '.hub-invoices-row' },
  { name: 'schedule-week', path: '/schedule?auditAuth=1&look=week-board', wait: '[data-week-board="1"], [data-phone-week-agenda="1"]' },
  { name: 'dashboard', path: '/?auditAuth=1&look=dashboard', wait: '[data-dashboard-widgets="1"]' },
];

const viewports = [
  { name: 'laptop-1280', width: 1280, height: 800 },
  { name: 'laptop-1440', width: 1440, height: 900 },
  { name: 'phone-390', width: 390, height: 844, isMobile: true },
  { name: 'phone-375', width: 375, height: 812, isMobile: true },
];

const browser = await chromium.launch({ headless: true });

for (const vp of viewports) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: !!vp.isMobile,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  for (const item of pages) {
    await page.goto(`${BASE}${item.path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(item.wait, { timeout: 25000, state: 'attached' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(350);
    const file = `${OUT}/polish-review-${item.name}-${vp.name}.png`;
    await page.screenshot({ path: file, fullPage: false });
    console.log(file);
  }
  await context.close();
}

await browser.close();
