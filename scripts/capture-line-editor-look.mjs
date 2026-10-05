import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT || '/opt/cursor/artifacts/screenshots';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(process.env.LOOK_BROWSER_CHANNEL ? { channel: process.env.LOOK_BROWSER_CHANNEL } : {}),
});

async function measure(page) {
  return page.evaluate(() => {
    const editor = document.querySelector('.hub-line-editor');
    const line = document.querySelector('.hub-line-editor-line');
    const desc = document.querySelector('.hub-line-editor-desc');
    const input = desc?.querySelector('input.form-input-sm');
    const tag = document.querySelector('.hub-line-editor-desc .hub-quote-check-price');
    const qty = document.querySelector('.hub-line-editor-qty');
    const total = document.querySelector('.hub-line-editor-total');
    const del = document.querySelector('.hub-line-editor-del');
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        x: Math.round(r.x),
        y: Math.round(r.y),
        right: Math.round(r.right),
        bottom: Math.round(r.bottom),
      };
    };
    const cs = editor ? getComputedStyle(editor) : null;
    const lineCs = line ? getComputedStyle(line) : null;
    return {
      vw: window.innerWidth,
      editor: box(editor),
      editorContainer: cs ? { type: cs.containerType, name: cs.containerName } : null,
      line: box(line),
      lineAreas: lineCs?.gridTemplateAreas ?? null,
      lineCols: lineCs?.gridTemplateColumns ?? null,
      desc: box(desc),
      input: box(input),
      inputValue: input?.value ?? null,
      tag: box(tag),
      tagText: tag?.textContent ?? null,
      qty: box(qty),
      total: box(total),
      del: box(del),
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
}

async function shot({ width, height, url, click, dest }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale: 'en-AU',
  });
  const page = await context.newPage();
  await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 30000 });
  const sheet = url.includes('/quotes') ? '.hub-quote-sheet' : '.hub-invoice-sheet';
  await page.waitForSelector(sheet, { timeout: 20000 });
  await page.locator('summary[aria-label="More actions"]').click();
  await page.getByRole('menuitem', { name: click }).click();
  await page.waitForSelector('.hub-line-editor-line', { timeout: 20000 });
  await page.locator('.hub-line-editor').first().scrollIntoViewIfNeeded();
  const metrics = await measure(page);
  await page.screenshot({ path: dest, type: 'png' });
  await context.close();
  return metrics;
}

const results = {
  quote1280: await shot({
    width: 1280,
    height: 800,
    url: '/quotes?id=audit-quote-gst&auditAuth=1',
    click: 'Edit quote',
    dest: `${OUT}/line-editor-quote-1280.png`,
  }),
  quote1024: await shot({
    width: 1024,
    height: 800,
    url: '/quotes?id=audit-quote-gst&auditAuth=1',
    click: 'Edit quote',
    dest: `${OUT}/line-editor-quote-1024.png`,
  }),
  invoice1280: await shot({
    width: 1280,
    height: 800,
    url: '/invoices?id=audit-invoice-send&auditAuth=1',
    click: 'Edit invoice',
    dest: `${OUT}/line-editor-invoice-1280.png`,
  }),
  invoice1024: await shot({
    width: 1024,
    height: 800,
    url: '/invoices?id=audit-invoice-send&auditAuth=1',
    click: 'Edit invoice',
    dest: `${OUT}/line-editor-invoice-1024.png`,
  }),
};

console.log(JSON.stringify(results, null, 2));
await browser.close();
