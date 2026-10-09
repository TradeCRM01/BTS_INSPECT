// FIX-2b LOOK: one-tap stability, busy create, no-rate opt-in.
// Run: node scripts/capture-fix2b-look.mjs (needs `npm run dev`).
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT_DIR || '/opt/cursor/artifacts';
const FIX2B_RELEASE_PREVIEW_EVENT = 'fix2b-release-preview';
const FIX2B_INVALIDATE_PREVIEW_EVENT = 'fix2b-invalidate-preview';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(process.env.LOOK_BROWSER_CHANNEL ? { channel: process.env.LOOK_BROWSER_CHANNEL } : {}),
});

function md5File(path) {
  return createHash('md5').update(readFileSync(path)).digest('hex');
}

async function buttonY(page) {
  const btn = page.locator('.hub-job-invoice-next-preview .btn-primary').first();
  await btn.waitFor({ state: 'visible', timeout: 30000 });
  const box = await btn.boundingBox();
  if (!box) throw new Error('invoice next button missing bounding box');
  return box.y;
}

/** Job title + status + invoice next card — stable frame for Coach. */
async function captureInvoiceHeaderBlock(page, outPath, width, height) {
  await page.setViewportSize({ width, height });
  const hero = page.locator('h1.hub-jobs-hero').first();
  const card = page.locator('[data-job-invoice-preview]').first();
  await hero.waitFor({ state: 'visible', timeout: 30000 });
  await card.waitFor({ state: 'visible', timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  const heroBox = await hero.boundingBox();
  const cardBox = await card.boundingBox();
  if (!heroBox || !cardBox) throw new Error('invoice header block missing layout');
  const pad = 8;
  const x = Math.max(0, Math.min(heroBox.x, cardBox.x) - pad);
  const y = Math.max(0, heroBox.y - pad);
  const right = Math.min(width, Math.max(heroBox.x + heroBox.width, cardBox.x + cardBox.width) + pad);
  const bottom = Math.min(height, cardBox.y + cardBox.height + pad);
  await page.screenshot({
    path: outPath,
    clip: { x, y, width: right - x, height: bottom - y },
  });
}

async function captureJobHeaderArea(page, outPath, width, height) {
  await page.setViewportSize({ width, height });
  const hero = page.locator('h1.hub-jobs-hero').first();
  const status = page.locator('.hub-jobs-status-whisper').first();
  const tools = page.locator('.hub-jobs-sheet-body .hub-jobs-tools').first();
  const detail = page.locator('.hub-jobs-sheet-body .ops-next-detail').first();
  await hero.waitFor({ state: 'visible', timeout: 30000 });
  await status.waitFor({ state: 'visible', timeout: 30000 });
  await tools.waitFor({ state: 'visible', timeout: 30000 });
  await detail.waitFor({ state: 'visible', timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  const boxes = await Promise.all([
    hero.boundingBox(),
    status.boundingBox(),
    tools.boundingBox(),
    detail.boundingBox(),
  ]);
  if (boxes.some(b => !b)) throw new Error('job header area missing layout');
  const pad = 8;
  const x = Math.max(0, Math.min(...boxes.map(b => b.x)) - pad);
  const y = Math.max(0, Math.min(...boxes.map(b => b.y)) - pad);
  const right = Math.min(width, Math.max(...boxes.map(b => b.x + b.width)) + pad);
  const bottom = Math.min(height, Math.max(...boxes.map(b => b.y + b.height)) + pad);
  await page.screenshot({
    path: outPath,
    clip: { x, y, width: right - x, height: bottom - y },
  });
}

async function compositeNoRate(browser, leftPng, rightPng, outPath, paneWidth, paneHeight, leftCaption, rightCaption) {
  const leftB64 = readFileSync(leftPng).toString('base64');
  const rightB64 = readFileSync(rightPng).toString('base64');
  const page = await browser.newPage();
  const capH = 36;
  const totalWidth = paneWidth * 2;
  const bodyH = paneHeight - capH;
  await page.setViewportSize({ width: totalWidth, height: paneHeight });
  await page.setContent(`<!DOCTYPE html><html><head><style>
html,body{margin:0;padding:0;width:${totalWidth}px;height:${paneHeight}px;overflow:hidden;background:#e8e8e8;font-family:system-ui,sans-serif;}
.wrap{display:flex;flex-direction:column;width:${totalWidth}px;height:${paneHeight}px;}
.caps{display:flex;width:${totalWidth}px;height:${capH}px;box-sizing:border-box;}
.cap{flex:1;padding:8px 12px;font-size:12px;font-weight:600;color:#444;text-align:center;box-sizing:border-box;}
.panes{display:flex;width:${totalWidth}px;height:${bodyH}px;}
.pane{width:${paneWidth}px;height:${bodyH}px;box-sizing:border-box;padding:8px;background:#e8e8e8;display:flex;align-items:flex-start;justify-content:center;overflow:hidden;}
.pane img{display:block;max-width:calc(100% - 16px);max-height:calc(100% - 8px);object-fit:contain;object-position:top center;}
</style></head><body><div class="wrap">
<div class="caps"><p class="cap">${leftCaption}</p><p class="cap">${rightCaption}</p></div>
<div class="panes">
<div class="pane"><img id="left" src="data:image/png;base64,${leftB64}" alt="sheet"/></div>
<div class="pane"><img id="right" src="data:image/png;base64,${rightB64}" alt="invoice"/></div>
</div></div></body></html>`);
  const sizes = await page.evaluate(() => {
    const left = document.getElementById('left');
    const right = document.getElementById('right');
    return {
      left: left?.naturalWidth ?? 0,
      right: right?.naturalWidth ?? 0,
    };
  });
  if (sizes.left === 0 || sizes.right === 0) {
    throw new Error(`[fix2b-d] composite embed failed (naturalWidth left=${sizes.left} right=${sizes.right})`);
  }
  await page.screenshot({ path: outPath, type: 'png', clip: { x: 0, y: 0, width: totalWidth, height: paneHeight } });
  await page.close();
}

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
    let target = scroll.scrollTop + (totalRect.bottom - scrollRect.bottom) + pad;
    const title = root.querySelector('.hub-invoice-editor-title');
    const topEl = (w === 390 || requireInvoiceHeading) ? title : null;
    if (topEl && scrollRect.height > 0) {
      const topRect = topEl.getBoundingClientRect();
      const blockH = totalRect.bottom - topRect.top + pad * 2;
      if (blockH <= scrollRect.height || requireInvoiceHeading) {
        target = scroll.scrollTop + (topRect.top - scrollRect.top) - pad;
      }
    }
    const maxScroll = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    scroll.scrollTop = Math.min(maxScroll, Math.max(0, target));
  }, { w: width, requireInvoiceHeading });
}

async function expandInvoiceEditorForCapture(page, editor) {
  await editor.evaluate((root) => {
    const scroll =
      root.querySelector('.hub-editor-dialog-scroll') ??
      root.querySelector('.hub-invoice-editor-body');
    if (scroll) {
      scroll.style.overflow = 'visible';
      scroll.style.maxHeight = 'none';
      scroll.style.height = 'auto';
    }
    root.style.maxHeight = 'none';
    root.style.overflow = 'visible';
    root.style.height = 'auto';
    const footer = root.querySelector('.hub-editor-sticky-footer');
    if (footer) footer.style.display = 'none';
  });
  await page.waitForTimeout(100);
}

async function captureInvoiceHeadingThroughTotal(page, editor, width, invoicePath, basePaneHeight) {
  const title = editor.locator('.hub-invoice-editor-title');
  await title.waitFor({ state: 'visible', timeout: 15000 });
  let viewportH = basePaneHeight;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await page.setViewportSize({ width, height: viewportH });
    await scrollInvoiceEditorForCapture(editor, width, { requireInvoiceHeading: true });
    await page.waitForTimeout(200);
    const metrics = await editor.evaluate((root) => {
      const scroll =
        root.querySelector('.hub-editor-dialog-scroll') ??
        root.querySelector('.hub-invoice-editor-body') ??
        root;
      const titleEl = root.querySelector('.hub-invoice-editor-title');
      const totalBar = root.querySelector('.hub-invoice-totalbar');
      if (!titleEl || !totalBar) return null;
      const er = root.getBoundingClientRect();
      const tr = titleEl.getBoundingClientRect();
      const br = totalBar.getBoundingClientRect();
      return {
        titleInEditor: tr.top >= er.top - 2 && tr.bottom <= er.bottom + 2,
        totalInEditor: br.top >= er.top - 2 && br.bottom <= er.bottom + 2,
        span: br.bottom - tr.top,
        scrollViewH: scroll?.clientHeight ?? 0,
        editorH: er.height,
      };
    });
    if (metrics?.titleInEditor && metrics?.totalInEditor) break;
    viewportH += Math.max(120, Math.ceil((metrics?.span ?? 0) - (metrics?.scrollViewH ?? 0)) + 48);
  }
  await expandInvoiceEditorForCapture(page, editor);
  await scrollInvoiceEditorForCapture(editor, width, { requireInvoiceHeading: true });
  const headingText = (await title.innerText()).trim();
  if (!/9102/.test(headingText)) {
    throw new Error(`[fix2b-d@${width}] expected Invoice #9102 heading, got: ${headingText}`);
  }
  const titleBox = await editor.locator('.hub-invoice-editor-title').boundingBox();
  const totalBox = await editor.locator('.hub-invoice-totalbar').boundingBox();
  if (!titleBox || !totalBox) {
    throw new Error(`[fix2b-d@${width}] could not measure invoice heading/total`);
  }
  const pad = 12;
  const clip = {
    x: Math.max(0, Math.min(titleBox.x, totalBox.x) - pad),
    y: Math.max(0, titleBox.y - pad),
    width: Math.max(titleBox.width, totalBox.width) + pad * 2,
    height: totalBox.y + totalBox.height + 28 - titleBox.y + pad,
  };
  await page.screenshot({ path: invoicePath, clip });
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
  await page.addInitScript(() => {
    sessionStorage.setItem('fix2b-hold-preview', '1');
  });
  const href = `/jobs/audit-doc-job?auditAuth=1&look=fix2-unquoted-rate&tab=paperwork`;
  await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-job-invoice-preview]', { timeout: 30000 });
  await page.waitForSelector('[data-job-invoice-detail-reserved="1"] .skeleton', { timeout: 30000 });
  const loadingPath = `${OUT}/fix2b-a-loading-${width}.png`;
  const yLoading = await buttonY(page);
  await captureInvoiceHeaderBlock(page, loadingPath, width, height);
  await page.evaluate((evt) => {
    sessionStorage.removeItem('fix2b-hold-preview');
    window.dispatchEvent(new Event(evt));
  }, FIX2B_RELEASE_PREVIEW_EVENT);
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-job-next-detail]');
    return el?.textContent?.includes('inc GST') && !el.querySelector('.skeleton');
  }, { timeout: 30000 });
  const yResolved = await buttonY(page);
  if (Math.abs(yLoading - yResolved) > 0.5) {
    throw new Error(`[fix2b-a@${width}] invoice button y shifted ${yLoading} → ${yResolved}`);
  }
  const resolvedPath = `${OUT}/fix2b-a-resolved-${width}.png`;
  await captureInvoiceHeaderBlock(page, resolvedPath, width, height);
  const md5Loading = md5File(loadingPath);
  const md5Resolved = md5File(resolvedPath);
  if (md5Loading === md5Resolved) {
    throw new Error(`[fix2b-a@${width}] loading and resolved frames are byte-identical (md5=${md5Loading})`);
  }
  await context.close();
  return { width, yLoading, yResolved, loadingPath, resolvedPath, md5Loading, md5Resolved };
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
  const href = `/jobs/audit-doc-job?auditAuth=1&look=fix2-quoted&tab=paperwork`;
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
  await page.locator('.hub-job-invoice-next-preview .btn-primary').click();
  await page.waitForSelector('.hub-job-bill-zero-labour-sheet', { timeout: 30000 });
  await page.locator('.hub-job-bill-zero-labour-primary').click();
  await page.waitForFunction(() => {
    const header = document.querySelector('.hub-job-invoice-next-preview .btn-primary');
    const sheet = document.querySelector('.hub-job-bill-zero-labour-primary');
    const headerBusy = header?.textContent?.includes('Creating');
    const sheetBusy = sheet?.textContent?.includes('Creating');
    return headerBusy && sheetBusy;
  }, { timeout: 8000 });
  const busyPath = `${OUT}/fix2b-b-busy-${width}.png`;
  await page.setViewportSize({ width, height });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  const sheet = page.locator('.hub-job-bill-zero-labour-sheet');
  const hero = page.locator('h1.hub-jobs-hero');
  const card = page.locator('[data-job-invoice-preview]');
  const boxes = await Promise.all([
    hero.boundingBox(),
    card.boundingBox(),
    sheet.boundingBox(),
  ]);
  if (boxes.some(b => !b)) throw new Error(`[fix2b-b-busy@${width}] layout missing`);
  const pad = 8;
  const x = Math.max(0, Math.min(...boxes.map(b => b.x)) - pad);
  const y = Math.max(0, Math.min(...boxes.map(b => b.y)) - pad);
  const right = Math.min(width, Math.max(...boxes.map(b => b.x + b.width)) + pad);
  const bottom = Math.min(height, Math.max(...boxes.map(b => b.y + b.height)) + pad);
  await page.screenshot({
    path: busyPath,
    clip: { x, y, width: right - x, height: bottom - y },
  });
  await page.waitForFunction(() => sessionStorage.getItem('audit-fix2-invoice-row'), { timeout: 25000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1.hub-jobs-hero', { timeout: 30000 });
  await page.waitForFunction(() => {
    const btn = document.querySelector('.hub-jobs-sheet-body .hub-jobs-tools .btn-primary');
    const label = btn?.textContent?.trim() ?? '';
    return label === 'Share' || label === 'Send';
  }, { timeout: 30000 });
  const afterPath = `${OUT}/fix2b-b-after-${width}.png`;
  await captureJobHeaderArea(page, afterPath, width, height);
  await context.close();
  return { width, busyPath, afterPath, md5Busy: md5File(busyPath), md5After: md5File(afterPath) };
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
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-job-next-detail]');
    const text = el?.textContent ?? '';
    return text.includes('no rate set') && text.includes('inc GST');
  }, { timeout: 30000 });
  const headerPreviewMoney = (await page.locator('[data-job-next-detail]').innerText()).trim();
  const headerTotalMatch = headerPreviewMoney.match(/\$([\d,]+\.\d{2})/);
  if (!headerTotalMatch) {
    throw new Error(`[fix2b-d@${width}] header preview missing dollar total: ${headerPreviewMoney}`);
  }
  const previewTotal = Number(headerTotalMatch[1].replace(/,/g, ''));
  await page.locator('.hub-job-invoice-next-preview .btn-primary').click();
  await page.waitForSelector('.hub-job-bill-zero-labour-sheet', { timeout: 30000 });
  const optIn = page.locator('.hub-job-bill-zero-labour-sheet .hub-ops-form-check input');
  if (!(await optIn.isChecked())) await optIn.check();
  await page.waitForSelector('[data-job-bill-quoted-unpriced-warning]', { timeout: 30000 });
  await page.waitForSelector('[data-job-bill-quoted-add-rate]', { timeout: 30000 });
  await page.waitForFunction(() => {
    const money = document.querySelector('[data-job-bill-quoted-invoice-money]')?.textContent ?? '';
    return money.includes('no rate set') && money.includes('inc GST');
  });
  const previewMoney = (await page.locator('[data-job-bill-quoted-invoice-money]').innerText()).trim();
  const sheetPath = `${OUT}/.tmp-fix2b-d-sheet-${width}.png`;
  await page.locator('.hub-job-bill-zero-labour-sheet').screenshot({ path: sheetPath });
  await page.locator('[data-job-bill-quoted-create]').click();
  await page.waitForFunction(() => sessionStorage.getItem('audit-fix2-invoice-row'), { timeout: 20000 });
  const row = JSON.parse(await page.evaluate(() => sessionStorage.getItem('audit-fix2-invoice-row')));
  const createdTotal = Number(row.total);
  if (!previewMoney.includes('no rate set') || !previewMoney.includes('$898.00 inc GST')) {
    throw new Error(`[fix2b-d@${width}] sheet money line invalid: ${previewMoney}`);
  }
  if (Math.abs(createdTotal - 898) > 0.01) {
    throw new Error(`[fix2b-d@${width}] expected created total 898, got ${createdTotal}`);
  }
  if (Math.abs(previewTotal - createdTotal) > 0.01) {
    throw new Error(
      `[fix2b-d@${width}] preview $${previewTotal} (in [data-job-next-detail] behind sheet) != created $${createdTotal}`,
    );
  }
  await page.goto(`${BASE}/invoices?id=audit-fix2-invoice`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-invoice-total-inc-gst]', { timeout: 20000 });
  const createdText = await page.locator('[data-invoice-total-inc-gst]').innerText();
  const createdParsed = Number(createdText.replace(/[^0-9.-]/g, ''));
  if (Math.abs(createdParsed - createdTotal) > 0.01) {
    throw new Error(`[fix2b-d@${width}] editor total mismatch`);
  }
  const invoicePath = `${OUT}/.tmp-fix2b-d-invoice-${width}.png`;
  const editor = page.locator('.hub-invoice-editor');
  await editor.waitFor({ state: 'visible', timeout: 20000 });
  await captureInvoiceHeadingThroughTotal(page, editor, width, invoicePath, height);
  const finalPath = `${OUT}/fix2b-d-norate-${width}.png`;
  const paneHeight = height;
  await compositeNoRate(
    browser,
    sheetPath,
    invoicePath,
    finalPath,
    width,
    paneHeight,
    'Quoted opt-in sheet · no rate warning · $898.00 inc GST on money line',
    'Invoice #9102 heading through total (inc GST) pill',
  );
  await context.close();
  return {
    width,
    finalPath,
    previewMoney,
    previewTotal,
    previewTotalLocation: '[data-job-bill-quoted-invoice-money] and [data-job-next-detail]',
    createdTotal,
    md5: md5File(finalPath),
  };
}

