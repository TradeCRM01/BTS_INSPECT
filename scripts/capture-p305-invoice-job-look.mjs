// LOOK + FUNCTION proof for P-305 — invoice from a finished job.
// Jobs list completed card Invoice at 1280 / 390; sheet Next bill wording;
// empty-bill message; invoice editor at 1280 / 1024 / 390.
// Run: node scripts/capture-p305-invoice-job-look.mjs (needs `npm run dev`).
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT_DIR || '/opt/cursor/artifacts';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(process.env.LOOK_BROWSER_CHANNEL ? { channel: process.env.LOOK_BROWSER_CHANNEL } : {}),
});

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
    return rows.some(row => row.textContent?.includes('Bayswater Body Corporate'))
      && rows.some(row => row.querySelector('[data-job-list-next="Invoice"]'));
  });
}

async function waitJobSheet(page, detail) {
  await page.waitForSelector('.hub-jobs-document [data-job-next-detail]', { timeout: 20000 });
  await page.waitForFunction((wanted) => {
    const el = document.querySelector('[data-job-next-detail]');
    const btn = document.querySelector('.hub-jobs-tools .btn-primary');
    return el?.textContent?.includes(wanted) && btn?.textContent?.includes('Invoice');
  }, detail);
}

async function waitInvoiceEditor(page) {
  await page.waitForSelector('.hub-invoice-sheet', { timeout: 20000 });
}

await shot(
  { viewport: { width: 1280, height: 900 } },
  `${OUT}/p305-jobs-list-1280.png`,
  '/jobs?auditAuth=1&look=jobs-list',
  waitJobsList,
);
await shot(
  { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  `${OUT}/p305-jobs-list-390.png`,
  '/jobs?auditAuth=1&look=jobs-list',
  waitJobsList,
);
await shot(
  { viewport: { width: 1280, height: 900 } },
  `${OUT}/p305-next-detail.png`,
  '/jobs/audit-doc-job?auditAuth=1&look=p305&tab=paperwork',
  page => waitJobSheet(page, 'Draft invoice from the job bill'),
);
await shot(
  { viewport: { width: 1280, height: 900 } },
  `${OUT}/p305-empty-bill.png`,
  '/jobs/audit-doc-job?auditAuth=1&look=p305-empty&tab=paperwork',
  page => waitJobSheet(page, 'Job bill is empty'),
);
await shot(
  { viewport: { width: 1280, height: 900 } },
  `${OUT}/p305-invoice-editor-1280.png`,
  '/invoices?auditAuth=1&id=audit-invoice-send',
  waitInvoiceEditor,
);
await shot(
  { viewport: { width: 1024, height: 900 } },
  `${OUT}/p305-invoice-editor-1024.png`,
  '/invoices?auditAuth=1&id=audit-invoice-send',
  waitInvoiceEditor,
);
await shot(
  { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  `${OUT}/p305-invoice-editor-390.png`,
  '/invoices?auditAuth=1&id=audit-invoice-send',
  waitInvoiceEditor,
);

await browser.close();
console.log(JSON.stringify({
  out: OUT,
  files: [
    'p305-jobs-list-1280.png',
    'p305-jobs-list-390.png',
    'p305-next-detail.png',
    'p305-empty-bill.png',
    'p305-invoice-editor-1280.png',
    'p305-invoice-editor-1024.png',
    'p305-invoice-editor-390.png',
  ],
}, null, 2));
