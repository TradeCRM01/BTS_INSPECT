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
  const rightFit = paneWidth >= 1280 ? 'contain' : 'cover';
  const leftMax = paneWidth >= 1280 ? Math.min(paneWidth - 48, 1180) : Math.min(paneWidth - 32, 520);
  await page.setViewportSize({ width: totalWidth, height: paneHeight });
  await page.setContent(`<!DOCTYPE html><html><head><style>
html,body{margin:0;padding:0;width:${totalWidth}px;height:${paneHeight}px;overflow:hidden;background:#F5F0E6;}
.wrap{display:flex;width:${totalWidth}px;height:${paneHeight}px;}
.pane{width:${paneWidth}px;height:${paneHeight}px;box-sizing:border-box;background:#F5F0E6;}
.pane-left{display:flex;justify-content:${paneWidth >= 1280 ? 'flex-start' : 'center'};align-items:flex-start;padding:20px 24px;overflow:hidden;}
.pane-left img{max-width:min(100%,${leftMax}px);max-height:calc(100% - 8px);width:auto;height:auto;object-fit:contain;object-position:top ${paneWidth >= 1280 ? 'left' : 'center'};box-shadow:0 2px 12px rgba(10,37,64,.08);}
.pane-right{display:flex;justify-content:center;align-items:flex-start;padding:12px 16px 16px;box-sizing:border-box;overflow:hidden;}
.pane-right img{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:${rightFit};object-position:top center;}
</style></head><body><div class="wrap">
<div class="pane pane-left"><img src="data:image/png;base64,${leftB64}" alt="preview"/></div>
<div class="pane pane-right"><img src="data:image/png;base64,${rightB64}" alt="invoice"/></div>
</div></body></html>`);
  await page.screenshot({ path: outPath, type: 'png', clip: { x: 0, y: 0, width: totalWidth, height: paneHeight } });
  await page.close();
}