async function captureErrorToast390() {
  const width = 390;
  const height = 844;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale: 'en-AU',
    timezoneId: 'Australia/Brisbane',
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    sessionStorage.setItem('fix2b-fail-create', '1');
    sessionStorage.removeItem('audit-fix2-invoice-row');
  });
  const href = `/jobs/audit-doc-job?auditAuth=1&look=fix2-unquoted-rate&tab=paperwork`;
  await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-job-invoice-preview]', { timeout: 30000 });
  await page.locator('.hub-job-invoice-next-preview .btn-primary').click();
  await page.waitForSelector('.ops-toast-host .border-red-200', { timeout: 15000 });
  const toastCount = await page.locator('.ops-toast-host > div').count();
  if (toastCount !== 1) {
    throw new Error(`[fix2b-error-toast@390] expected 1 toast, got ${toastCount}`);
  }
  const successTicks = await page.locator('.ops-toast-host .text-green-500').count();
  if (successTicks > 0) {
    throw new Error('[fix2b-error-toast@390] success-styled toast present');
  }
  const outPath = `${OUT}/fix2b-error-toast-390.png`;
  await page.setViewportSize({ width, height });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  const hero = page.locator('h1.hub-jobs-hero');
  const card = page.locator('[data-job-invoice-preview]');
  const toastHost = page.locator('.ops-toast-host');
  const boxes = await Promise.all([
    hero.boundingBox(),
    card.boundingBox(),
    toastHost.boundingBox(),
  ]);
  if (boxes.some(b => !b)) throw new Error('[fix2b-error-toast@390] layout missing');
  const pad = 8;
  const x = Math.max(0, Math.min(...boxes.map(b => b.x)) - pad);
  const y = Math.max(0, Math.min(...boxes.map(b => b.y)) - pad);
  const right = Math.min(width, Math.max(...boxes.map(b => b.x + b.width)) + pad);
  const bottom = Math.min(height, Math.max(...boxes.map(b => b.y + b.height)) + pad);
  await page.screenshot({
    path: outPath,
    clip: { x, y, width: right - x, height: bottom - y },
  });
  await context.close();
  return { outPath };
}

