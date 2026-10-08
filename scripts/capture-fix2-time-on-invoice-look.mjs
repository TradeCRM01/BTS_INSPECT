// FIX-2 TIME-ON-INVOICE LOOK frames (390 + 1280).
// Run: node scripts/capture-fix2-time-on-invoice-look.mjs (needs `npm run dev`).
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT_DIR || '/opt/cursor/artifacts';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(process.env.LOOK_BROWSER_CHANNEL ? { channel: process.env.LOOK_BROWSER_CHANNEL } : {}),
});

async function shot(viewportWidth, filename, href, wait) {
  const mobile = viewportWidth === 390;
  const context = await browser.newContext({
    viewport: { width: viewportWidth, height: mobile ? 844 : 900 },
    deviceScaleFactor: 1,
    locale: 'en-AU',
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
  await page.setViewportSize({ width: viewportWidth, height: mobile ? 844 : 900 });
  await wait(page);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${filename}`, type: 'png', fullPage: false });
  await context.close();
}

async function waitInvoiceNext(page, detailPart) {
  await page.waitForSelector('[data-job-next-detail]', { timeout: 25000 });
  await page.waitForFunction((part) => {
    const el = document.querySelector('[data-job-next-detail]');
    return el?.textContent?.includes(part);
  }, detailPart);
}

async function openQuotedSheet(page) {
  await waitInvoiceNext(page, '$880.00');
  await page.locator('.hub-jobs-tools .btn-primary').click();
  await page.waitForSelector('[data-job-bill-quoted-invoice-money]', { timeout: 15000 });
}

async function openZeroSheet(page) {
  await waitInvoiceNext(page, 'Draft invoice from the job bill');
  await page.locator('.hub-jobs-tools .btn-primary').click();
  await page.waitForSelector('.hub-job-bill-zero-labour-sheet', { timeout: 15000 });
}

const quotedHref = '/jobs/audit-doc-job?auditAuth=1&look=fix2-quoted&tab=paperwork';
const zeroHref = '/jobs/audit-doc-job?auditAuth=1&look=fix2-zero-header&tab=paperwork';

for (const width of [390, 1280]) {
  await shot(
    width,
    `fix2-quoted-note-${width}.png`,
    quotedHref,
    async (page) => {
      await openQuotedSheet(page);
    },
  );
  await shot(
    width,
    `fix2-opt-in-${width}.png`,
    quotedHref,
    async (page) => {
      await openQuotedSheet(page);
      await page.locator('.hub-ops-form-check input').check();
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-job-bill-quoted-invoice-money]');
        return el?.textContent?.includes('$1,212.50');
      });
    },
  );
  await shot(
    width,
    `fix2-zero-sheet-${width}.png`,
    zeroHref,
    openZeroSheet,
  );
  await shot(
    width,
    `fix2-subtitle-${width}.png`,
    quotedHref,
    (page) => waitInvoiceNext(page, '$880.00'),
  );
}

await browser.close();
console.log(`FIX-2 LOOK frames saved under ${OUT}`);
