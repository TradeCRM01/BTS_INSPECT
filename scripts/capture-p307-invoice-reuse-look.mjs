// LOOK + FUNCTION proof for P-307 — completed list/sheet agree, reuse open+toast,
// quote Invoice becomes Open invoice after any-source invoice.
// Run: node scripts/capture-p307-invoice-reuse-look.mjs (needs `npm run dev`).
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT_DIR || '/opt/cursor/artifacts';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(process.env.LOOK_BROWSER_CHANNEL ? { channel: process.env.LOOK_BROWSER_CHANNEL } : {}),
});

const laptop = { viewport: { width: 1280, height: 900 } };
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

async function shot(contextOptions, path, href, wait) {
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    locale: 'en-AU',
    ...contextOptions,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
  await wait(page);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  await page.screenshot({ path, type: 'png' });
  await context.close();
}

async function waitJobsList(page) {
  await page.waitForSelector('.hub-jobs-list-doc .hub-jobs-row', { timeout: 20000 });
  await page.waitForFunction(() => {
    const rows = [...document.querySelectorAll('.hub-jobs-list-doc .hub-jobs-row')];
    return rows.some(row => row.textContent?.includes('Hot water swap'))
      && rows.some(row => row.querySelector('[data-job-list-next="Invoice"]'));
  });
}

async function waitSheetInvoice(page) {
  await page.waitForSelector('.hub-jobs-document [data-job-next-detail]', { timeout: 20000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-job-next-detail]');
    const btn = document.querySelector('.hub-jobs-tools .btn-primary');
    return el?.textContent?.includes('Draft invoice from the job bill')
      && btn?.textContent?.includes('Invoice')
      && !btn?.textContent?.includes('Assign crew');
  });
}

async function waitReuseOpen(page) {
  await waitSheetInvoice(page);
  await page.click('.hub-jobs-tools .btn-primary');
  await page.waitForSelector('.hub-invoice-sheet', { timeout: 20000 });
  await page.waitForFunction(() =>
    [...document.querySelectorAll('p')].some(p =>
      p.textContent === 'Opened the invoice already on this job',
    ),
  );
}

async function waitQuotedOpenInvoice(page) {
  await page.waitForSelector('#job-quotes', { timeout: 20000 });
  await page.waitForFunction(() => {
    const quotes = document.querySelector('#job-quotes');
    return quotes?.textContent?.includes('Quote #0002')
      && quotes?.textContent?.includes('Open invoice')
      && !quotes?.textContent?.includes('Invoice this');
  });
  const quotes = page.locator('#job-quotes');
  await quotes.scrollIntoViewIfNeeded();
}

await shot(laptop, `${OUT}/p307-list-agree-1280.png`, '/jobs?auditAuth=1&look=p307', waitJobsList);
await shot(phone, `${OUT}/p307-list-agree-390.png`, '/jobs?auditAuth=1&look=p307', waitJobsList);
await shot(
  laptop,
  `${OUT}/p307-sheet-agree-1280.png`,
  '/jobs/look-job-p307?auditAuth=1&look=p307&tab=paperwork',
  waitSheetInvoice,
);
await shot(
  phone,
  `${OUT}/p307-sheet-agree-390.png`,
  '/jobs/look-job-p307?auditAuth=1&look=p307&tab=paperwork',
  waitSheetInvoice,
);
await shot(
  laptop,
  `${OUT}/p307-reuse-open-1280.png`,
  '/jobs/look-job-p307?auditAuth=1&look=p307-reuse&tab=paperwork',
  waitReuseOpen,
);
await shot(
  phone,
  `${OUT}/p307-reuse-open-390.png`,
  '/jobs/look-job-p307?auditAuth=1&look=p307-reuse&tab=paperwork',
  waitReuseOpen,
);
await shot(
  laptop,
  `${OUT}/p307-quoted-button-1280.png`,
  '/jobs/look-job-p307?auditAuth=1&look=p307-quoted&tab=paperwork#job-quotes',
  waitQuotedOpenInvoice,
);
await shot(
  phone,
  `${OUT}/p307-quoted-button-390.png`,
  '/jobs/look-job-p307?auditAuth=1&look=p307-quoted&tab=paperwork#job-quotes',
  waitQuotedOpenInvoice,
);

await browser.close();
console.log(JSON.stringify({
  out: OUT,
  files: [
    'p307-list-agree-1280.png',
    'p307-list-agree-390.png',
    'p307-sheet-agree-1280.png',
    'p307-sheet-agree-390.png',
    'p307-reuse-open-1280.png',
    'p307-reuse-open-390.png',
    'p307-quoted-button-1280.png',
    'p307-quoted-button-390.png',
  ],
}, null, 2));