/** Scroll invoice dialog so Total (inc GST) is fully in view; on 390 also try to show Invoice # heading. */
async function scrollInvoiceEditorForCapture(editor, width) {
  await editor.locator('.hub-invoice-totalbar').waitFor({ state: 'visible' });
  await editor.evaluate((root, w) => {
    const scroll =
      root.querySelector('.hub-editor-dialog-scroll') ??
      root.querySelector('.hub-invoice-editor-body') ??
      root;
    const totalBar = root.querySelector('.hub-invoice-totalbar');
    if (!scroll || !totalBar) return;

    const pad = 12;
    const scrollRect = scroll.getBoundingClientRect();
    const totalRect = totalBar.getBoundingClientRect();
    const viewH = scrollRect.height;

    let target =
      scroll.scrollTop + (totalRect.bottom - scrollRect.bottom) + pad;

    const toName = root.querySelector('.hub-invoice-to-name');
    const title = root.querySelector('.hub-invoice-editor-title');
    const fromBlock = root.querySelector('.hub-invoice-from');
    const topEl = w === 390 && title ? title : (toName ?? fromBlock);
    if (topEl && viewH > 0) {
      const topRect = topEl.getBoundingClientRect();
      const blockH = totalRect.bottom - topRect.top + pad * 2;
      if (blockH <= viewH) {
        target = scroll.scrollTop + (topRect.top - scrollRect.top) - pad;
      }
    }

    const maxScroll = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    scroll.scrollTop = Math.min(maxScroll, Math.max(0, target));
  }, width);
  await editor.locator('[data-invoice-total-inc-gst]').scrollIntoViewIfNeeded();
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
    await page.waitForSelector('[data-job-invoice-preview], [data-job-next-detail]', { timeout: 25000 });
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
    await page.waitForSelector('[data-job-invoice-preview]', { timeout: 25000 });
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
  if (quoted || zeroConfirm) {
    await page.locator('.hub-job-bill-zero-labour-sheet').screenshot({ path: previewPath });
  } else {
    await page.locator('[data-job-invoice-preview]').screenshot({ path: previewPath });
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
  const editor = page.locator('.hub-invoice-editor');
  await scrollInvoiceEditorForCapture(editor, width);
  await page.waitForTimeout(250);
  await editor.screenshot({ path: invoicePath });

  const totalVisible = await editor.evaluate((root) => {
    const totalBar = root.querySelector('.hub-invoice-totalbar');
    if (!totalBar) return false;
    const r = totalBar.getBoundingClientRect();
    const scroll = root.querySelector('.hub-editor-dialog-scroll') ?? root;
    const sr = scroll.getBoundingClientRect();
    return r.top >= sr.top - 2 && r.bottom <= sr.bottom + 2;
  });
  if (!totalVisible) {
    throw new Error(`[${state}@${width}] Total (inc GST) bar not fully visible after scroll`);
  }

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

async function buildClockoffLeftStrip(browser, {
  beforeMoney,
  afterMoney,
  hoursPng,
  outPath,
  paneWidth,
  paneHeight,
}) {
  const hoursB64 = readFileSync(hoursPng).toString('base64');
  const page = await browser.newPage();
  await page.setViewportSize({ width: paneWidth, height: paneHeight });
  await page.setContent(`<!DOCTYPE html><html><head><style>
html,body{margin:0;padding:0;width:${paneWidth}px;height:${paneHeight}px;background:#F5F0E6;font-family:system-ui,-apple-system,sans-serif;color:#0A2540;}
.strip{width:${paneWidth - 32}px;margin:16px auto;display:flex;flex-direction:column;gap:10px;}
.card{padding:12px 14px;border-radius:12px;border:1px solid color-mix(in srgb,#0a2540 12%,#e2d9cc);background:#FFFDF8;box-shadow:0 2px 12px rgba(10,37,64,.08);}
.kicker{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#0A2540;opacity:.72;margin:0 0 6px;}
.money{margin:0;font-size:15px;font-weight:600;line-height:1.35;}
.event{margin:0;font-size:13px;line-height:1.4;}
.event strong{font-weight:700;}
.hours img{display:block;width:100%;height:auto;border-radius:8px;border:1px solid #e2d9cc;}
</style></head><body><div class="strip">
<div class="card"><p class="kicker">Before clock off</p><p class="money">${beforeMoney.replace(/</g, '&lt;')}</p></div>
<div class="card event"><span class="kicker">Capture annotation</span> Clock off — 1.5 h logged on this job (invoice preview 2 h → 3.5 h)</div>
<div class="card hours"><img src="data:image/png;base64,${hoursB64}" alt="Time on this job"/></div>
<div class="card"><p class="kicker">After clock off</p><p class="money">${afterMoney.replace(/</g, '&lt;')}</p></div>
</div></body></html>`);
  await page.locator('.strip').screenshot({ path: outPath });
  await page.close();
}

async function captureClockoffInvoice390() {
  const width = 390;
  const paneHeight = 844;
  const state = 'fix2-clockoff-invoice';
  const context = await browser.newContext({
    viewport: { width, height: paneHeight },
    deviceScaleFactor: 1,
    locale: 'en-AU',
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const href = `/jobs/audit-doc-job?auditAuth=1&look=${state}&tab=paperwork`;
  await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    sessionStorage.removeItem('audit-fix2-invoice-row');
    sessionStorage.removeItem('fix2-clockoff-closed');
  });
  await page.setViewportSize({ width, height: paneHeight });
  await page.waitForSelector('[data-job-invoice-preview]', { timeout: 25000 });
  await page.waitForFunction(() => {
    const text = document.querySelector('[data-job-next-detail]')?.textContent ?? '';
    return text.includes('$209.00') && text.includes('inc GST');
  }, { timeout: 30000 });
  const previewBefore = (await page.locator('[data-job-next-detail]').innerText()).trim();
  const beforeTotal = parseIncGstTotal(previewBefore);
  if (beforeTotal == null || Math.abs(beforeTotal - 209) > 0.01) {
    throw new Error(`[${state}] expected previewBefore ~209 inc GST, got: ${previewBefore}`);
  }

  await page.locator('.hub-job-more summary').click();
  await page.locator('.hub-job-more-menu button', { hasText: 'Clock off' }).click();
  await page.waitForFunction(() => sessionStorage.getItem('fix2-clockoff-closed') === '1', { timeout: 10000 });
  await page.waitForFunction((before) => {
    const text = document.querySelector('[data-job-next-detail]')?.textContent ?? '';
    return text.includes('$365.75') && text.includes('inc GST') && text.trim() !== before.trim();
  }, previewBefore, { timeout: 30000 });
  const previewAfter = (await page.locator('[data-job-next-detail]').innerText()).trim();
  const afterTotal = parseIncGstTotal(previewAfter);
  if (afterTotal == null || Math.abs(afterTotal - 365.75) > 0.01) {
    throw new Error(`[${state}] expected previewAfter ~365.75 inc GST, got: ${previewAfter}`);
  }
  if (previewBefore === previewAfter) {
    throw new Error(`[${state}] preview did not change after clock off (same session)`);
  }

  await page.locator('[role="tab"][data-tab="schedule"]').click();
  await page.locator('#job-hours').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => {
    const root = document.querySelector('#job-hours');
    const text = root?.textContent ?? '';
    return text.includes('3h 30m') && !/\brunning\b/i.test(text);
  }, { timeout: 15000 });
  const hoursPath = `${OUT}/.tmp-${state}-hours-${width}.png`;
  await page.locator('#job-hours').screenshot({ path: hoursPath });
  await page.locator('[role="tab"][data-tab="paperwork"]').click();
  await page.locator('[data-job-invoice-preview]').waitFor({ state: 'visible', timeout: 15000 });
  const leftStripPath = `${OUT}/.tmp-${state}-left-${width}.png`;
  await buildClockoffLeftStrip(browser, {
    beforeMoney: previewBefore,
    afterMoney: previewAfter,
    hoursPng: hoursPath,
    outPath: leftStripPath,
    paneWidth: width,
    paneHeight,
  });

  await page.locator('.hub-jobs-tools .btn-primary').click();
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
  const editor = page.locator('.hub-invoice-editor');
  await scrollInvoiceEditorForCapture(editor, width);
  await page.waitForTimeout(250);
  await editor.screenshot({ path: invoicePath });
  const totalVisible = await editor.evaluate((root) => {
    const totalBar = root.querySelector('.hub-invoice-totalbar');
    if (!totalBar) return false;
    const r = totalBar.getBoundingClientRect();
    const scroll = root.querySelector('.hub-editor-dialog-scroll') ?? root;
    const sr = scroll.getBoundingClientRect();
    return r.top >= sr.top - 2 && r.bottom <= sr.bottom + 2;
  });
  if (!totalVisible) {
    throw new Error(`[${state}@${width}] Total (inc GST) bar not fully visible after scroll`);
  }

  const finalPath = `${OUT}/${state}-${width}.png`;
  await compositePair(browser, leftStripPath, invoicePath, finalPath, width, paneHeight);
  const createdTotal = parseIncGstTotal(`${createdTotalText} inc GST`) ?? Number(createdTotalText.replace(/[^0-9.-]/g, ''));
  if (Math.abs(afterTotal - createdTotal) > 0.01) {
    throw new Error(`[${state}] previewAfter ${afterTotal} != created ${createdTotal}`);
  }

  await context.close();
  return {
    state,
    width,
    finalPath,
    previewBefore,
    previewAfter,
    previewString: previewAfter,
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
report.push(await captureClockoffInvoice390());

writeFileSync(`${OUT}/fix2-look-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
console.log(`FIX-2 LOOK composites saved under ${OUT}`);
