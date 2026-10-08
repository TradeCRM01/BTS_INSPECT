// FIX-2b LOOK: one-tap stability, busy create, no-rate opt-in.
// Run: node scripts/capture-fix2b-look.mjs (needs `npm run dev`).
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT_DIR || '/opt/cursor/artifacts';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(process.env.LOOK_BROWSER_CHANNEL ? { channel: process.env.LOOK_BROWSER_CHANNEL } : {}),
});

async function buttonY(page) {
  const btn = page.locator('.hub-job-invoice-next-preview .btn-primary').first();
  await btn.waitFor({ state: 'visible', timeout: 30000 });
  const box = await btn.boundingBox();
  if (!box) throw new Error('invoice next button missing bounding box');
  return box.y;
}

async function captureJobHeader(page, outPath, width, height, selector = '[data-job-invoice-preview]') {
  await page.setViewportSize({ width, height });
  const card = page.locator(selector).first();
  await card.waitFor({ state: 'visible', timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  await card.screenshot({ path: outPath });
}

async function captureAStable(width) {
  const height = width === 390 ? 844 : 900;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale: 'en-AU',
    timezoneId: 'Australia/Brisbane',
    isMobile: width === 390,
    hasTouch: width === 390,
  });
  const page = await context.newPage();
  let releaseDelay;
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.includes('/rest/v1/') && releaseDelay) {
      await releaseDelay;
    }
    await route.continue();
  });
  const href = `/jobs/audit-doc-job?auditAuth=1&look=fix2-unquoted-rate&tab=paperwork`;
  releaseDelay = new Promise(r => setTimeout(r, 2500));
  await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-job-invoice-preview]', { timeout: 30000 });
  await page.waitForSelector('[data-job-invoice-detail-reserved="1"]', { timeout: 30000 });
  const loadingPath = `${OUT}/fix2b-a-loading-${width}.png`;
  const yLoading = await buttonY(page);
  await captureJobHeader(page, loadingPath, width, height);
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-job-next-detail]');
    return el?.textContent?.includes('inc GST');
  }, { timeout: 30000 });
  const yResolved = await buttonY(page);
  if (Math.abs(yLoading - yResolved) > 0.5) {
    throw new Error(`[fix2b-a@${width}] invoice button y shifted ${yLoading} → ${yResolved}`);
  }
  const resolvedPath = `${OUT}/fix2b-a-resolved-${width}.png`;
  await captureJobHeader(page, resolvedPath, width, height);
  await context.close();
  return { width, yLoading, yResolved, loadingPath, resolvedPath };
}

async function captureBusyAndAfter(width) {
  const height = width === 390 ? 844 : 900;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale: 'en-AU',
    timezoneId: 'Australia/Brisbane',
    isMobile: width === 390,
    hasTouch: width === 390,
  });
  const page = await context.newPage();
  const href = `/jobs/audit-doc-job?auditAuth=1&look=fix2-unquoted-rate&tab=paperwork`;
  await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    sessionStorage.setItem('fix2b-slow-create', '1');
    sessionStorage.removeItem('audit-fix2-invoice-row');
  });
  await page.waitForSelector('[data-job-invoice-preview]', { timeout: 30000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-job-next-detail]');
    return el?.textContent?.includes('inc GST');
  }, { timeout: 30000 });
  const headerBtn = page.locator('.hub-jobs-tools .btn-primary');
  await headerBtn.click();
  await page.waitForFunction(() => {
    const header = document.querySelector('.hub-jobs-tools .btn-primary');
    return header?.getAttribute('disabled') != null
      || header?.textContent?.includes('Creating');
  }, { timeout: 5000 });
  const busyPath = `${OUT}/fix2b-b-busy-${width}.png`;
  await captureJobHeader(page, busyPath, width, height);
  await page.waitForFunction(() => sessionStorage.getItem('audit-fix2-invoice-row'), { timeout: 20000 });
  await page.waitForFunction(() => {
    const btn = document.querySelector('.hub-jobs-tools .btn-primary');
    const label = btn?.textContent?.trim() ?? '';
    return label === 'Share' || label === 'Send';
  }, { timeout: 30000 });
  const afterPath = `${OUT}/fix2b-b-after-${width}.png`;
  await captureJobHeader(page, afterPath, width, height, '.hub-jobs-tools');
  await context.close();
  return { width, busyPath, afterPath };
}

