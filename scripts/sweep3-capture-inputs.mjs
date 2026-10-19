import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const PHASE = process.env.SWEEP3_PHASE || 'after';
const OUT = process.env.SWEEP3_OUT || `/opt/cursor/artifacts/sweep3/${PHASE}`;

mkdirSync(OUT, { recursive: true });

const WIDTHS = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
];

const browser = await chromium.launch({ headless: true });
const table = [];

async function measure(page, extra = {}) {
  return page.evaluate((more) => {
    const root = document.documentElement;
    const errors = [...document.querySelectorAll('.field-inline-error')].map((el) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        id: el.id || null,
        text: (el.textContent || '').trim(),
        visible: r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none',
        top: Math.round(r.top),
        left: Math.round(r.left),
        width: Math.round(r.width),
        height: Math.round(r.height),
        clipped: style.overflow === 'hidden' && el.scrollWidth > el.clientWidth + 1,
      };
    });
    const clipped = [...document.querySelectorAll('label, p, h1, h2, button, input, select')].filter((el) => {
      const style = getComputedStyle(el);
      return style.overflow === 'hidden' && el.scrollWidth > el.clientWidth + 2;
    }).slice(0, 8).map((el) => (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 80));
    return {
      scrollWidth: root.scrollWidth,
      innerWidth: window.innerWidth,
      fits: root.scrollWidth <= window.innerWidth,
      errorCount: errors.length,
      errorsVisible: errors.filter((e) => e.visible).length,
      errors,
      clippedText: clipped,
      ...more,
    };
  }, extra);
}

async function shot(page, name, extra) {
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path, fullPage: true, type: 'png' });
  const metrics = await measure(page, extra);
  table.push({ frame: name, path, ...metrics });
  console.log(JSON.stringify({ frame: name, fits: metrics.fits, errors: metrics.errorsVisible, scrollWidth: metrics.scrollWidth, innerWidth: metrics.innerWidth }));
}

async function fill(page, selector, value) {
  const loc = page.locator(selector).first();
  if (await loc.count() === 0) return false;
  await loc.fill(value);
  return true;
}

async function clickText(page, re) {
  const btn = page.getByRole('button', { name: re }).first();
  if (await btn.count()) {
    await btn.click({ timeout: 4000 }).catch(() => {});
    return true;
  }
  return false;
}

async function withPage(width, height, fn) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: width <= 400,
    hasTouch: width <= 400,
    locale: 'en-AU',
    timezoneId: 'Australia/Brisbane',
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(12000);
  try {
    await fn(page);
  } finally {
    await ctx.close();
  }
}

async function captureClient(page, tag) {
  await page.goto(`${BASE}/clients/audit-doc-client?auditAuth=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await shot(page, `client-view-${tag}`);

  await page.goto(`${BASE}/clients?auditAuth=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await clickText(page, /New client/i);
  await page.waitForSelector('#client-form-name', { timeout: 8000 });
  await fill(page, '#client-form-name', 'B4a Throwaway');
  await fill(page, '#client-form-phone', 'abc');
  await fill(page, '#client-form-email', 'not-an-email');
  await clickText(page, /Add Client/i);
  await page.waitForTimeout(300);
  await shot(page, `client-edit-${tag}`);
}

async function captureCompany(page, tag) {
  await page.goto(`${BASE}/settings/company?auditAuth=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#company-abn', { timeout: 15000 });
  await page.waitForTimeout(400);
  await shot(page, `company-view-${tag}`);

  await fill(page, '#company-abn', '123');
  await fill(page, 'input[placeholder="0400 000 000"]', 'abc');
  const tax = page.locator('#settings-invoicing input[inputmode="decimal"]').first();
  if (await tax.count()) await tax.fill('-5');
  const markup = page.locator('#settings-invoicing input[inputmode="decimal"]').nth(1);
  if (await markup.count()) await markup.fill('1,5');
  const labour = page.locator('input[aria-label="Default labour rate ex GST"]');
  if (await labour.count()) await labour.fill('1,5');
  await clickText(page, /Save Changes/i);
  await page.waitForTimeout(300);

  const addPay = page.getByRole('button', { name: /Add a payment method/i }).first();
  if (await addPay.count()) {
    await addPay.scrollIntoViewIfNeeded();
    await addPay.click({ timeout: 4000 }).catch(() => {});
    await page.waitForSelector('input[aria-label="BSB"]', { timeout: 5000 }).catch(() => {});
  }
  const bsb = page.locator('input[aria-label="BSB"]').first();
  if (await bsb.count()) {
    await bsb.scrollIntoViewIfNeeded();
    await bsb.fill('abc12');
    await fill(page, 'input[aria-label="Account number"]', '12ab');
    const savePay = page.getByRole('button', { name: /Save payment methods/i }).first();
    await savePay.scrollIntoViewIfNeeded();
    await savePay.click({ timeout: 4000 }).catch(() => {});
  }
  await page.waitForTimeout(200);

  await fill(page, 'input[placeholder="noreply@yourcompany.com"]', 'nope');
  await fill(page, 'input[placeholder="587"]', '-5');
  await clickText(page, /Save Email Settings/i);
  await page.waitForTimeout(300);
  await shot(page, `company-edit-${tag}`);
}

for (const { width, height } of WIDTHS) {
  const tag = String(width);
  await withPage(width, height, (page) => captureClient(page, tag));
  await withPage(width, height, (page) => captureCompany(page, tag));
}

writeFileSync(`${OUT}/measured.json`, JSON.stringify(table, null, 2));
console.log('wrote', `${OUT}/measured.json`, table.length);
await browser.close();
