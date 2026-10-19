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
 * LOOK_CHROME (default /usr/bin/google-chrome),
 * TU05_WIDTHS (comma list), TU05_SKIP_CLICK=1,
 * TU05_NAMES (pipe-separated names; default Grafter and the long company name).
 *
 * The live app sets names via ?auditName=. This script never writes
 * title or aria-label. It only reads the app-rendered values.
 */
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const HEIGHT = 800;
const DEFAULT_WIDTHS = [375, 390, 768, 800, 900, 1000, 1024, 1100, 1180, 1280];
const WIDTHS = (process.env.TU05_WIDTHS || '')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);
const widths = WIDTHS.length ? WIDTHS : DEFAULT_WIDTHS;
const ONE_WORD_NAME = 'Grafter';
const LONG_NAME = 'Northside Plumbing & Gas Maintenance Pty Ltd';
const DEFAULT_NAMES = [ONE_WORD_NAME, LONG_NAME];
const NAMES = (process.env.TU05_NAMES || '')
  .split('|')
  .map((s) => s.trim())
  .filter(Boolean);
const names = NAMES.length ? NAMES : DEFAULT_NAMES;
const SKIP_CLICK = process.env.TU05_SKIP_CLICK === '1';

function pageUrl(name) {
  const u = new URL(BASE.includes('://') ? BASE : `http://${BASE}`);
  if (u.pathname === '/' || u.pathname === '') {
    if (!u.searchParams.has('auditAuth')) u.searchParams.set('auditAuth', '1');
    if (!u.searchParams.has('look')) u.searchParams.set('look', 'dashboard');
  }
  u.searchParams.set('auditName', name);
  return u.href;
}

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

  const countVisibleChars = (el) => {
    if (!el || !isVisible(el)) return 0;
    const node = Array.from(el.childNodes).find((n) => n.nodeType === Node.TEXT_NODE && (n.textContent || '').length);
    const text = node ? node.textContent : (el.textContent || '');
    if (!text) return 0;
    const clip = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    let ellipsisW = 0;
    if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 0.5) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = cs.font;
        ellipsisW = ctx.measureText('…').width;
      }
    }
    const rightLimit = clip.right - ellipsisW;
    if (!node) {
      return el.scrollWidth <= el.clientWidth + 0.5 ? text.length : 0;
    }
    const range = document.createRange();
    let visible = 0;
    for (let i = 0; i < node.length; i++) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      if (r.width > 0 && r.right <= rightLimit + 0.5 && r.left >= clip.left - 0.5) visible += 1;
    }
    return visible;
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

  let pageMaxRight = 0;
  for (const el of document.querySelectorAll('*')) {
    if (!isVisible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > pageMaxRight) pageMaxRight = r.right;
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

  const overflowingButtons = [];
  for (const el of Array.from(header.querySelectorAll('button')).filter(isVisible)) {
    if (el.scrollWidth > el.clientWidth) {
      overflowingButtons.push({
        name: nameOf(el),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      });
    }
  }

  const fieldBtn = Array.from(header.querySelectorAll('nav button')).find((el) => {
    const label = el.getAttribute('aria-label') || '';
    const text = el.innerText || '';
    return /Field Work/.test(label) || /Field Work/.test(text);
  }) || null;
  const fieldVisible = !!(fieldBtn && isVisible(fieldBtn));
  const fieldSpan = fieldBtn?.querySelector('span') || null;
  const fieldSpanVisible = !!(fieldSpan && isVisible(fieldSpan));
  const fieldHeight = fieldSpanVisible ? fieldSpan.getBoundingClientRect().height : (fieldVisible ? fieldBtn.getBoundingClientRect().height : null);
  const fieldNowrap = fieldSpan ? getComputedStyle(fieldSpan).whiteSpace === 'nowrap' : false;
  const nameEl = header.querySelector('[data-shell-switcher-name]');
  const switcherBtn = nameEl?.closest('button') || null;
  const nameVisible = !!(nameEl && isVisible(nameEl));
  const nameHeight = nameVisible ? nameEl.getBoundingClientRect().height : null;
  const nameNowrap = nameVisible ? getComputedStyle(nameEl).whiteSpace === 'nowrap' : false;
  const avatar = switcherBtn?.querySelector('[data-shell-switcher-avatar]') || switcherBtn?.querySelector('.rounded-full') || null;
  const chevron = switcherBtn?.querySelector('[data-shell-switcher-chevron]')
    || (switcherBtn ? Array.from(switcherBtn.querySelectorAll('svg')).at(-1) : null);
  const searchBtn = Array.from(header.querySelectorAll('button')).find((el) => {
    const label = el.getAttribute('aria-label') || '';
    const text = (el.innerText || '').trim();
    return label === 'Search' || text === 'Search' || text.startsWith('Search');
  }) || null;
  const searchLabel = searchBtn?.querySelector('span') || null;
  const searchLabelVisible = !!(searchLabel && isVisible(searchLabel));
  const searchRect = searchBtn && isVisible(searchBtn) ? searchBtn.getBoundingClientRect() : null;
  const searchInner = searchBtn ? (searchBtn.innerText || '').replace(/\s+/g, ' ').trim() : '';

  return {
    innerWidth: inner,
    documentScrollWidth: document.documentElement.scrollWidth,
    headerMaxRight: Math.round(headerMaxRight * 10) / 10,
    headerMaxRightEl,
    headerFits: headerMaxRight <= inner,
    pageMaxRight: Math.round(pageMaxRight * 10) / 10,
    pageFits: pageMaxRight <= inner,
    docFits: document.documentElement.scrollWidth <= inner,
    leafOverlapCount: leafOverlaps.length,
    leafOverlaps,
    overflowingButtons,
    buttonsFit: overflowingButtons.length === 0,
    fieldVisible,
    fieldWorkHeight: fieldHeight,
    fieldWorkOneLine: fieldHeight == null ? null : fieldHeight <= (fieldSpanVisible ? 22 : 56),
    fieldNowrap,
    nameVisible,
    nameHeight,
    nameOneLine: nameHeight != null && nameHeight <= 22,
    nameNowrap,
    nameText: nameEl ? (nameEl.textContent || '').trim() : '',
    switcherTitle: switcherBtn?.getAttribute('title') || '',
    switcherAria: switcherBtn?.getAttribute('aria-label') || '',
    visibleLetters: nameVisible ? countVisibleChars(nameEl) : 0,
    avatarWidth: avatar && isVisible(avatar) ? Math.round(avatar.getBoundingClientRect().width) : null,
    chevronWidth: chevron && isVisible(chevron) ? Math.round(chevron.getBoundingClientRect().width) : null,
    searchInnerText: searchInner,
    searchLabelDisplay: searchLabel ? getComputedStyle(searchLabel).display : '',
    searchWidth: searchRect ? Math.round(searchRect.width) : null,
    searchScrollWidth: searchBtn && isVisible(searchBtn) ? searchBtn.scrollWidth : null,
    searchClientWidth: searchBtn && isVisible(searchBtn) ? searchBtn.clientWidth : null,
    searchIconOnly: !!(searchBtn && isVisible(searchBtn) && !searchLabelVisible && searchInner === '' && searchRect && searchRect.width <= 40),
    searchButtonFits: !!(searchBtn && isVisible(searchBtn) && searchBtn.scrollWidth <= searchBtn.clientWidth),
  };
}