async function captureNoRate(width) {
  const height = width === 390 ? 844 : 900;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale: 'en-AU',
    timezoneId: 'Australia/Brisbane',
    isMobile: width === 390,
    hasTouch: width === 390,
  });
  const page = await context.newPage();
  const href = `/jobs/audit-doc-job?auditAuth=1&look=fix2b-d-norate&tab=paperwork`;
  await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-job-invoice-preview]', { timeout: 30000 });
  await page.locator('.hub-jobs-tools .btn-primary').click();
  await page.waitForSelector('.hub-job-bill-zero-labour-sheet', { timeout: 30000 });
  await page.waitForSelector('[data-job-bill-quoted-unpriced-warning]', { timeout: 30000 });
  const optIn = page.locator('.hub-ops-form-check input');
  if (!(await optIn.isChecked())) await optIn.check();
  await page.waitForFunction(() => {
    const money = document.querySelector('[data-job-bill-quoted-invoice-money]')?.textContent ?? '';
    return money.includes('no rate set');
  });
  const previewMoney = (await page.locator('[data-job-bill-quoted-invoice-money]').innerText()).trim();
  const sheetPath = `${OUT}/.tmp-fix2b-d-sheet-${width}.png`;
  await page.locator('.hub-job-bill-zero-labour-sheet').screenshot({ path: sheetPath });
  await page.locator('.hub-job-bill-zero-labour-primary').click();
  await page.waitForFunction(() => sessionStorage.getItem('audit-fix2-invoice-row'), { timeout: 20000 });
  const row = JSON.parse(await page.evaluate(() => sessionStorage.getItem('audit-fix2-invoice-row')));
  const createdTotal = Number(row.total);
  const headerDetail = await page.locator('[data-job-next-detail]').innerText().catch(() => '');
  const parseTotal = (text) => {
    const m = text.match(/\$([\d,]+\.\d{2})/);
    return m ? Number(m[1].replace(/,/g, '')) : null;
  };
  const headerTotal = parseTotal(headerDetail);
  if (headerTotal != null && Math.abs(headerTotal - createdTotal) > 0.01) {
    throw new Error(`[fix2b-d@${width}] header preview ${headerTotal} != created ${createdTotal}`);
  }
  if (!previewMoney.includes('no rate set')) {
    throw new Error(`[fix2b-d@${width}] sheet money line missing no rate set: ${previewMoney}`);
  }
  if (Math.abs(createdTotal - 898) > 0.01) {
    throw new Error(`[fix2b-d@${width}] expected created total 898, got ${createdTotal}`);
  }
  await page.goto(`${BASE}/invoices?id=audit-fix2-invoice`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-invoice-total-inc-gst]', { timeout: 20000 });
  const createdText = await page.locator('[data-invoice-total-inc-gst]').innerText();
  const createdParsed = Number(createdText.replace(/[^0-9.-]/g, ''));
  if (Math.abs(createdParsed - createdTotal) > 0.01) {
    throw new Error(`[fix2b-d@${width}] editor total mismatch`);
  }
  const invoicePath = `${OUT}/.tmp-fix2b-d-invoice-${width}.png`;
  await page.locator('.hub-invoice-editor').screenshot({ path: invoicePath });
  const finalPath = `${OUT}/fix2b-d-norate-${width}.png`;
  const page2 = await browser.newPage();
  const totalWidth = width * 2;
  await page2.setViewportSize({ width: totalWidth, height });
  await page2.setContent(`<!DOCTYPE html><html><head><style>
body{margin:0;background:#e8e8e8;font-family:system-ui,sans-serif;color:#444;}
.wrap{display:flex;width:${totalWidth}px;height:${height}px;gap:0;}
.cap{padding:10px 12px 6px;font-size:12px;font-weight:600;text-align:center;}
img{display:block;max-width:${width - 24}px;margin:0 auto;}
.pane{width:${width}px;box-sizing:border-box;padding:8px;background:#e8e8e8;}
</style></head><body><div class="wrap">
<div class="pane"><p class="cap">Opt-in · no rate set (before create)</p><img src="file://${sheetPath}" /></div>
<div class="pane"><p class="cap">Created invoice total $${createdTotal.toFixed(2)}</p><img src="file://${invoicePath}" /></div>
</div></body></html>`);
  await page2.screenshot({ path: finalPath, clip: { x: 0, y: 0, width: totalWidth, height } });
  await page2.close();
  await context.close();
  return { width, finalPath, previewMoney, createdTotal };
}

const report = [];
for (const width of [390, 1280]) {
  report.push(await captureAStable(width));
}
for (const width of [390, 1280]) {
  report.push(await captureBusyAndAfter(width));
}
for (const width of [390, 1280]) {
  report.push(await captureNoRate(width));
}

writeFileSync(`${OUT}/fix2b-look-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
console.log(`FIX-2b LOOK saved under ${OUT}`);
