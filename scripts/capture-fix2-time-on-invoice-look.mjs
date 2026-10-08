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
async function scrollInvoiceEditorForCapture(editor, width, { requireInvoiceHeading = false } = {}) {
  await editor.locator('.hub-invoice-totalbar').waitFor({ state: 'visible' });
  await editor.evaluate((root, { w, requireInvoiceHeading }) => {
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
    const topEl = (w === 390 && (requireInvoiceHeading || title)) ? (title ?? toName ?? fromBlock) : (toName ?? fromBlock);
    if (topEl && viewH > 0) {
      const topRect = topEl.getBoundingClientRect();
      const blockH = totalRect.bottom - topRect.top + pad * 2;
      if (blockH <= viewH || (requireInvoiceHeading && title)) {
        target = scroll.scrollTop + (topRect.top - scrollRect.top) - pad;
      }
    }

    const maxScroll = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    scroll.scrollTop = Math.min(maxScroll, Math.max(0, target));
  }, { w: width, requireInvoiceHeading });
  await editor.locator('[data-invoice-total-inc-gst]').scrollIntoViewIfNeeded();
}

async function assertInvoiceHeadingVisible(editor, state, width) {
  const title = editor.locator('.hub-invoice-editor-title');
  await title.waitFor({ state: 'visible', timeout: 15000 });
  await title.scrollIntoViewIfNeeded();
  await editor.evaluate((root) => {
    const scroll = root.querySelector('.hub-editor-dialog-scroll') ?? root.querySelector('.hub-invoice-editor-body') ?? root;
    const el = root.querySelector('.hub-invoice-editor-title');
    if (!scroll || !el) return;
    const scrollRect = scroll.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    scroll.scrollTop += r.top - scrollRect.top - 10;
  });
  const text = (await title.innerText()).trim();
  if (!/9102/.test(text)) {
    throw new Error(`[${state}@${width}] expected Invoice #9102 heading, got: ${text}`);
  }
  const visible = await editor.evaluate((root) => {
    const el = root.querySelector('.hub-invoice-editor-title');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const scroll = root.querySelector('.hub-editor-dialog-scroll') ?? root;
    const sr = scroll.getBoundingClientRect();
    return r.bottom > sr.top + 4 && r.top < sr.bottom - 4;
  });
  if (!visible) {
    throw new Error(`[${state}@${width}] Invoice #9102 heading not visible in editor frame`);
  }
}

