import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = 'docs/look';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

async function waitPaper(sel) {
  await page.waitForSelector(sel, { timeout: 20000 });
  await page.waitForSelector(`${sel} .hub-letterhead-mark`, { timeout: 20000 });
  await page.waitForFunction((markSel) => {
    const img = document.querySelector(markSel);
    return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0;
  }, `${sel} .hub-letterhead-mark`);
  await page.waitForTimeout(400);
}

await page.goto(`${BASE}/quotes?look=letterhead`, { waitUntil: 'networkidle' });
await waitPaper('.hub-quote-sheet');
await page.screenshot({
  path: `${OUT}/letterhead-quote-laptop-1280.png`,
  type: 'png',
});

await page.goto(`${BASE}/invoices?look=letterhead`, { waitUntil: 'networkidle' });
await waitPaper('.hub-invoice-sheet');
await page.screenshot({
  path: `${OUT}/letterhead-invoice-laptop-1280.png`,
  type: 'png',
});

await page.goto(`${BASE}/quotes?look=letterhead&print=1`, { waitUntil: 'networkidle' });
await page.waitForSelector('iframe[title="Document PDF preview"]', { timeout: 30000 });
await page.waitForTimeout(1200);
await page.screenshot({
  path: `${OUT}/letterhead-quote-print.png`,
  type: 'png',
});

await browser.close();
console.log('wrote letterhead LOOK frames');
