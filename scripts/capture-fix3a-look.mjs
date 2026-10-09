// FIX-3a LOOK — phone viewport shots (collapsed) + 1280×800 viewport (app chrome).
// Run: node scripts/capture-fix3a-look.mjs
// Main compare (seed-only on origin/main worktree): LOOK_BASE_URL=http://127.0.0.1:5174 node scripts/capture-fix3a-look.mjs --main-1280
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT_DIR || '/opt/cursor/artifacts';
const STORE = process.env.LOOK_STORE_DIR || '/cursor/stores/self/artifacts';
const mainOnly = process.argv.includes('--main-1280');
const PATH = '/schedule?auditAuth=1&look=fix3a-schedule';

mkdirSync(OUT, { recursive: true });
mkdirSync(STORE, { recursive: true });

function md5File(path) {
  return createHash('md5').update(readFileSync(path)).digest('hex');
}

function saveBoth(file) {
  const from = `${OUT}/${file}`;
  copyFileSync(from, `${STORE}/${file}`);
  return md5File(from);
}

const browser = await chromium.launch({ headless: true });

async function scrollAgendaToBottom(page) {
  await page.evaluate(() => {
    const agenda = document.querySelector('[data-week-agenda="1"]');
    if (!agenda) return;
    agenda.scrollTop = agenda.scrollHeight;
  });
  await page.waitForTimeout(200);
}

/** Chip must be in the viewport after scrolling the week agenda. */
async function assertChipInViewport(page) {
  const box = await page.evaluate(() => {
    const chip = document.querySelector('[data-schedule-unscheduled-chip="1"]');
    if (!chip) return { ok: false, reason: 'no chip' };
    const r = chip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const inside = r.top >= 0 && r.left >= 0 && r.bottom <= vh && r.right <= vw && r.width > 0;
    return {
      ok: inside,
      rect: { top: r.top, left: r.left, bottom: r.bottom, right: r.right, w: r.width, h: r.height },
      viewport: { w: vw, h: vh },
    };
  });
  if (!box.ok) throw new Error(`chip not fully in viewport ${JSON.stringify(box)}`);
  return box;
}

async function assertViewportHas(page, needles) {
  const text = await page.locator('body').innerText();
  for (const needle of needles) {
    if (!text.includes(needle)) throw new Error(`viewport missing "${needle}"`);
  }
}

async function shotCollapsedViewport(page, file) {
  await scrollAgendaToBottom(page);
  await assertChipInViewport(page);
  await page.screenshot({ path: `${OUT}/${file}`, type: 'png', fullPage: false });
  const md5 = saveBoth(file);
  console.log('wrote', file, md5);
  return md5;
}

async function openPhone(width, height) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: 'en-AU',
    timezoneId: 'Australia/Brisbane',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${PATH}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-week-agenda="1"]', { timeout: 30000 });
  await page.waitForSelector('[data-schedule-unscheduled-chip="1"]', { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  return { ctx, page };
}

async function captureDesktop1280(file) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    locale: 'en-AU',
    timezoneId: 'Australia/Brisbane',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${PATH}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-week-sheet="1"]', { timeout: 30000 });
  await page.waitForFunction(() => (
    [...document.querySelectorAll('[data-week-board="1"]')]
      .some((el) => el.getBoundingClientRect().width > 0)
  ), { timeout: 20000 });
  const layout = await page.evaluate(() => {
    const chip = document.querySelector('[data-schedule-unscheduled-chip="1"]');
    const board = [...document.querySelectorAll('[data-week-board="1"]')]
      .find((el) => el.getBoundingClientRect().width > 0);
    const chipBox = chip?.getBoundingClientRect();
    const boardBox = board?.getBoundingClientRect();
    return {
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
      chipVisible: !!chipBox && chipBox.width > 0 && chipBox.height > 0,
      boardWidth: boardBox?.width ?? 0,
      boardHeight: boardBox?.height ?? 0,
      boardTop: boardBox?.top ?? 0,
    };
  });
  if (layout.viewportW !== 1280 || layout.viewportH !== 800) {
    throw new Error(`viewport mismatch ${JSON.stringify(layout)}`);
  }
  if (layout.chipVisible) throw new Error(`phone chip visible on desktop ${JSON.stringify(layout)}`);
  if (layout.boardWidth < 400 || layout.boardHeight < 200) {
    throw new Error(`week board not visible in viewport ${JSON.stringify(layout)}`);
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${file}`, type: 'png', fullPage: false });
  const md5 = saveBoth(file);
  console.log('wrote', file, md5, layout);
  await ctx.close();
  return md5;
}

const md5s = {};

if (mainOnly) {
  md5s.desktop1280Main = await captureDesktop1280('fix3a-1280-main.png');
} else {
  {
    const { ctx, page } = await openPhone(375, 844);
    const collapsed = await page.locator('[data-schedule-unscheduled-chip="1"]').getAttribute('aria-expanded');
    if (collapsed === 'true') throw new Error('375 chip should start collapsed');
    await assertViewportHas(page, ['Fri 9 Oct', 'Carpet stretch', 'Unscheduled · 17']);
    md5s.collapsed375 = await shotCollapsedViewport(page, 'fix3a-collapsed-375.png');
    await ctx.close();
  }

  {
    const { ctx, page } = await openPhone(390, 844);
    await assertViewportHas(page, ['Fri 9 Oct', 'Carpet stretch', 'Unscheduled · 17']);
    md5s.collapsed390 = await shotCollapsedViewport(page, 'fix3a-collapsed-390.png');
    await ctx.close();
  }

  {
    const { ctx, page } = await openPhone(390, 844);
    const chip = page.locator('[data-schedule-unscheduled-chip="1"]');
    await scrollAgendaToBottom(page);
    await chip.scrollIntoViewIfNeeded();
    await chip.click({ force: true });
    await page.waitForFunction(() => (
      document.querySelector('[data-schedule-unscheduled-chip="1"]')?.getAttribute('aria-expanded') === 'true'
    ), { timeout: 10000 });
    await page.waitForSelector('[data-schedule-unscheduled-list="1"]', { state: 'visible', timeout: 10000 });
    await assertViewportHas(page, [
      'Unscheduled · 17',
      'Leak under kitchen sink',
      'Split-system regas',
    ]);
    const listCount = await page.locator('[data-schedule-rail-job]').count();
    if (listCount < 2) throw new Error(`expected ≥2 rail jobs, got ${listCount}`);
    const heights = await page.evaluate(() => ({
      listH: document.querySelector('[data-schedule-unscheduled-list="1"]')?.scrollHeight ?? 0,
    }));
    if (heights.listH < 80) throw new Error(`expanded list too short ${JSON.stringify(heights)}`);
    await page.locator('.hub-phone-unscheduled').scrollIntoViewIfNeeded();
    await page.locator('.hub-phone-unscheduled').screenshot({
      path: `${OUT}/fix3a-expanded-390.png`,
      type: 'png',
    });
    md5s.expanded390 = saveBoth('fix3a-expanded-390.png');
    console.log('wrote fix3a-expanded-390.png', md5s.expanded390);
    await ctx.close();
  }

  md5s.desktop1280 = await captureDesktop1280('fix3a-1280.png');
}

await browser.close();

if (!mainOnly) {
  const unique = new Set(Object.values(md5s));
  if (unique.size !== Object.keys(md5s).length) {
    throw new Error(`duplicate frame md5s ${JSON.stringify(md5s)}`);
  }
}

console.log(JSON.stringify({ md5s, mainOnly, path: PATH, base: BASE }, null, 2));
