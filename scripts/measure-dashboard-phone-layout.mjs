import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT_DIR || '/opt/cursor/artifacts/dashboard-phone-sweep1b/before';
const HARNESS = '/?look=dashboard';
const PHASE = process.env.LOOK_PHASE || 'before';

mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: '375', width: 375, height: 812, isMobile: true, hasTouch: true },
  { name: '390', width: 390, height: 844, isMobile: true, hasTouch: true },
  { name: '1024', width: 1024, height: 768, isMobile: false, hasTouch: false },
  { name: '1280', width: 1280, height: 800, isMobile: false, hasTouch: false },
];

async function openHarness(page) {
  await page.goto(`${BASE}${HARNESS}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
  await page.waitForSelector('[data-dashboard-widgets="1"]', { timeout: 20000 });
  await page.waitForFunction(() => {
    const hero = document.querySelector('.dashboard-home-hero');
    const widgets = document.querySelector('[data-dashboard-widgets="1"]');
    return hero?.textContent?.includes('Dashboard') && !!widgets && widgets.innerText.trim().length > 0;
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

async function enterCustomize(page) {
  const more = page.locator('.dashboard-home-more > summary');
  await more.click();
  await page.getByRole('menuitem', { name: 'Customize' }).click();
  await page.waitForTimeout(300);
}

async function measure(page) {
  return page.evaluate(() => {
    const widgets = [...document.querySelectorAll('.dashboard-home-widget')].filter((el) => {
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
    });
    const rects = widgets.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        text: (el.innerText || '').split('\n')[0]?.slice(0, 40) ?? '',
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        right: Math.round(r.right),
        bottom: Math.round(r.bottom),
      };
    });

    const gaps = [];
    const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        const a = sorted[i];
        const b = sorted[j];
        const sameRow = Math.abs(a.y - b.y) < 8;
        const sameCol = Math.abs(a.x - b.x) < 8;
        if (sameRow) {
          const left = a.x <= b.x ? a : b;
          const right = a.x <= b.x ? b : a;
          const gap = right.x - (left.x + left.w);
          if (gap >= -2 && gap < 400) gaps.push({ kind: 'horizontal', px: gap, a: left.text, b: right.text });
        } else if (sameCol) {
          const top = a.y <= b.y ? a : b;
          const bottom = a.y <= b.y ? b : a;
          const gap = bottom.y - (top.y + top.h);
          if (gap >= -2 && gap < 400) {
            gaps.push({ kind: 'vertical', px: gap, a: top.text, b: bottom.text });
            break;
          }
        }
      }
    }

    const uniqueGaps = (kind) => {
      const values = [...new Set(gaps.filter((g) => g.kind === kind).map((g) => g.px))];
      return values;
    };

    const removeBtns = [...document.querySelectorAll('button[title="Remove widget"], button[aria-label="Remove widget"]')];
    const moveBtns = [...document.querySelectorAll(
      'button[aria-label="Move widget up"], button[aria-label="Move widget down"], button[title="Drag to move"]',
    )];
    const visibleControls = (els) => els.filter((el) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    }).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        label: el.getAttribute('aria-label') || el.getAttribute('title'),
        w: Math.round(r.width),
        h: Math.round(r.height),
        x: Math.round(r.x),
        y: Math.round(r.y),
      };
    });

    const clipped = [];
    for (const el of widgets) {
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth + 1) clipped.push({ kind: 'widget-right', text: el.innerText.slice(0, 40), right: Math.round(r.right) });
      if (r.left < -1) clipped.push({ kind: 'widget-left', text: el.innerText.slice(0, 40), left: Math.round(r.left) });
    }

    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      overflowPx: document.documentElement.scrollWidth - window.innerWidth,
      widgetCount: rects.length,
      widgets: rects,
      horizontalGapsPx: uniqueGaps('horizontal'),
      verticalGapsPx: uniqueGaps('vertical'),
      neighbourGaps: gaps.slice(0, 12),
      removeVisible: visibleControls(removeBtns),
      moveVisible: visibleControls(moveBtns),
      clipped,
      editing: !!document.querySelector('.dashboard-home-canvas.is-editing, .dashboard-home-widget-stack, .dashboard-home-widget.is-editing'),
    };
  });
}

const browser = await chromium.launch({ headless: true });
const report = { phase: PHASE, harness: HARNESS, rows: [] };

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
    locale: 'en-AU',
  });
  const page = await context.newPage();
  await openHarness(page);

  const view = await measure(page);
  const viewPath = `${OUT}/${vp.name}-view-${PHASE}.png`;
  await page.screenshot({ path: viewPath, type: 'png', fullPage: false });
  report.rows.push({ viewport: vp.name, mode: 'view', ...view, frame: viewPath });

  await enterCustomize(page);
  const firstVisible = page.locator('.dashboard-home-widget').locator('visible=true').first();
  if (await firstVisible.count()) {
    await firstVisible.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
  }
  const edit = await measure(page);
  const editPath = `${OUT}/${vp.name}-edit-${PHASE}.png`;
  await page.screenshot({ path: editPath, type: 'png', fullPage: false });
  report.rows.push({ viewport: vp.name, mode: 'edit', ...edit, frame: editPath });

  if (vp.isMobile) {
    const phonePath = `${OUT}/${vp.name}-edit-controls-${PHASE}.png`;
    await page.screenshot({ path: phonePath, type: 'png', fullPage: true });
    const down = page.locator('[data-dashboard-phone-stack="1"] button[aria-label="Move widget down"]').first();
    const remove = page.locator('[data-dashboard-phone-stack="1"] button[aria-label="Remove widget"]').first();
    let reorderFrame = null;
    let removeFrame = null;
    if (await down.count() && await down.isEnabled()) {
      await down.click();
      await page.waitForTimeout(200);
      reorderFrame = `${OUT}/${vp.name}-reorder-${PHASE}.png`;
      await page.screenshot({ path: reorderFrame, type: 'png', fullPage: false });
      const up = page.locator('[data-dashboard-phone-stack="1"] button[aria-label="Move widget up"]').nth(1);
      if (await up.count() && await up.isEnabled()) await up.click();
    }
    if (await remove.count()) {
      removeFrame = `${OUT}/${vp.name}-remove-target-${PHASE}.png`;
      await remove.scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      await page.screenshot({ path: removeFrame, type: 'png', fullPage: false });
    }
    report.rows.push({
      viewport: vp.name,
      mode: 'edit-controls-full',
      frame: phonePath,
      reorderFrame,
      removeFrame,
      removeVisible: edit.removeVisible,
      moveVisible: edit.moveVisible,
    });
  }

  await context.close();
}

await browser.close();
writeFileSync(`${OUT}/measure.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(`wrote ${OUT}`);
