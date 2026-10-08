// FIX-2 TIME-ON-INVOICE LOOK frames (390×844 + 1280×900). Preview | created invoice totals.
// Run: node scripts/capture-fix2-time-on-invoice-look.mjs (needs `npm run dev`).
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT_DIR || '/opt/cursor/artifacts';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(process.env.LOOK_BROWSER_CHANNEL ? { channel: process.env.LOOK_BROWSER_CHANNEL } : {}),
});

async function compositePair(browser, leftPng, rightPng, outPath, viewportWidth, viewportHeight) {
  const leftB64 = readFileSync(leftPng).toString('base64');
  const rightB64 = readFileSync(rightPng).toString('base64');
  const page = await browser.newPage();
  await page.setViewportSize({ width: viewportWidth * 2, height: viewportHeight });
  await page.setContent(`<!DOCTYPE html><html><body style="margin:0;background:#F5F0E6;display:flex;">
<img src="data:image/png;base64,${leftB64}" width="${viewportWidth}" alt="preview"/>
<img src="data:image/png;base64,${rightB64}" width="${viewportWidth}" alt="invoice"/>
</body></html>`);
  await page.screenshot({ path: outPath, type: 'png' });
  await page.close();
}

async function captureState({ state, width, optIn, zeroConfirm }) {
  const mobile = width === 390;
  const context = await browser.newContext({
    viewport: { width, height: mobile ? 844 : 900 },
    deviceScaleFactor: 1,
    locale: 'en-AU',
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await context.newPage();
  const href = `/jobs/audit-doc-job?auditAuth=1&look=${state}&tab=paperwork`;
  await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
  await page.setViewportSize({ width, height: mobile ? 844 : 900 });

  const quoted = state.startsWith('fix2-quoted');
  if (quoted) {
    await page.waitForSelector('[data-job-next-detail]', { timeout: 25000 });
    await page.locator('.hub-jobs-tools .btn-primary').click();
    await page.waitForSelector('[data-job-bill-quoted-invoice-money]', { timeout: 15000 });
    if (optIn) {
      await page.locator('.hub-ops-form-check input').check();
      await page.waitForTimeout(300);
    }
  } else if (zeroConfirm) {
    await page.waitForSelector('[data-job-next-detail]', { timeout: 25000 });
    await page.locator('.hub-jobs-tools .btn-primary').click();
    await page.waitForSelector('.hub-job-bill-zero-labour-sheet', { timeout: 15000 });
  } else {
    await page.waitForSelector('[data-job-next-detail]', { timeout: 25000 });
  }

  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const previewPath = `${OUT}/.tmp-${state}-preview-${width}.png`;
  await page.screenshot({ path: previewPath, type: 'png', fullPage: false });

  if (quoted) {
    await page.locator('.hub-job-bill-zero-labour-primary').click();
    await page.waitForTimeout(600);
  } else if (zeroConfirm) {
    await page.locator('.hub-job-bill-zero-labour-primary').click();
    await page.waitForTimeout(600);
  } else {
    await page.locator('.hub-jobs-tools .btn-primary').click();
    await page.waitForTimeout(600);
  }

  await page.goto(`${BASE}/invoices?id=audit-fix2-invoice`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  const invoicePath = `${OUT}/.tmp-${state}-invoice-${width}.png`;
  await page.screenshot({ path: invoicePath, type: 'png', fullPage: false });

  const outName = state.replace(/^fix2-/, 'fix2-');
  const finalPath = `${OUT}/${outName}-${width}.png`;
  await compositePair(browser, previewPath, invoicePath, finalPath, width, mobile ? 844 : 900);
  await context.close();
  return finalPath;
}

const states = [
  { state: 'fix2-quoted', optIn: false, zeroConfirm: false },
  { state: 'fix2-quoted-optin', optIn: true, zeroConfirm: false },
  { state: 'fix2-unquoted-rate', optIn: false, zeroConfirm: false },
  { state: 'fix2-unquoted-zero', optIn: false, zeroConfirm: true },
];

for (const width of [390, 1280]) {
  for (const cfg of states) {
    const path = await captureState({ ...cfg, width });
    console.log(path);
  }
}

await browser.close();
console.log(`FIX-2 LOOK composites saved under ${OUT}`);