async function captureOptinUpdating390() {
  const width = 390;
  const height = 844;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale: 'en-AU',
    timezoneId: 'Australia/Brisbane',
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    sessionStorage.setItem('fix2b-hold-optin-preview', '1');
  });
  const href = `/jobs/audit-doc-job?auditAuth=1&look=fix2b-d-norate&tab=paperwork`;
  await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-job-invoice-preview]', { timeout: 30000 });
  await page.locator('.hub-job-invoice-next-preview .btn-primary').click();
  await page.waitForSelector('.hub-job-bill-zero-labour-sheet', { timeout: 30000 });
  const optIn = page.locator('.hub-job-bill-zero-labour-sheet .hub-ops-form-check input');
  if (!(await optIn.isChecked())) await optIn.check();
  await page.waitForSelector('[data-job-bill-quoted-invoice-updating]', { timeout: 30000 });
  const money = page.locator('[data-job-bill-quoted-invoice-money]');
  if (await money.count()) {
    throw new Error('[fix2b-optin-updating@390] stale money line visible during hold');
  }
  const createBtn = page.locator('[data-job-bill-quoted-create]');
  if (!(await createBtn.isDisabled())) {
    throw new Error('[fix2b-optin-updating@390] Create must be disabled while updating');
  }
  const outPath = `${OUT}/fix2b-optin-updating-390.png`;
  await page.locator('.hub-job-bill-zero-labour-sheet').screenshot({ path: outPath });
  await context.close();
  return { outPath };
}

