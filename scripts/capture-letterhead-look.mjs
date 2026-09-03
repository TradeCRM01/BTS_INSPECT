import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = 'docs/look';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function openPaper(page, path, sel) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector(sel, { timeout: 20000 });
  await page.waitForSelector(`${sel} .hub-letterhead-mark`, { timeout: 20000 });
  await page.waitForFunction((markSel) => {
    const img = document.querySelector(markSel);
    return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0;
  }, `${sel} .hub-letterhead-mark`);
  await page.waitForTimeout(400);
}

async function captureViewport(viewport, frames) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  for (const frame of frames) {
    await openPaper(page, frame.path, frame.sel);
    await page.screenshot({ path: `${OUT}/${frame.file}`, type: 'png' });
  }
  await context.close();
}

await captureViewport({ width: 1280, height: 900 }, [
  { path: '/quotes?look=letterhead', sel: '.hub-quote-sheet', file: 'letterhead-quote-laptop-1280.png' },
  { path: '/invoices?look=letterhead', sel: '.hub-invoice-sheet', file: 'letterhead-invoice-laptop-1280.png' },
]);

await captureViewport({ width: 390, height: 844 }, [
  { path: '/quotes?look=letterhead', sel: '.hub-quote-sheet', file: 'letterhead-quote-phone-390.png' },
  { path: '/invoices?look=letterhead', sel: '.hub-invoice-sheet', file: 'letterhead-invoice-phone-390.png' },
]);

const printContext = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
});
const printPage = await printContext.newPage();
printPage.on('console', (msg) => {
  if (msg.type() === 'error') console.error('PAGE', msg.text());
});
printPage.on('pageerror', (err) => console.error('PAGEERROR', err.message));
await printPage.goto(`${BASE}/quotes?look=letterhead&print=1`, { waitUntil: 'networkidle' });
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
