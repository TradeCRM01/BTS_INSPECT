import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.TU05_OUT || '/workspace/grafter-proofs/sweep/tu05-after';
const HEIGHT = 800;
const WIDTHS = [375, 390, 1024, 1100, 1180, 1280];
const LONG_NAME = 'Brisbane Commercial Plumbing & Gas Services Pty Ltd';
const LIVE_NAME = 'Grafter CoS Test';

function measureInPage() {
  const header = document.querySelector('.shell-header');
  if (!header) return { error: 'no .shell-header', path: location.pathname };

  const isVisible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const nameOf = (el) => {
    const cls = (el.className && typeof el.className === 'string')
      ? el.className.trim().split(/\s+/).slice(0, 3).join('.')
      : '';
    const text = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
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
  const all = Array.from(document.querySelectorAll('*')).filter(isVisible);
  let maxRight = 0;
  let maxRightEl = '';
  let headerMaxRight = 0;
  let headerMaxRightEl = '';
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.right > maxRight) {
      maxRight = r.right;
      maxRightEl = nameOf(el);
    }
    if ((header === el || header.contains(el)) && r.right > headerMaxRight) {
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
      if (area > 0.5) {
        leafOverlaps.push({ a: nameOf(leaves[i]), b: nameOf(leaves[j]), area: Math.round(area * 10) / 10 });
      }
    }
  }

  const intentionalEllipsis = (el) => {
    const s = getComputedStyle(el);
    const titled = Boolean(el.getAttribute('title') || el.closest('[title]'));
    return titled && s.textOverflow === 'ellipsis' && (s.overflowX === 'hidden' || s.overflow === 'hidden');
  };

  const clippedText = [];
  for (const el of Array.from(header.querySelectorAll('*')).filter(isVisible)) {
    const text = (el.innerText || '').trim();
    if (!text) continue;
    if (el.scrollWidth > el.clientWidth + 1) {
      if (intentionalEllipsis(el)) continue;
      clippedText.push({ name: nameOf(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
    }
  }

  const fieldBtn = Array.from(header.querySelectorAll('nav button')).find((el) => /Field Work/.test(el.innerText || '') && isVisible(el));
  const fieldSpan = fieldBtn?.querySelector('span') || null;
  const fieldHeight = fieldSpan ? fieldSpan.getBoundingClientRect().height : null;

  const nameEl = header.querySelector('[data-shell-switcher-name]');
  const nameVisible = !!(nameEl && isVisible(nameEl));
  const nameTitle = nameEl?.getAttribute('title') || nameEl?.closest('button')?.getAttribute('title') || '';
  const nameTruncated = nameEl ? nameEl.scrollWidth > nameEl.clientWidth + 1 : false;
  const switcherBtnEl = nameEl?.closest('button') || null;
  const switcherRect = switcherBtnEl && isVisible(switcherBtnEl) ? switcherBtnEl.getBoundingClientRect() : null;

  const navLabels = Array.from(header.querySelectorAll('nav > div > button, nav button')).filter(isVisible).map((el) => ({
    text: (el.innerText || '').replace(/\s+/g, ' ').trim(),
    right: Math.round(el.getBoundingClientRect().right * 10) / 10,
    height: Math.round(el.querySelector('span')?.getBoundingClientRect().height || 0),
  }));

  const row = header.firstElementChild;
  const pastViewport = all
    .filter((el) => el.getBoundingClientRect().right > inner + 0.5)
    .map((el) => ({ name: nameOf(el), right: Math.round(el.getBoundingClientRect().right * 10) / 10 }))
    .slice(0, 8);

  return {
    path: location.pathname,
    innerWidth: inner,
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    scrollFits: document.documentElement.scrollWidth <= inner + 1,
    maxRight: Math.round(maxRight * 10) / 10,
    maxRightEl,
    maxRightFits: maxRight <= inner + 0.5,
    headerMaxRight: Math.round(headerMaxRight * 10) / 10,
    headerMaxRightEl,
    headerMaxRightFits: headerMaxRight <= inner + 0.5,
    leafOverlapCount: leafOverlaps.length,
    leafOverlaps,
    clippedTextCount: clippedText.length,
    clippedText,
    fieldWorkHeight: fieldHeight,
    fieldWorkOneLine: fieldHeight == null ? 'hidden' : fieldHeight <= 22,
    navLabels,
    navCount: navLabels.length,
    nameVisible,
    nameTitle,
    nameText: nameEl ? (nameEl.textContent || '').trim() : '',
    nameTruncated,
    nameHasTitle: Boolean(nameTitle),
    switcherRight: switcherRect ? Math.round(switcherRect.right * 10) / 10 : null,
    switcherFits: !switcherRect || switcherRect.right <= inner + 0.5,
    rowScroll: row ? { scrollWidth: row.scrollWidth, clientWidth: row.clientWidth } : null,
    pastViewport,
  };
}

async function waitReady(page, pageName) {
  await page.waitForSelector('.shell-header', { timeout: 20000 });
  if (pageName === 'dashboard') {
    await page.waitForSelector('[data-dashboard-home="1"], .dashboard-home', { timeout: 20000 }).catch(() => {});
  } else {
    await page.waitForSelector('.hub-jobs-list-doc, .ops-page', { timeout: 20000 }).catch(() => {});
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

async function setSwitcherName(page, name) {
  await page.evaluate((n) => {
    const el = document.querySelector('[data-shell-switcher-name]');
    if (!el) return false;
    el.textContent = n;
    el.setAttribute('title', n);
    const btn = el.closest('button');
    if (btn) {
      btn.setAttribute('title', n);
      btn.setAttribute('aria-label', n);
    }
    return true;
  }, name);
}

async function enterEdit(page, pageName) {
  if (pageName === 'dashboard') {
    const more = page.locator('.dashboard-home-more > summary').first();
    if (await more.count()) {
      await more.click();
      const customize = page.getByRole('menuitem', { name: 'Customize' });
      if (await customize.count()) {
        await customize.click();
        await page.waitForTimeout(250);
        return 'customize';
      }
    }
    return 'no-customize';
  }
  const add = page.getByRole('button', { name: /New job/i }).first();
  if (await add.count()) {
    await add.click();
    await page.waitForTimeout(250);
    return 'new-job';
  }
  return 'no-edit-control';
}

async function measurePage(browser, { width, pageName, mode, nameVariant, name }) {
  const ctx = await browser.newContext({
    viewport: { width, height: HEIGHT },
    deviceScaleFactor: 1,
    isMobile: width <= 400,
    hasTouch: width <= 400,
    locale: 'en-AU',
    timezoneId: 'Australia/Brisbane',
  });
  const page = await ctx.newPage();
  const url = pageName === 'jobs'
    ? `${BASE}/jobs?auditAuth=1&look=jobs-list`
    : `${BASE}/?auditAuth=1&look=dashboard`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitReady(page, pageName);
  if (name) await setSwitcherName(page, name);
  let editHow = null;
  if (mode === 'edit') editHow = await enterEdit(page, pageName);
  const data = await page.evaluate(measureInPage);
  if (!data) {
    await ctx.close();
    throw new Error(`measure returned empty for ${pageName} ${mode} @${width}`);
  }
  data.mode = mode;
  data.pageName = pageName;
  data.nameVariant = nameVariant;
  data.landed = await page.evaluate(() => location.pathname);
  data.editHow = editHow;
  data.width = width;

  const shotName = `${pageName}-${mode}-${nameVariant}-${width}-top120.png`;
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({
    path: `${OUT}/${shotName}`,
    clip: { x: 0, y: 0, width, height: Math.min(120, HEIGHT) },
  });
  data.screenshot = `${OUT}/${shotName}`;
  const desktop = width >= 768;
  data.headerPass = Boolean(
    !data.error
    && data.scrollFits
    && data.headerMaxRightFits
    && data.leafOverlapCount === 0
    && data.clippedTextCount === 0
    && (!desktop || data.switcherFits)
    && (!desktop || (data.nameVisible && data.nameHasTitle))
    && (!desktop || data.fieldWorkOneLine === true)
    && (!desktop || data.navCount === 5)
  );
  data.pass = Boolean(data.headerPass && data.maxRightFits);
  await ctx.close();
  return data;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.LOOK_CHROME || '/usr/bin/google-chrome',
  });
  const rows = [];
  const nameCases = [
    { nameVariant: 'live', name: LIVE_NAME },
    { nameVariant: 'long', name: LONG_NAME },
  ];
  for (const pageName of ['dashboard', 'jobs']) {
    for (const mode of ['view', 'edit']) {
      for (const width of WIDTHS) {
        const names = width >= 768 ? nameCases : [{ nameVariant: 'default', name: null }];
        for (const n of names) {
          const label = `${pageName} ${mode} ${n.nameVariant} @${width}`;
          process.stdout.write(`measuring ${label}...\n`);
          const row = await measurePage(browser, {
            width,
            pageName,
            mode,
            nameVariant: n.nameVariant,
            name: n.name,
          });
          rows.push(row);
          process.stdout.write(
            `  headerPass=${row.headerPass} pagePass=${row.pass} scroll=${row.documentScrollWidth}/${row.innerWidth} headerR=${row.headerMaxRight} pageR=${row.maxRight} overlaps=${row.leafOverlapCount} clipped=${row.clippedTextCount} switcherR=${row.switcherRight} fieldH=${row.fieldWorkHeight} edit=${row.editHow}\n`,
          );
        }
      }
    }
  }
  await browser.close();
  const outJson = `${OUT}/measurements.json`;
  writeFileSync(outJson, JSON.stringify({ rows }, null, 2));
  const headerFailed = rows.filter((r) => !r.headerPass);
  const pageFailed = rows.filter((r) => !r.pass);
  process.stdout.write(`wrote ${outJson} rows=${rows.length} headerFailed=${headerFailed.length} pageFailed=${pageFailed.length}\n`);
  if (headerFailed.length) {
    for (const f of headerFailed) {
      process.stdout.write(
        `HEADER FAIL ${f.pageName} ${f.mode} ${f.nameVariant} @${f.width} headerR=${f.headerMaxRight} el=${f.headerMaxRightEl} clipped=${JSON.stringify(f.clippedText)} overlaps=${JSON.stringify(f.leafOverlaps)}\n`,
      );
    }
    process.exit(1);
  }
  for (const f of pageFailed) {
    process.stdout.write(
      `PAGE NOTE ${f.pageName} ${f.mode} ${f.nameVariant} @${f.width} pageR=${f.maxRight} el=${f.maxRightEl}\n`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
