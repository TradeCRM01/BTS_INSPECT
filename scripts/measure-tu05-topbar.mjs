/**
 * TU-05 rendered top-bar guard. Not a Playwright test runner.
 *
 * Requires a Vite DEV server (auditAuth is import.meta.env.DEV only;
 * `vite preview` will not arm it). Playwright + Chrome.
 *
 *   npm run dev
 *   npm run measure:tu05
 *
 * Optional: LOOK_BASE_URL (default http://127.0.0.1:5173),
 * LOOK_CHROME (default /usr/bin/google-chrome).
 * Auth: /?auditAuth=1&look=dashboard. Injects the long company name.
 * Exit 1 unless .shell-header max rect.right ≤ innerWidth, leaf
 * interactive intersections are 0, Field Work is one line, and the
 * switcher name is one truncated line with that title.
 */
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const HEIGHT = 800;
const WIDTHS = [1024, 1100, 1180];
const LONG_NAME = 'Brisbane Commercial Plumbing & Gas Services Pty Ltd';

function measureHeader() {
  const header = document.querySelector('.shell-header');
  if (!header) return { error: 'no .shell-header' };

  const isVisible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const nameOf = (el) => {
    const cls = (typeof el.className === 'string') ? el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    const text = (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '') + (text ? '"' + text + '"' : '');
  };

  const intersectArea = (a, b) => {
    const x1 = Math.max(a.left, b.left);
    const y1 = Math.max(a.top, b.top);
    const x2 = Math.min(a.right, b.right);
    const y2 = Math.min(a.bottom, b.bottom);
    const w = x2 - x1;
    const h = y2 - y1;
    if (w <= 0.5 || h <= 0.5) return 0;
    return w * h;
  };

  const inner = window.innerWidth;
  let headerMaxRight = 0;
  let headerMaxRightEl = '';
  for (const el of [header, ...header.querySelectorAll('*')].filter(isVisible)) {
    const r = el.getBoundingClientRect();
    if (r.right > headerMaxRight) {
      headerMaxRight = r.right;
      headerMaxRightEl = nameOf(el);
    }
  }

  const leaves = Array.from(header.querySelectorAll('a, button, input, [role="button"], [role="link"]')).filter(isVisible);
  const leafOverlaps = [];
  for (let i = 0; i < leaves.length; i++) {
    for (let j = i + 1; j < leaves.length; j++) {
      const a = leaves[i].getBoundingClientRect();
      const b = leaves[j].getBoundingClientRect();
      const aContains = a.left <= b.left + 1 && a.right >= b.right - 1
        && a.top <= b.top + 1 && a.bottom >= b.bottom - 1
        && (a.width * a.height > b.width * b.height + 1);
      const bContains = b.left <= a.left + 1 && b.right >= a.right - 1
        && b.top <= a.top + 1 && b.bottom >= a.bottom - 1
        && (b.width * b.height > a.width * a.height + 1);
      if (aContains || bContains) continue;
      const area = intersectArea(a, b);
      if (area > 0.5) leafOverlaps.push({ a: nameOf(leaves[i]), b: nameOf(leaves[j]), area: Math.round(area * 10) / 10 });
    }
  }

  const fieldBtn = Array.from(header.querySelectorAll('nav button')).find((el) => /Field Work/.test(el.innerText || '') && isVisible(el));
  const fieldSpan = fieldBtn?.querySelector('span') || null;
  const fieldHeight = fieldSpan ? fieldSpan.getBoundingClientRect().height : null;
  const fieldNowrap = fieldSpan ? getComputedStyle(fieldSpan).whiteSpace === 'nowrap' : false;
  const nameEl = header.querySelector('[data-shell-switcher-name]');
  const nameHeight = nameEl && isVisible(nameEl) ? nameEl.getBoundingClientRect().height : null;
  const nameTitle = nameEl?.getAttribute('title') || nameEl?.closest('button')?.getAttribute('title') || '';
  const nameNowrap = nameEl && isVisible(nameEl) ? getComputedStyle(nameEl).whiteSpace === 'nowrap' : false;

  return {
    innerWidth: inner,
    headerMaxRight: Math.round(headerMaxRight * 10) / 10,
    headerMaxRightEl,
    headerFits: headerMaxRight <= inner + 0.5,
    leafOverlapCount: leafOverlaps.length,
    leafOverlaps,
    fieldWorkHeight: fieldHeight,
    fieldWorkOneLine: fieldHeight != null && fieldHeight <= 22,
    fieldNowrap,
    nameHeight,
    nameOneLine: nameHeight != null && nameHeight <= 22,
    nameNowrap,
    nameTitle,
    nameText: nameEl ? (nameEl.textContent || '').trim() : '',
  };
}

async function measureWidth(browser, width) {
  const ctx = await browser.newContext({
    viewport: { width, height: HEIGHT },
    deviceScaleFactor: 1,
    locale: 'en-AU',
    timezoneId: 'Australia/Brisbane',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?auditAuth=1&look=dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.shell-header [data-shell-switcher-name]', { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.evaluate((n) => {
    const el = document.querySelector('[data-shell-switcher-name]');
    if (!el) return;
    el.textContent = n;
    el.setAttribute('title', n);
    const btn = el.closest('button');
    if (btn) {
      btn.setAttribute('title', n);
      btn.setAttribute('aria-label', n);
    }
  }, LONG_NAME);
  await page.waitForTimeout(50);
  const data = await page.evaluate(measureHeader);
  await ctx.close();
  data.width = width;
  data.headerFits = Boolean(data.headerFits);
  data.pass = Boolean(
    !data.error
    && data.headerFits
    && data.leafOverlapCount === 0
    && data.fieldWorkOneLine
    && data.fieldNowrap
    && data.nameOneLine
    && data.nameNowrap
    && data.nameTitle === LONG_NAME
    && data.nameText === LONG_NAME
  );
  return data;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.LOOK_CHROME || '/usr/bin/google-chrome',
  });
  const rows = [];
  let failed = 0;
  try {
    for (const width of WIDTHS) {
      const row = await measureWidth(browser, width);
      rows.push(row);
      const mark = row.pass ? 'PASS' : 'FAIL';
      if (!row.pass) failed += 1;
      process.stdout.write(
        `${mark} @${width} headerR=${row.headerMaxRight}/${row.innerWidth} overlaps=${row.leafOverlapCount} fieldH=${row.fieldWorkHeight} fieldNowrap=${row.fieldNowrap} nameH=${row.nameHeight} nameNowrap=${row.nameNowrap} title=${row.nameTitle ? 'yes' : 'no'}\n`,
      );
      if (!row.pass) {
        process.stdout.write(`  why headerFits=${row.headerFits} el=${row.headerMaxRightEl} overlaps=${JSON.stringify(row.leafOverlaps)} fieldOne=${row.fieldWorkOneLine} fieldNowrap=${row.fieldNowrap} nameOne=${row.nameOneLine} nameNowrap=${row.nameNowrap}\n`);
      }
    }
  } finally {
    await browser.close();
  }
  if (failed) {
    process.stdout.write(`TU05 guard failed ${failed}/${rows.length}\n`);
    process.exit(1);
  }
  process.stdout.write(`TU05 guard passed ${rows.length}/${rows.length}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
