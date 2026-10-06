import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT_DIR || 'docs/look';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function capturePaymentSheet(width, tag) {
  const context = await browser.newContext({
    viewport: { width, height: width < 500 ? 844 : 900 },
    deviceScaleFactor: 1,
    locale: 'en-AU',
    isMobile: width < 500,
    hasTouch: width < 500,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/invoices?auditAuth=1&payment=1&id=audit-invoice-send`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hub-invoice-sheet', { timeout: 20000 });
  await page.getByRole('dialog', { name: 'Invoice' }).getByRole('button', { name: 'Record payment' }).click();
  await page.getByRole('dialog', { name: 'Record payment received' }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  const path = `${OUT}/money-4-record-payment-${tag}.png`;
  await page.screenshot({ path, type: 'png' });
  await context.close();
  console.log('wrote', path);
}

async function capturePartPaidList(width, tag) {
  const context = await browser.newContext({
    viewport: { width, height: width < 500 ? 844 : 900 },
    deviceScaleFactor: 1,
    locale: 'en-AU',
    isMobile: width < 500,
    hasTouch: width < 500,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/invoices?auditAuth=1&look=money-4-part-paid&id=audit-invoice-send`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hub-invoices-pill.is-part_paid', { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  const path = `${OUT}/money-4-part-paid-${tag}.png`;
  await page.screenshot({ path, type: 'png' });
  await context.close();
  console.log('wrote', path);
}

for (const { w, tag } of [
  { w: 375, tag: '375' },
  { w: 390, tag: '390' },
  { w: 1280, tag: '1280' },
]) {
  await capturePaymentSheet(w, tag);
  await capturePartPaidList(w, tag);
}

await browser.close();
