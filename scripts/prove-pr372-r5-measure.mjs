import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT || '/tmp/pr372-r5-measure';
mkdirSync(OUT, { recursive: true });

const widths = [
  { name: '375', width: 375, height: 812 },
  { name: '390', width: 390, height: 844 },
  { name: '1024', width: 1024, height: 768 },
  { name: '1280', width: 1280, height: 800 },
];

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
});

function measurePage() {
  const innerWidth = window.innerWidth;
  const scrollWidth = document.documentElement.scrollWidth;
  const nodes = [...document.querySelectorAll('body *')].filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  let maxRight = 0;
  const clipped = [];
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (el.getAttribute('aria-hidden') === 'true') continue;
    if ((style.position === 'fixed' || style.position === 'absolute') && (r.right <= 0 || r.left >= innerWidth)) continue;
    if (el.classList.contains('shell-root')) continue;
    let scrolled = false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if ((ps.overflowX === 'auto' || ps.overflowX === 'scroll') && p.scrollWidth > p.clientWidth + 1) {
        scrolled = true;
        break;
      }
    }
    if (scrolled) continue;
    if (r.right > maxRight) maxRight = r.right;
    const text = (el.textContent ?? el.value ?? '').trim();
    if (!text) continue;
    const overflowHidden = style.overflowX === 'hidden' || style.overflow === 'hidden' || style.textOverflow === 'ellipsis';
    if (overflowHidden && el.scrollWidth > el.clientWidth + 1) {
      clipped.push({
        tag: el.id || el.className?.toString?.().slice(0, 60) || el.tagName,
        text: text.slice(0, 80),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      });
    }
  }
  const err = document.getElementById('contract-next-service-date-error')
    || document.getElementById('compliance-first-due-date-error');
  let error = null;
  if (err) {
    const r = err.getBoundingClientRect();
    error = {
      text: err.textContent,
      right: Math.round(r.right),
      bottom: Math.round(r.bottom),
      visible: r.width > 0 && r.height > 0,
      clipped: err.scrollWidth > err.clientWidth + 1,
    };
  }
  return {
    innerWidth,
    scrollWidth,
    maxRight: Math.round(maxRight),
    overflowOk: scrollWidth <= innerWidth && maxRight <= innerWidth + 1,
    clipped,
    error,
  };
}

async function openView(page) {
  await page.goto(`${BASE}/contracts?auditAuth=1`, { waitUntil: 'networkidle' });
  await page.waitForSelector('h1');
}

async function openEdit(page, { withError = false } = {}) {
  await openView(page);
  await page.getByRole('button', { name: /New Contract|Create your first contract/i }).first().click();
  await page.waitForSelector('#contract-next-service-date');
  if (withError) {
    const next = page.locator('#contract-next-service-date');
    await next.click();
    await next.pressSequentially('21/10/20', { delay: 15 });
    await next.press('Tab');
    await page.getByRole('button', { name: /^Save$/i }).click();
    await page.waitForSelector('#contract-next-service-date-error, #contract-next-service-date-field-error', { timeout: 5000 });
  }
}

const rows = [];
for (const vp of widths) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    isMobile: vp.width <= 400,
    hasTouch: vp.width <= 400,
    locale: 'en-AU',
    timezoneId: 'Australia/Perth',
  });
  const page = await ctx.newPage();
  for (const [mode, opener] of [
    ['view', () => openView(page)],
    ['edit', () => openEdit(page)],
    ['edit-error', () => openEdit(page, { withError: true })],
  ]) {
    await opener();
    await page.evaluate(() => document.fonts.ready);
    const m = await page.evaluate(measurePage);
    const shot = `${OUT}/contracts-${mode}-${vp.name}.png`;
    await page.screenshot({ path: shot, fullPage: false });
    rows.push({ mode, width: vp.name, ...m, shot });
    console.log(JSON.stringify({ mode, width: vp.name, overflowOk: m.overflowOk, scrollWidth: m.scrollWidth, innerWidth: m.innerWidth, maxRight: m.maxRight, clipped: m.clipped.length, error: m.error }, null, 2));
  }
  await ctx.close();
}

const ok = rows.every(r => r.overflowOk && r.clipped.length === 0 && (r.mode !== 'edit-error' || (r.error?.visible && !r.error.clipped)));
writeFileSync(`${OUT}/viewport-measure.json`, JSON.stringify({ ok, rows }, null, 2));
console.log(JSON.stringify({ ok, count: rows.length, fail: rows.filter(r => !r.overflowOk || r.clipped.length || (r.mode === 'edit-error' && !r.error?.visible)) }, null, 2));
await browser.close();
if (!ok) process.exit(1);
