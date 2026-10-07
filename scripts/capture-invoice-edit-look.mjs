import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const DOC_OUT = 'docs/look';
const ART_OUT = '/opt/cursor/artifacts';
const PROOFS_OUT = '/workspace/grafter-proofs/invoice-edit';

mkdirSync(DOC_OUT, { recursive: true });
mkdirSync(ART_OUT, { recursive: true });
mkdirSync(PROOFS_OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function openInvoices(page, query) {
  await page.goto(`${BASE}/invoices?auditAuth=1${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hub-invoices-row, .hub-invoices-sheet .btn-primary', { timeout: 25000 });
}

async function waitView(page) {
  await page.waitForSelector('.hub-invoice-sheet', { timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector('.hub-invoice-edit'));
  await page.waitForSelector('[data-invoice-view-footer="1"]', { timeout: 20000 });
}

async function waitEdit(page) {
  await page.waitForSelector('.hub-invoice-edit', { timeout: 20000 });
  await page.waitForSelector('[data-editor-sticky-footer="1"]', { timeout: 20000 });
}

function saveAll(name) {
  for (const dir of [ART_OUT, PROOFS_OUT]) {
    copyFileSync(`${DOC_OUT}/${name}`, `${dir}/${name}`);
  }
  console.log('wrote', `${DOC_OUT}/${name}`);
}

async function capture(width, tag, setup) {
  const ctx = await browser.newContext({
    viewport: { width, height: width <= 400 ? 844 : 900 },
    deviceScaleFactor: 1,
    isMobile: width <= 400,
    hasTouch: width <= 400,
    locale: 'en-AU',
    timezoneId: 'Australia/Perth',
  });
  const page = await ctx.newPage();
  await setup(page);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const name = `invoice-edit-${tag}-${width}.png`;
  await page.screenshot({ path: `${DOC_OUT}/${name}`, type: 'png', fullPage: true });
  saveAll(name);
  await ctx.close();
}

for (const w of [375, 390, 1280]) {
  await capture(w, 'view', async (page) => {
    await openInvoices(page, '');
    await page.locator('.hub-invoices-row').first().click();
    await waitView(page);
  });

  await capture(w, 'edit', async (page) => {
    await openInvoices(page, '&look=invoice-edit-edit');
    await page.getByRole('button', { name: /New invoice/i }).first().click();
    await waitEdit(page);
  });
}

await capture(1280, 'paid-footer', async (page) => {
  await openInvoices(page, `&id=${encodeURIComponent('audit-invoice-gst')}&look=invoice-edit-paid`);
  await waitView(page);
});

{
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'en-AU',
    timezoneId: 'Australia/Perth',
  });
  const page = await ctx.newPage();
  await openInvoices(page, `&id=${encodeURIComponent('audit-invoice-gst')}&look=invoice-edit-pdf`);
  await page.waitForSelector('iframe[title="Document PDF preview"]', { timeout: 45000 });
  const pdfSrc = await page.locator('iframe[title="Document PDF preview"]').getAttribute('src');
  const pdfBytes = await page.evaluate(async (src) => {
    const buf = await (await fetch(src)).arrayBuffer();
    return Array.from(new Uint8Array(buf));
  }, pdfSrc);
  const pdfPath = '/tmp/invoice-edit-gst.pdf';
  writeFileSync(pdfPath, Buffer.from(pdfBytes));
  const name = 'invoice-edit-pdf-line-1280.png';
  const outPath = `${DOC_OUT}/${name}`;
  const raster = spawnSync(
    'python3',
    [
      '-c',
      `
import pymupdf
doc = pymupdf.open(${JSON.stringify(pdfPath)})
page = doc[0]
pix = page.get_pixmap(matrix=pymupdf.Matrix(1.61, 1.61), alpha=False)
pix.save(${JSON.stringify(outPath)})
text = page.get_text()
assert 'Taxed labour' in text, text
assert 'PB-DEL-01' not in text, text
print('pdf text ok')
`,
    ],
    { encoding: 'utf8' },
  );
  if (raster.status !== 0) {
    console.error(raster.stdout, raster.stderr);
    throw new Error('invoice-edit PDF raster failed');
  }
  saveAll(name);
  await ctx.close();
}

await browser.close();
console.log('invoice-edit LOOK capture done');
