import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT_DIR || 'docs/look';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function contextFor(width) {
  return browser.newContext({
    viewport: { width, height: width < 500 ? 844 : 900 },
    deviceScaleFactor: 1,
    locale: 'en-AU',
    timezoneId: 'Australia/Perth',
    isMobile: width < 500,
    hasTouch: width < 500,
  });
}

async function shot(page, path) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path, type: 'png' });
  console.log('wrote', path);
}

for (const { w, tag } of [{ w: 390, tag: '390' }, { w: 1280, tag: '1280' }]) {
  const ctx = await contextFor(w);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/invoices?auditAuth=1&look=money-4-part-paid&id=audit-invoice-send`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hub-invoices-pill.is-part_paid', { timeout: 20000 });
  await shot(page, `${OUT}/money-4-part-paid-list-${tag}.png`);
  await ctx.close();
}

for (const { w, tag } of [{ w: 390, tag: '390' }, { w: 1280, tag: '1280' }]) {
  const ctx = await contextFor(w);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/invoices?auditAuth=1&payment=1&id=audit-invoice-send`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hub-invoice-sheet', { timeout: 20000 });
  await page.getByRole('dialog', { name: 'Invoice' }).getByRole('button', { name: 'Record payment' }).click();
  await page.getByRole('dialog', { name: 'Record payment received' }).waitFor();
  await shot(page, `${OUT}/money-4-record-payment-${tag}.png`);
  await ctx.close();
}

const overpay = await contextFor(390);
const overPage = await overpay.newPage();
await overPage.goto(`${BASE}/invoices?auditAuth=1&payment=1&id=audit-invoice-send`, { waitUntil: 'domcontentloaded' });
await overPage.waitForSelector('.hub-invoice-sheet', { timeout: 20000 });
await overPage.getByRole('dialog', { name: 'Invoice' }).getByRole('button', { name: 'Record payment' }).click();
await overPage.getByLabel('Payment amount').fill('900');
await overPage.waitForSelector('.hub-invoice-payment-overpay', { timeout: 10000 });
await shot(overPage, `${OUT}/money-4-overpay-warning-390.png`);
await overpay.close();

const payList = await contextFor(1280);
const listPage = await payList.newPage();
await listPage.goto(`${BASE}/invoices?auditAuth=1&look=money-4-payments-list&id=audit-invoice-send`, { waitUntil: 'domcontentloaded' });
await listPage.waitForSelector('.hub-invoice-payments-list', { timeout: 20000 });
await shot(listPage, `${OUT}/money-4-payments-remove-1280.png`);
await payList.close();

const chase = await contextFor(1280);
const chasePage = await chase.newPage();
await chasePage.goto(`${BASE}/invoices?auditAuth=1&look=money-4-part-paid-overdue&id=audit-invoice-send`, { waitUntil: 'domcontentloaded' });
await chasePage.waitForSelector('.hub-invoices-pill.is-part_paid', { timeout: 20000 });
await shot(chasePage, `${OUT}/money-4-part-paid-overdue-chase-1280.png`);
await chase.close();

const portal = await contextFor(390);
const portalPage = await portal.newPage();
await portalPage.goto(`${BASE}/portal/audit-token?auditAuth=1&look=money-4-portal-part-paid`, { waitUntil: 'domcontentloaded' });
await portalPage.waitForSelector('#client-portal', { timeout: 20000 }).catch(() => null);
await shot(portalPage, `${OUT}/money-4-portal-part-paid-390.png`);
await portal.close();

const pdfCtx = await contextFor(1280);
const pdfPage = await pdfCtx.newPage();
await pdfPage.goto(
  `${BASE}/invoices?auditAuth=1&look=money-4-payments-list&id=audit-invoice-send&print=1`,
  { waitUntil: 'domcontentloaded' },
);
await pdfPage.waitForSelector('iframe[title="Document PDF preview"]', { timeout: 45000 });
const pdfSrc = await pdfPage.locator('iframe[title="Document PDF preview"]').getAttribute('src');
const pdfBytes = await pdfPage.evaluate(async (src) => {
  const buf = await (await fetch(src)).arrayBuffer();
  return Array.from(new Uint8Array(buf));
}, pdfSrc);
const pdfPath = '/tmp/money-4-invoice-payments.pdf';
writeFileSync(pdfPath, Buffer.from(pdfBytes));
const outPdfPng = `${OUT}/money-4-pdf-payments-1280.png`;
const raster = spawnSync(
  'python3',
  [
    '-c',
    `
import pymupdf
doc = pymupdf.open(${JSON.stringify(pdfPath)})
page = doc[0]
# Fit ~1280 CSS px width (794pt page × ~1.61)
pix = page.get_pixmap(matrix=pymupdf.Matrix(1.61, 1.61), alpha=False)
pix.save(${JSON.stringify(outPdfPng)})
print('pdf page', page.rect)
`,
  ],
  { encoding: 'utf8' },
);
if (raster.status !== 0) {
  console.error(raster.stdout, raster.stderr);
  throw new Error('money-4 PDF raster failed');
}
console.log('wrote', outPdfPng, raster.stdout.trim());
await pdfCtx.close();

await browser.close();
