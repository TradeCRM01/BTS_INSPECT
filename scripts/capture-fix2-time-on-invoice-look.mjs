// FIX-2 TIME-ON-INVOICE LOOK: preview | created invoice (same run, totals must match).
// 390 → 780×844 composites; 1280 → 2560×900 (two full panes, no downscale).
// Run: node scripts/capture-fix2-time-on-invoice-look.mjs (needs `npm run dev`).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT_DIR || '/opt/cursor/artifacts';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(process.env.LOOK_BROWSER_CHANNEL ? { channel: process.env.LOOK_BROWSER_CHANNEL } : {}),
});

function parseIncGstTotal(moneyLine) {
  const m = moneyLine.match(/\$([\d,]+\.\d{2})\s+inc GST/);
  if (!m) return null;
  return Number(m[1].replace(/,/g, ''));
}

async function compositePair(browser, leftPng, rightPng, outPath, paneWidth, paneHeight) {
  const leftB64 = readFileSync(leftPng).toString('base64');
  const rightB64 = readFileSync(rightPng).toString('base64');
  const page = await browser.newPage();
  const totalWidth = paneWidth * 2;
  await page.setViewportSize({ width: totalWidth, height: paneHeight });
  await page.setContent(`<!DOCTYPE html><html><head><style>
html,body{margin:0;padding:0;width:${totalWidth}px;height:${paneHeight}px;overflow:hidden;background:#F5F0E6;}
.wrap{display:flex;width:${totalWidth}px;height:${paneHeight}px;}
.wrap img{display:block;width:${paneWidth}px;height:${paneHeight}px;object-fit:none;object-position:top left;}
</style></head><body><div class="wrap">
<img src="data:image/png;base64,${leftB64}" alt="preview"/>
<img src="data:image/png;base64,${rightB64}" alt="invoice"/>
</div></body></html>`);
  await page.screenshot({ path: outPath, type: 'png', clip: { x: 0, y: 0, width: totalWidth, height: paneHeight } });
  await page.close();
}

async function captureState({ state, width, optIn, zeroConfirm }) {
  const mobile = width === 390;
  const paneHeight = mobile ? 844 : 900;
  const context = await browser.newContext({
    viewport: { width, height: paneHeight },
    deviceScaleFactor: 1,
    locale: 'en-AU',
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await context.newPage();
  const href = `/jobs/audit-doc-job?auditAuth=1&look=${state}&tab=paperwork`;
  await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => sessionStorage.removeItem('audit-fix2-invoice-row'));
  await page.setViewportSize({ width, height: paneHeight });

  const quoted = state.startsWith('fix2-quoted');

  if (quoted) {
    await page.waitForSelector('[data-job-next-detail]', { timeout: 25000 });
    await page.locator('.hub-jobs-tools .btn-primary').click();
    await page.waitForSelector('[data-job-bill-quoted-invoice-money]', { timeout: 15000 });
    if (optIn) {
      await page.locator('.hub-ops-form-check input').check();
      await page.waitForTimeout(400);
    }
  } else if (zeroConfirm) {
    await page.waitForSelector('[data-job-next-detail]', { timeout: 25000 });
    await page.locator('.hub-jobs-tools .btn-primary').click();
    await page.waitForSelector('.hub-job-bill-zero-labour-sheet', { timeout: 15000 });
  } else {
    await page.waitForSelector('[data-job-next-detail]', { timeout: 25000 });
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-job-next-detail]');
      return el?.textContent?.includes('inc GST');
    });
  }

  let previewString = '';
  if (quoted) {
    previewString = await page.locator('[data-job-bill-quoted-invoice-money]').innerText();
    const headerDetail = await page.locator('[data-job-next-detail]').innerText();
    if (headerDetail.trim() !== previewString.trim()) {
      console.warn(`[${state}] header vs sheet mismatch:\n  header: ${headerDetail}\n  sheet:  ${previewString}`);
    }
  } else {
    previewString = await page.locator('[data-job-next-detail]').innerText();
  }

  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const previewPath = `${OUT}/.tmp-${state}-preview-${width}.png`;
  if (quoted) {
    await page.locator('.hub-job-bill-zero-labour-sheet').screenshot({ path: previewPath });
  } else if (zeroConfirm) {
    await page.locator('.hub-job-bill-zero-labour-sheet').screenshot({ path: previewPath });
  } else {
    await page.locator('[data-job-next-detail]').screenshot({ path: previewPath });
  }

  if (quoted) {
    await page.locator('.hub-job-bill-zero-labour-primary').click();
  } else if (zeroConfirm) {
    await page.locator('.hub-job-bill-zero-labour-secondary').click();
  } else {
    await page.locator('.hub-jobs-tools .btn-primary').click();
  }

  await page.waitForFunction(() => sessionStorage.getItem('audit-fix2-invoice-row'), { timeout: 15000 });
  const stored = await page.evaluate(() => sessionStorage.getItem('audit-fix2-invoice-row'));
  const row = JSON.parse(stored);
  const expectedTotal = Number(row.total);
  const invoiceNumber = row.invoice_number;

  await page.goto(`${BASE}/invoices?id=audit-fix2-invoice`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hub-invoice-editor', { timeout: 20000 });
  await page.waitForSelector('[data-invoice-total-inc-gst]', { timeout: 15000 });
  await page.waitForFunction((expected) => {
    const el = document.querySelector('[data-invoice-total-inc-gst]');
    const text = el?.textContent ?? '';
    const n = Number(text.replace(/[^0-9.-]/g, ''));
    return Math.abs(n - expected) < 0.01;
  }, expectedTotal);

  const createdTotalText = await page.locator('[data-invoice-total-inc-gst]').innerText();
  const invoicePath = `${OUT}/.tmp-${state}-invoice-${width}.png`;
  await page.locator('.hub-invoice-editor').screenshot({ path: invoicePath });

  const finalPath = `${OUT}/${state}-${width}.png`;
  await compositePair(browser, previewPath, invoicePath, finalPath, width, paneHeight);

  const previewTotal = parseIncGstTotal(previewString);
  const createdTotal = parseIncGstTotal(`${createdTotalText} inc GST`) ?? Number(createdTotalText.replace(/[^0-9.-]/g, ''));
  if (previewTotal != null && Math.abs(previewTotal - createdTotal) > 0.01) {
    throw new Error(`[${state}] preview ${previewTotal} != created ${createdTotal}`);
  }

  await context.close();
  return {
    state,
    width,
    finalPath,
    previewString: previewString.trim(),
    invoiceNumber,
    createdTotalIncGst: createdTotal,
  };
}

const states = [
  { state: 'fix2-quoted', optIn: false, zeroConfirm: false },
  { state: 'fix2-quoted-optin', optIn: true, zeroConfirm: false },
  { state: 'fix2-unquoted-rate', optIn: false, zeroConfirm: false },
  { state: 'fix2-unquoted-zero', optIn: false, zeroConfirm: true },
];

const report = [];
for (const width of [390, 1280]) {
  for (const cfg of states) {
    report.push(await captureState({ ...cfg, width }));
  }
}

writeFileSync(`${OUT}/fix2-look-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
console.log(`FIX-2 LOOK composites saved under ${OUT}`);
