// B3 LOOK — new invoice opens in edit; existing opens in view.
// Run: node scripts/capture-b3-invoice-edit-mode-look.mjs (needs `npm run dev`).
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT_DIR || 'artifacts';

mkdirSync(OUT, { recursive: true });

const AUDIT = '/invoices?auditAuth=1';
const CLIENT = 'audit-doc-client';

const browser = await chromium.launch({
  headless: true,
  ...(process.env.LOOK_BROWSER_CHANNEL ? { channel: process.env.LOOK_BROWSER_CHANNEL } : {}),
});

const widths = [
  { w: 375, tag: '375' },
  { w: 390, tag: '390' },
  { w: 1280, tag: '1280' },
];

async function waitList(page) {
  await page.waitForSelector('.hub-invoices-row, .hub-invoices-sheet .btn-primary', { timeout: 20000 });
}

async function waitEditOpen(page) {
  await page.waitForSelector('.hub-invoice-edit', { timeout: 20000 });
  await page.waitForSelector('.hub-invoice-edit select.form-input', { timeout: 20000 });
}

async function waitViewOpen(page) {
  await page.waitForSelector('.hub-invoice-sheet', { timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector('.hub-invoice-edit'));
}

async function shot(name, viewport, setup) {
  const context = await browser.newContext({
    viewport: { width: viewport.w, height: viewport.w <= 400 ? 844 : 900 },
    deviceScaleFactor: 1,
    locale: 'en-AU',
    ...(viewport.w <= 400 ? { isMobile: true, hasTouch: true } : {}),
  });
  const page = await context.newPage();
  await page.goto(`${BASE}${AUDIT}`, { waitUntil: 'domcontentloaded' });
  await waitList(page);
  await setup(page);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  const path = `${OUT}/b3-invoice-${name}-${viewport.tag}.png`;
  await page.screenshot({ path, type: 'png' });
  await context.close();
  return path;
}

for (const viewport of widths) {
  await shot('new-from-list', viewport, async (page) => {
    await page.getByRole('button', { name: /New invoice/i }).first().click();
    await waitEditOpen(page);
  });

  await shot('new-from-client', viewport, async (page) => {
    await page.goto(`${BASE}${AUDIT}&client=${CLIENT}`, { waitUntil: 'domcontentloaded' });
    await waitEditOpen(page);
  });

  await shot('existing-view', viewport, async (page) => {
    const row = page.locator('.hub-invoices-row').first();
    await row.click();
    await waitViewOpen(page);
  });
}

await browser.close();
console.log(`wrote B3 invoice edit-mode frames under ${OUT}/`);
