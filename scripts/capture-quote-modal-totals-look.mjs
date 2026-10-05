import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = 'docs/look';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(process.env.LOOK_BROWSER_CHANNEL ? { channel: process.env.LOOK_BROWSER_CHANNEL } : {}),
});

async function proveTotals(page, { path, sheet, gst, total }) {
  await page.waitForSelector(sheet, { timeout: 20000 });
  await page.evaluate(({ gstSel, totalSel, panelSel }) => {
    const target = document.querySelector(totalSel) ?? document.querySelector(gstSel);
    const panel = document.querySelector(panelSel);
    target?.scrollIntoView({ block: 'end' });
    if (panel) panel.scrollTop = panel.scrollHeight;
  }, { gstSel: gst, totalSel: total, panelSel: sheet.replace('-sheet', '-editor') });

  const metrics = await page.evaluate(({ gstSel, totalSel, panelSel }) => {
    const vw = window.innerHeight;
    const vis = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        fullyInView: r.top >= -1 && r.bottom <= vw + 1,
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        vw,
      };
    };
    const panel = document.querySelector(panelSel);
    return {
      gst: vis(document.querySelector(gstSel)),
      total: vis(document.querySelector(totalSel)),
      panelScroll: panel ? { scrollH: panel.scrollHeight, clientH: panel.clientHeight, top: panel.scrollTop } : null,
    };
  }, { gstSel: gst, totalSel: total, panelSel: sheet.replace('-sheet', '-editor') });

  await page.screenshot({ path, type: 'png' });
  return metrics;
}

async function shot(viewport, url, dest, sels) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    locale: 'en-AU',
    ...(viewport.width <= 400 ? { isMobile: true, hasTouch: true } : {}),
  });
  const page = await context.newPage();
  await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' });
  const metrics = await proveTotals(page, { path: dest, ...sels });
  await context.close();
  return metrics;
}

const quoteSels = {
  sheet: '.hub-quote-sheet',
  gst: '.hub-quote-gst',
  total: '.hub-quote-totalbar',
};
const invoiceSels = {
  sheet: '.hub-invoice-sheet',
  gst: '.hub-invoice-gst',
  total: '.hub-invoice-totalbar',
};

const results = {
  quote390: await shot(
    { width: 390, height: 844 },
    '/quotes?id=audit-quote-gst&auditAuth=1',
    `${OUT}/quote-modal-totals-390.png`,
    quoteSels,
  ),
  quote1280: await shot(
    { width: 1280, height: 800 },
    '/quotes?id=audit-quote-gst&auditAuth=1',
    `${OUT}/quote-modal-totals-1280.png`,
    quoteSels,
  ),
  invoice390: await shot(
    { width: 390, height: 844 },
    '/invoices?id=audit-invoice-gst&auditAuth=1',
    `${OUT}/invoice-modal-totals-390.png`,
    invoiceSels,
  ),
  invoice1280: await shot(
    { width: 1280, height: 800 },
    '/invoices?id=audit-invoice-gst&auditAuth=1',
    `${OUT}/invoice-modal-totals-1280.png`,
    invoiceSels,
  ),
};

await browser.close();
console.log(JSON.stringify(results, null, 2));
