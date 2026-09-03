import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = 'docs/look';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function waitMark(page, sel) {
  await page.waitForSelector(sel, { timeout: 20000 });
  await page.waitForFunction((markSel) => {
    const img = document.querySelector(markSel);
    return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0;
  }, sel);
  await page.waitForTimeout(400);
}

async function openPaper(page, path, sel) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(sel, { timeout: 20000 });
  await waitMark(page, `${sel} .hub-letterhead-mark`);
}

const laptop = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
});
const page = await laptop.newPage();

await page.goto(`${BASE}/settings/company?look=letterhead`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.company-logo-strip-stage-img', { timeout: 20000 });
await waitMark(page, '.company-logo-strip-stage-img');
await page.locator('.company-logo-strip').scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/logo-strip-laptop-1280.png`, type: 'png' });

await openPaper(page, '/quotes?look=letterhead', '.hub-quote-sheet');
await page.screenshot({ path: `${OUT}/letterhead-quote-laptop-1280.png`, type: 'png' });

await openPaper(page, '/invoices?look=letterhead', '.hub-invoice-sheet');
await page.screenshot({ path: `${OUT}/letterhead-invoice-laptop-1280.png`, type: 'png' });
await laptop.close();

const printContext = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
});
const printPage = await printContext.newPage();
printPage.on('console', (msg) => {
  if (msg.type() === 'error') console.error('PAGE', msg.text());
});
printPage.on('pageerror', (err) => console.error('PAGEERROR', err.message));
await printPage.goto(`${BASE}/quotes?look=letterhead&print=1`, { waitUntil: 'domcontentloaded' });
await printPage.waitForSelector('iframe[title="Document PDF preview"]', { timeout: 45000 });
const pdfSrc = await printPage.locator('iframe[title="Document PDF preview"]').getAttribute('src');
const pdfBytes = await printPage.evaluate(async (src) => {
  const buf = await (await fetch(src)).arrayBuffer();
  return Array.from(new Uint8Array(buf));
}, pdfSrc);
const pdfPath = '/tmp/letterhead-quote.pdf';
writeFileSync(pdfPath, Buffer.from(pdfBytes));
const raster = spawnSync('python3', ['-c', `
import pymupdf
doc = pymupdf.open(${JSON.stringify(pdfPath)})
page = doc[0]
pix = page.get_pixmap(matrix=pymupdf.Matrix(1.6, 1.6), alpha=False)
pix.save(${JSON.stringify(`${OUT}/letterhead-quote-print.png`)})
print('pdf page', page.rect)
`], { encoding: 'utf8' });
if (raster.status !== 0) {
  console.error(raster.stdout, raster.stderr);
  throw new Error('PDF raster failed');
}
console.log(raster.stdout.trim());
await printContext.close();

await browser.close();
console.log('wrote letterhead LOOK frames');
