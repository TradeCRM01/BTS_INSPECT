import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = 'docs/look';
const HARNESS = '/invoices?auditAuth=1&payment=1&id=audit-invoice-send';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(process.env.LOOK_BROWSER_CHANNEL ? { channel: process.env.LOOK_BROWSER_CHANNEL } : {}),
});

async function provePayment(page, screenshotPath) {
  await page.goto(`${BASE}${HARNESS}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hub-invoice-sheet', { timeout: 20000 });
  await page.getByRole('button', { name: 'Record payment' }).click();
  const dialog = page.getByRole('dialog', { name: 'Record payment received' });
  await dialog.waitFor();

  const before = await page.evaluate(() => {
    const text = document.querySelector('.hub-invoice-payment-confirm')?.textContent ?? '';
    const status = document.querySelector('.hub-invoice-banner-meta')?.textContent?.trim() ?? '';
    const total = document.querySelector('.hub-invoice-display-total')?.textContent?.trim() ?? '';
    return { status, total, dialog: text.replace(/\s+/g, ' ').trim() };
  });

  await page.screenshot({ path: screenshotPath, type: 'png' });
  await dialog.getByRole('button', { name: 'Confirm payment received' }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('.hub-invoice-banner-meta')?.textContent?.includes('Paid'));

  const after = await page.evaluate(() => ({
    status: document.querySelector('.hub-invoice-banner-meta')?.textContent?.trim() ?? '',
    total: document.querySelector('.hub-invoice-display-total')?.textContent?.trim() ?? '',
    toast: document.querySelector('[role="status"]')?.textContent?.trim() ?? '',
  }));

  return { before, after };
}

const laptop = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
  locale: 'en-AU',
});
const laptopProof = await provePayment(
  await laptop.newPage(),
  `${OUT}/mark-paid-laptop-1280.png`,
);
await laptop.close();

const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  locale: 'en-AU',
});
const phoneProof = await provePayment(
  await phone.newPage(),
  `${OUT}/mark-paid-phone-390.png`,
);
await phone.close();

await browser.close();
console.log(JSON.stringify({ laptop: laptopProof, phone: phoneProof }, null, 2));
