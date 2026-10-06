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

async function waitInvoiceListPartPaid(page) {
  await page.waitForSelector('.hub-invoices-row .hub-invoices-pill.is-part_paid', { timeout: 20000 });
  await page.waitForSelector('.hub-invoices-row .hub-invoices-paid-meta', { timeout: 20000 });
  await page.waitForFunction(() => {
    const meta = document.querySelector('.hub-invoices-paid-meta');
    return meta != null && /Paid/.test(meta.textContent ?? '') && /Balance/.test(meta.textContent ?? '');
  });
  const openSheet = await page.getByRole('dialog', { name: 'Invoice' }).count();
  if (openSheet > 0) throw new Error('Invoice sheet open — list frame must show hub-invoices-row only');
}

/** F1 — list row with Part paid pill + Paid · Balance (no id). */
for (const { w, tag } of [{ w: 390, tag: '390' }, { w: 1280, tag: '1280' }]) {
  const ctx = await contextFor(w);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/invoices?auditAuth=1&look=money-4-part-paid`, { waitUntil: 'domcontentloaded' });
  await waitInvoiceListPartPaid(page);
  await shot(page, `${OUT}/money-4-part-paid-list-${tag}.png`);
  await ctx.close();
}

/** F4 — invoice detail: chip + Paid to date / Balance due visible on phone widths. */
for (const { w, tag } of [{ w: 375, tag: '375' }, { w: 390, tag: '390' }]) {
  const ctx = await contextFor(w);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/invoices?auditAuth=1&look=money-4-part-paid&id=audit-invoice-send`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hub-invoice-sheet', { timeout: 20000 });
  await page.waitForSelector('.hub-invoice-paid-summary', { timeout: 20000 });
  await page.locator('.hub-invoice-sheet-chip').scrollIntoViewIfNeeded();
  await page.locator('.hub-invoice-balance-due').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const chip = document.querySelector('.hub-invoice-sheet-chip');
    const balance = document.querySelector('.hub-invoice-balance-due');
    if (!chip || !balance) return false;
    const r1 = chip.getBoundingClientRect();
    const r2 = balance.getBoundingClientRect();
    const h = window.innerHeight;
    return r1.top >= 0 && r1.bottom <= h && r2.top >= 0 && r2.bottom <= h;
  });
  await shot(page, `${OUT}/money-4-part-paid-${tag}.png`);
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

/** F3 — payments list + Remove in frame. */
const payList = await contextFor(1280);
const listPage = await payList.newPage();
await listPage.goto(`${BASE}/invoices?auditAuth=1&look=money-4-payments-list&id=audit-invoice-send`, { waitUntil: 'domcontentloaded' });
await listPage.waitForSelector('.hub-invoice-payments-list', { timeout: 20000 });
const paymentRow = listPage.locator('.hub-invoice-payments-list li').first();
await paymentRow.waitFor({ state: 'visible' });
await paymentRow.scrollIntoViewIfNeeded();
await listPage.getByRole('button', { name: 'Remove' }).scrollIntoViewIfNeeded();
await listPage.waitForFunction(() => {
  const list = document.querySelector('.hub-invoice-payments-list');
  if (!list) return false;
  const text = list.textContent ?? '';
  return text.includes('EFT-42') && text.includes('Remove') && /\d{2}\/\d{2}\/\d{4}/.test(text);
});
await shot(listPage, `${OUT}/money-4-payments-remove-1280.png`);
await payList.close();

/** F5 — invoices list with Part paid · Overdue chase row (no id). */
const chase = await contextFor(1280);
const chasePage = await chase.newPage();
await chasePage.goto(`${BASE}/invoices?auditAuth=1&look=money-4-part-paid-overdue`, { waitUntil: 'domcontentloaded' });
await waitInvoiceListPartPaid(chasePage);
await chasePage.waitForFunction(() => {
  const pill = document.querySelector('.hub-invoices-pill.is-part_paid');
  return pill != null && (pill.textContent ?? '').includes('Part paid · Overdue');
});
await shot(chasePage, `${OUT}/money-4-part-paid-overdue-chase-1280.png`);
await chase.close();

/** F2 — client portal invoice row with Part paid + Paid · Balance. */
const portal = await contextFor(390);
const portalPage = await portal.newPage();
await portalPage.goto(`${BASE}/p?auditAuth=1&look=money-4-portal-part-paid`, { waitUntil: 'domcontentloaded' });
await portalPage.waitForSelector('#client-portal', { timeout: 20000 });
const invoiceBlock = portalPage.locator('.portal-invoice-block').first();
await invoiceBlock.waitFor({ state: 'visible', timeout: 20000 });
await invoiceBlock.scrollIntoViewIfNeeded();
await portalPage.waitForFunction(() => {
  const block = document.querySelector('.portal-invoice-block');
  if (!block) return false;
  const text = block.textContent ?? '';
  return text.includes('Part paid') && /Paid \$200\.00/.test(text) && /Balance \$636\.00/.test(text);
});
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