async function captureTimeSaved390() {
  const width = 390;
  const height = 844;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale: 'en-AU',
    timezoneId: 'Australia/Brisbane',
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  let releaseDelay;
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (releaseDelay && url.includes('/rest/v1/')) {
      await releaseDelay;
    }
    await route.continue();
  });
  const href = `/jobs/audit-doc-job?auditAuth=1&look=fix2-clockoff-invoice&tab=paperwork`;
  await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-job-invoice-preview]', { timeout: 30000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-job-next-detail]');
    const text = el?.textContent ?? '';
    return text.includes('inc GST') && !text.includes('Job bill is empty');
  }, { timeout: 45000 });
  const cachedDetail = (await page.locator('[data-job-next-detail]').innerText()).trim();
  releaseDelay = new Promise(r => setTimeout(r, 6000));
  await page.evaluate((evt) => {
    window.dispatchEvent(new Event(evt));
  }, FIX2B_INVALIDATE_PREVIEW_EVENT);
  await page.waitForTimeout(150);
  const midDetail = (await page.locator('[data-job-next-detail]').innerText()).trim();
  if (midDetail.includes('Job bill is empty')) {
    throw new Error('[fix2b-d-time-saved@390] empty-bill flash during preview refetch');
  }
  if (!midDetail.includes('inc GST') && !midDetail.includes('From job')) {
    throw new Error(`[fix2b-d-time-saved@390] unexpected mid-refetch detail: ${midDetail}`);
  }
  const outPath = `${OUT}/fix2b-d-time-saved-390.png`;
  await captureInvoiceHeaderBlock(page, outPath, width, height);
  await context.close();
  return { outPath, cachedDetail, midDetail };
}

