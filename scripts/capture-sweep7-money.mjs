import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT_DIR || '/opt/cursor/artifacts/sweep7-money';
const TAG = process.env.LOOK_TAG || 'after';

mkdirSync(OUT, { recursive: true });

const widths = [
  { w: 375, h: 812, tag: '375' },
  { w: 390, h: 844, tag: '390' },
  { w: 1280, h: 800, tag: '1280' },
];

const browser = await chromium.launch({ headless: true });

async function contextFor(width, height) {
  return browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale: 'en-AU',
    timezoneId: 'Australia/Perth',
    isMobile: width < 500,
    hasTouch: width < 500,
  });
}

async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  const path = `${OUT}/${TAG}-${name}.png`;
  await page.screenshot({ path, type: 'png' });
  console.log('wrote', path);
}

async function fillCentsLines(page) {
  const rows = [
    { desc: 'Labour', qty: '2.5', price: '41.535' },
    { desc: 'Fitting', qty: '3.3', price: '31.466' },
    { desc: 'Consumables', qty: '4.7', price: '22.093' },
  ];
  for (const row of rows) {
    const add = page.getByRole('button', { name: /add (a )?line|add manual|add item/i }).first();
    if (await add.count()) await add.click();
    const desc = page.getByLabel('Description').last();
    await desc.waitFor({ timeout: 8000 });
    await desc.fill(row.desc);
    await page.getByLabel('Quantity').last().fill(row.qty);
    await page.getByLabel('Unit price').last().fill(row.price);
  }
}

for (const { w, h, tag } of widths) {
  const ctx = await contextFor(w, h);
  const page = await ctx.newPage();
  const quoteUrl = TAG === 'after'
    ? `${BASE}/quotes?id=audit-quote-cents&auditAuth=1`
    : `${BASE}/quotes?auditAuth=1`;
  await page.goto(quoteUrl, { waitUntil: 'domcontentloaded' });
  if (TAG === 'before') {
    await page.getByRole('button', { name: /new quote/i }).click();
    await page.waitForSelector('.hub-line-editor-sheet, [data-quote-lines]', { timeout: 20000 });
    await fillCentsLines(page);
  } else {
    await page.waitForSelector('.hub-quote-gst, .hub-line-editor-sheet', { timeout: 20000 });
  }
  const gst = page.locator('.hub-quote-gst, .hub-quote-editor-math').first();
  if (await gst.count()) await gst.scrollIntoViewIfNeeded();
  await shot(page, `quote-editor-${tag}`);
  await ctx.close();
}

for (const { w, h, tag } of widths) {
  const ctx = await contextFor(w, h);
  const page = await ctx.newPage();
  if (TAG === 'after') {
    await page.goto(`${BASE}/quotes?id=audit-quote-cents&auditAuth=1&print=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('iframe[title="Document PDF preview"]', { timeout: 25000 });
    await page.waitForTimeout(6000);
  } else {
    await page.goto(`${BASE}/quotes?auditAuth=1`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /new quote/i }).click();
    await page.waitForSelector('.hub-line-editor-sheet, [data-quote-lines]', { timeout: 20000 });
    await fillCentsLines(page);
    const more = page.getByLabel('More actions');
    if (await more.count()) {
      await more.click();
      await page.getByRole('menuitem', { name: /preview pdf/i }).click();
    }
    await page.waitForTimeout(800);
  }
  await shot(page, `quote-preview-${tag}`);
  await ctx.close();
}

for (const { w, h, tag } of widths) {
  const ctx = await contextFor(w, h);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/invoices?auditAuth=1&payment=1&id=audit-invoice-send`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hub-invoice-sheet', { timeout: 20000 });
  await page.locator('.hub-editor-sticky-save').filter({ hasText: 'Record payment' }).click();
  const dialog = page.getByRole('dialog', { name: 'Record payment received' });
  await dialog.waitFor();
  const amount = page.getByLabel('Payment amount');
  await amount.fill('');
  await amount.pressSequentially('1,250', { delay: 80 });
  await shot(page, `record-payment-1250-${tag}`);
  await amount.fill('900');
  await page.waitForTimeout(200);
  await shot(page, `record-payment-overpay-${tag}`);
  await ctx.close();
}

await browser.close();
console.log('done', TAG, OUT);