async function captureState({ state, width, optIn, zeroConfirm }) {
  const mobile = width === 390;
  const paneHeight = mobile ? 844 : 900;
  const context = await browser.newContext({
    viewport: { width, height: paneHeight },
    deviceScaleFactor: 1,
    locale: 'en-AU',
    timezoneId: 'Australia/Brisbane',
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
  const requireInvoiceHeading = width === 390 && (state === 'fix2-quoted-optin' || state === 'fix2-unquoted-zero');
  await scrollInvoiceEditorForCapture(editor, width, { requireInvoiceHeading });
  await page.waitForTimeout(250);
  if (requireInvoiceHeading) {
    await assertInvoiceHeadingVisible(editor, state, width);
    await editor.locator('[data-invoice-total-inc-gst]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
  }
  await editor.screenshot({ path: invoicePath });

  const totalVisible = await editor.evaluate((root, partial) => {
    const totalBar = root.querySelector('.hub-invoice-totalbar');
    if (!totalBar) return false;
    const r = totalBar.getBoundingClientRect();
    const scroll = root.querySelector('.hub-editor-dialog-scroll') ?? root;
    const sr = scroll.getBoundingClientRect();
    if (partial) return r.bottom > sr.top + 4 && r.top < sr.bottom - 4;
    return r.top >= sr.top - 2 && r.bottom <= sr.bottom + 2;
  }, requireInvoiceHeading);
  if (!totalVisible) {
    throw new Error(`[${state}@${width}] Total (inc GST) bar not visible after scroll`);
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
  beforeMoneyPng,
  afterMoneyPng,
  hoursPng,
  outPath,
  paneWidth,
  paneHeight,
}) {
  const beforeB64 = readFileSync(beforeMoneyPng).toString('base64');
  const afterB64 = readFileSync(afterMoneyPng).toString('base64');
  const hoursB64 = readFileSync(hoursPng).toString('base64');
  const page = await browser.newPage();
  await page.setViewportSize({ width: paneWidth, height: paneHeight });
  await page.setContent(`<!DOCTYPE html><html><head><style>
html,body{margin:0;padding:0;width:${paneWidth}px;min-height:${paneHeight}px;background:#e8e8e8;font-family:system-ui,-apple-system,sans-serif;color:#333;}
.col{width:${paneWidth}px;box-sizing:border-box;padding:14px 12px 20px;display:flex;flex-direction:column;align-items:center;gap:8px;}
.cap{margin:0;font-size:12px;font-weight:600;color:#555;text-align:center;line-height:1.3;}
.cap-sub{margin:0 0 4px;font-size:11px;color:#777;text-align:center;line-height:1.35;max-width:${paneWidth - 24}px;}
.shot img{display:block;max-width:${paneWidth - 24}px;width:100%;height:auto;box-shadow:0 1px 6px rgba(0,0,0,.12);}
.gap{height:6px;}
</style></head><body><div class="col">
<p class="cap">Before clock off — job Next money line</p>
<div class="shot"><img src="data:image/png;base64,${beforeB64}" alt="before"/></div>
<p class="cap-sub">Clock off — 1.5 h logged (preview 2 h → 3.5 h)</p>
<div class="shot"><img src="data:image/png;base64,${hoursB64}" alt="hours"/></div>
<div class="gap"></div>
<p class="cap">After clock off — job Next money line</p>
<div class="shot"><img src="data:image/png;base64,${afterB64}" alt="after"/></div>
</div></body></html>`);
  await page.locator('.col').screenshot({ path: outPath });
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
    timezoneId: 'Australia/Brisbane',
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
  const beforeMoneyPath = `${OUT}/.tmp-${state}-before-money-${width}.png`;
  await page.locator('[data-job-next-detail]').screenshot({ path: beforeMoneyPath });
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
  const afterMoneyPath = `${OUT}/.tmp-${state}-after-money-${width}.png`;
  await page.locator('[data-job-next-detail]').screenshot({ path: afterMoneyPath });
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
    beforeMoneyPng: beforeMoneyPath,
    afterMoneyPng: afterMoneyPath,
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

const onlyRecapture = (process.env.FIX2_LOOK_ONLY ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
  .map((token) => {
    const [state, widthRaw] = token.split(':');
    return { state, width: widthRaw ? Number(widthRaw) : null };
  });

function mergeReport(existing, fresh) {
  const key = (r) => `${r.state}@${r.width}`;
  const map = new Map((existing ?? []).map(r => [key(r), r]));
  for (const row of fresh) map.set(key(row), row);
  return [...map.values()].sort((a, b) => {
    if (a.state !== b.state) return a.state.localeCompare(b.state);
    return a.width - b.width;
  });
}

let priorReport = [];
try {
  priorReport = JSON.parse(readFileSync(`${OUT}/fix2-look-report.json`, 'utf8'));
} catch {
  priorReport = [];
}

const fresh = [];
const runAll = onlyRecapture.length === 0;
const wantCapture = (state, width) => {
  if (runAll) return true;
  return onlyRecapture.some(
    (p) => p.state === state && (p.width == null || p.width === width),
  );
};

if (runAll || states.some(c => onlyRecapture.some(p => p.state === c.state))) {
  for (const width of [390, 1280]) {
    for (const cfg of states) {
      if (!wantCapture(cfg.state, width)) continue;
      fresh.push(await captureState({ ...cfg, width }));
    }
  }
}
if (wantCapture('fix2-clockoff-invoice', 390)) {
  fresh.push(await captureClockoffInvoice390());
}

const report = mergeReport(priorReport, fresh);
writeFileSync(`${OUT}/fix2-look-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(fresh, null, 2));
await browser.close();
console.log(`FIX-2 LOOK composites saved under ${OUT} (captured ${fresh.length} frame(s))`);
