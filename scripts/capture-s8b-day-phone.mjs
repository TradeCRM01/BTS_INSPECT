import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.S8B_OUT || '/opt/cursor/artifacts';
const DAY = '/schedule?look=week-board&view=day';
const EARLY = '/schedule?look=week-board&view=day&early=1';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function openPage(width, height, isPhone, path) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: isPhone,
    hasTouch: isPhone,
    locale: 'en-AU',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-week-sheet="1"]', { timeout: 20000 });
  await page.waitForFunction(() => {
    const boards = [...document.querySelectorAll('[data-day-board="1"]')];
    return boards.some((el) => el.getBoundingClientRect().width > 0);
  }, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  return { ctx, page };
}

async function shot(page, file) {
  await page.screenshot({ path: `${OUT}/${file}`, type: 'png' });
  console.log('wrote', file);
}

async function measurePhoneDay(page) {
  return page.evaluate(() => {
    const board = [...document.querySelectorAll('[data-day-board="1"]')]
      .find((el) => el.getBoundingClientRect().width > 0);
    const lock = board?.querySelector('[data-unassigned-lock="1"]');
    const mark = lock?.querySelector('.ops-crew-mark');
    const name = lock?.querySelector('.hub-schedule-crew-name');
    const hint = board?.querySelector('.hub-day-drop-hint');
    const hintStyle = hint ? getComputedStyle(hint) : null;
    const lockBox = lock?.getBoundingClientRect();
    const markBox = mark?.getBoundingClientRect();
    const nameBox = name?.getBoundingClientRect();
    const chips = [...(board?.querySelectorAll('[data-day-chip-pin="1"]') ?? [])].map((el) => {
      const box = el.getBoundingClientRect();
      const crew = board.querySelector('.hub-day-crew-lock');
      const edge = crew ? crew.getBoundingClientRect().right : 0;
      return {
        text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
        left: Math.round(box.left),
        edge: Math.round(edge),
        visible: box.width > 0 && box.right > edge + 1 && box.left < window.innerWidth,
      };
    });
    return {
      lockH: lockBox ? Math.round(lockBox.height) : null,
      gap: markBox && nameBox ? Math.round(nameBox.left - markBox.right) : null,
      hintDisplay: hintStyle?.display ?? null,
      chips,
    };
  });
}

{
  const { ctx, page } = await openPage(375, 812, true, DAY);
  const stats = await measurePhoneDay(page);
  console.log('s8b-day-375', stats);
  if (stats.lockH < 44 || stats.gap < 8 || stats.hintDisplay !== 'none') {
    throw new Error(`day 375 fail ${JSON.stringify(stats)}`);
  }
  if (!stats.chips.some((chip) => chip.visible && /Switchboard/.test(chip.text))) {
    throw new Error(`day 375 missing title ${JSON.stringify(stats.chips)}`);
  }
  await shot(page, 's8b-day-375.png');
  await ctx.close();
}

{
  const { ctx, page } = await openPage(390, 844, true, DAY);
  const stats = await measurePhoneDay(page);
  console.log('s8b-day-390', stats);
  if (stats.lockH < 44 || stats.gap < 8 || stats.hintDisplay !== 'none') {
    throw new Error(`day 390 fail ${JSON.stringify(stats)}`);
  }
  await shot(page, 's8b-day-390.png');
  await ctx.close();
}

{
  const { ctx, page } = await openPage(1280, 900, false, DAY);
  const desktop = await page.evaluate(() => {
    const board = [...document.querySelectorAll('[data-day-board="1"]')]
      .find((el) => el.getBoundingClientRect().width > 0);
    const pin = board?.querySelector('[data-day-chip-pin="1"]');
    const hint = board?.querySelector('.hub-day-drop-hint');
    return {
      pinSticky: pin ? getComputedStyle(pin).position : null,
      hintDisplay: hint ? getComputedStyle(hint).display : null,
    };
  });
  console.log('s8b-day-1280', desktop);
  if (desktop.pinSticky === 'sticky' || desktop.hintDisplay === 'none') {
    throw new Error(`day 1280 changed ${JSON.stringify(desktop)}`);
  }
  await shot(page, 's8b-day-1280.png');
  await ctx.close();
}

{
  const { ctx, page } = await openPage(375, 812, true, EARLY);
  await page.waitForFunction(() => (
    [...document.querySelectorAll('[data-schedule-job="look-job-early"]')]
      .some((el) => el.getBoundingClientRect().width > 0)
  ), { timeout: 20000 });
  await page.evaluate(() => {
    const track = [...document.querySelectorAll('[data-day-hours="1"]')]
      .find((el) => el.getBoundingClientRect().width > 0);
    if (!track) return;
    const eight = [...track.querySelectorAll('.hub-schedule-label')]
      .find((el) => /8\s*AM/i.test(el.textContent || ''));
    const lock = track.querySelector('.hub-day-crew-lock');
    if (!eight || !lock) return;
    track.scrollLeft += eight.getBoundingClientRect().left - lock.getBoundingClientRect().right;
  });
  await page.waitForTimeout(200);
  const early = await page.evaluate(() => {
    const chip = document.querySelector('[data-schedule-job="look-job-early"] [data-day-chip-pin="1"]');
    const crew = [...document.querySelectorAll('.hub-day-crew-lock')]
      .find((el) => el.getBoundingClientRect().width > 0);
    const box = chip?.getBoundingClientRect();
    const edge = crew?.getBoundingClientRect().right ?? 0;
    const text = (chip?.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      text,
      firstWord: text.split(/\s+/)[0] ?? '',
      left: box ? Math.round(box.left) : null,
      edge: Math.round(edge),
      visible: !!(box && box.right > edge + 1 && box.left < window.innerWidth),
    };
  });
  console.log('s8b-day-early-375', early);
  if (!early.visible || early.firstWord !== '06:30' || !/Early call-out/.test(early.text)) {
    throw new Error(`early 375 fail ${JSON.stringify(early)}`);
  }
  await shot(page, 's8b-day-early-375.png');
  await ctx.close();
}

await browser.close();
console.log('wrote S8b frames to', OUT);