const report = [];
const allMd5 = new Map();
function trackMd5(path, label) {
  const hash = md5File(path);
  if (allMd5.has(hash)) {
    throw new Error(`duplicate frame md5 ${hash}: ${label} matches ${allMd5.get(hash)}`);
  }
  allMd5.set(hash, label);
  return hash;
}

for (const width of [390, 1280]) {
  const row = await captureAStable(width);
  row.md5Loading = trackMd5(row.loadingPath, `fix2b-a-loading-${width}`);
  row.md5Resolved = trackMd5(row.resolvedPath, `fix2b-a-resolved-${width}`);
  report.push(row);
}
for (const width of [390, 1280]) {
  const row = await captureBusyAndAfter(width);
  row.md5Busy = trackMd5(row.busyPath, `fix2b-b-busy-${width}`);
  row.md5After = trackMd5(row.afterPath, `fix2b-b-after-${width}`);
  report.push(row);
}
for (const width of [390, 1280]) {
  const row = await captureNoRate(width);
  row.md5 = trackMd5(row.finalPath, `fix2b-d-norate-${width}`);
  report.push(row);
}
{
  const row = await captureErrorToast390();
  row.md5 = trackMd5(row.outPath, 'fix2b-error-toast-390');
  report.push(row);
}
{
  const row = await captureTimeSaved390();
  row.md5 = trackMd5(row.outPath, 'fix2b-d-time-saved-390');
  report.push(row);
}
{
  const row = await captureOptinUpdating390();
  row.md5 = trackMd5(row.outPath, 'fix2b-optin-updating-390');
  report.push(row);
}

writeFileSync(`${OUT}/fix2b-look-report.json`, JSON.stringify({ report, allMd5: [...allMd5.entries()] }, null, 2));
console.log(JSON.stringify({ report, allMd5: [...allMd5.entries()] }, null, 2));
await browser.close();
console.log(`FIX-2b LOOK saved under ${OUT}`);