function rowPass(row, name) {
  const width = row.width;
  const md = width >= 768;
  const lg = width >= 1024;
  if (row.error) return false;
  if (!row.headerFits || !row.docFits || row.leafOverlapCount !== 0 || !row.buttonsFit) return false;
  if (md) {
    if (!row.searchNamed) return false;
    if (row.fieldWorkOneLine !== true) return false;
    if (row.switcherTitle !== name || row.switcherAria !== name) return false;
    if (row.nameText !== name) return false;
    if (!lg) {
      if (row.nameVisible) return false;
      if ((width === 768 || width === 800) && (!row.searchIconOnly || !row.searchButtonFits)) return false;
    } else {
      if (!row.fieldNowrap) return false;
      if (!row.nameVisible || !row.nameOneLine || !row.nameNowrap) return false;
      if (row.visibleLetters < Math.min(8, name.length)) return false;
      if (width === 1024 && (row.avatarWidth !== 28 || row.chevronWidth !== 13)) return false;
    }
  }
  if ((width === 768 || width === 800) && !SKIP_CLICK && !row.searchClickOk) return false;
  return true;
}

async function measureWidth(browser, width, name) {
  const ctx = await browser.newContext({
    viewport: { width, height: HEIGHT },
    deviceScaleFactor: 1,
    locale: 'en-AU',
    timezoneId: 'Australia/Brisbane',
  });
  const page = await ctx.newPage();
  await page.goto(pageUrl(name), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.shell-header [data-shell-switcher-name]', { state: 'attached', timeout: 20000 });
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(300);
  const data = await page.evaluate(measureHeader);
  data.width = width;
  data.name = name;
  const md = width >= 768;
  if (md) {
    const search = page.getByRole('button', { name: 'Search' });
    data.searchNamed = (await search.count()) >= 1 && await search.first().isVisible();
    if (!SKIP_CLICK && (width === 768 || width === 800) && data.searchNamed) {
      try {
        await search.first().click({ timeout: 4000 });
        const box = page.locator('.overlay-backdrop input, .overlay-panel-xl input, input[placeholder*="Search"]');
        await box.first().waitFor({ state: 'visible', timeout: 4000 });
        data.searchClickOk = true;
      } catch (err) {
        data.searchClickOk = false;
        data.searchClickErr = String(err.message || err).split('\n')[0];
      }
    } else {
      data.searchClickOk = true;
    }
  } else {
    data.searchNamed = true;
    data.searchClickOk = true;
  }
  await ctx.close();
  data.headerFits = Boolean(data.headerFits);
  data.pass = rowPass(data, name);
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
    for (const name of names) {
      for (const width of widths) {
        const row = await measureWidth(browser, width, name);
        rows.push(row);
        const mark = row.pass ? 'PASS' : 'FAIL';
        if (!row.pass) failed += 1;
        process.stdout.write(
          `${mark} name=${JSON.stringify(name)} @${width} headerR=${row.headerMaxRight}/${row.innerWidth} pageR=${row.pageMaxRight} overlaps=${row.leafOverlapCount} btnOverflow=${row.overflowingButtons?.length || 0} fieldH=${row.fieldWorkHeight} nameH=${row.nameHeight} nameVis=${row.nameVisible} letters=${row.visibleLetters} title=${row.switcherTitle === name ? 'ok' : 'MISMATCH'} search=${row.searchNamed ? 'named' : 'MISSING'} iconOnly=${row.searchIconOnly} avatar=${row.avatarWidth} chevron=${row.chevronWidth} click=${row.searchClickOk ? 'ok' : row.searchClickErr || 'fail'}\n`,
        );
        if (!row.pass) {
          process.stdout.write(`  why headerFits=${row.headerFits} el=${row.headerMaxRightEl} overlaps=${JSON.stringify(row.leafOverlaps)} buttons=${JSON.stringify(row.overflowingButtons)} fieldOne=${row.fieldWorkOneLine} nameOne=${row.nameOneLine} letters=${row.visibleLetters} title=${JSON.stringify(row.switcherTitle)} aria=${JSON.stringify(row.switcherAria)} searchNamed=${row.searchNamed} iconOnly=${row.searchIconOnly} click=${row.searchClickOk}\n`);
        }
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
