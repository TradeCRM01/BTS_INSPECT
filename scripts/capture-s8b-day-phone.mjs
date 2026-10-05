import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.S8B_OUT || '/opt/cursor/artifacts';
const DAY = '/schedule?look=week-board&view=day';
const WEEK = '/schedule?look=week-board&view=week';
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
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  return { ctx, page };
}

async function waitVisible(page, selector) {
  await page.waitForFunction((sel) => (
    [...document.querySelectorAll(sel)].some((el) => el.getBoundingClientRect().width > 0)
  ), selector, { timeout: 20000 });
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
    const hoursHead = board?.querySelector('.hub-day-hours-head');
    const crew = board?.querySelector('.hub-day-crew-lock');
    const edge = crew ? crew.getBoundingClientRect().right : 0;
    const firstHour = [...(hoursHead?.querySelectorAll('.hub-schedule-label') ?? [])]
      .map((el) => {
        const box = el.getBoundingClientRect();
        return {
          text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
          left: Math.round(box.left),
          width: Math.round(box.width),
          whole: box.left >= edge - 2 && box.width > 12,
        };
      })
      .find((label) => label.whole);
    return {
      start: board?.getAttribute('data-day-start'),
      firstHour,
      lockH: lockBox ? Math.round(lockBox.height) : null,
      gap: markBox && nameBox ? Math.round(nameBox.left - markBox.right) : null,
      hintDisplay: hintStyle?.display ?? null,
      chips,
    };
  });
}

function assertPhoneDayChrome(label, stats) {
  if (stats.lockH < 44 || stats.gap < 8 || stats.hintDisplay !== 'none') {
    throw new Error(`${label} chrome fail ${JSON.stringify(stats)}`);
  }
  if (!stats.chips.some((chip) => chip.visible && /Switchboard/.test(chip.text))) {
    throw new Error(`${label} missing title ${JSON.stringify(stats.chips)}`);
  }
  if (!stats.firstHour || !/^\d{1,2}\s*AM$/i.test(stats.firstHour.text)) {
    throw new Error(`${label} clipped hour ${JSON.stringify(stats.firstHour)}`);
  }
}

async function measureWeekBottom(page) {
  return page.evaluate(() => {
    const agenda = [...document.querySelectorAll('[data-week-agenda="1"]')]
      .find((el) => el.getBoundingClientRect().width > 0);
    if (!agenda) return { ok: false };
    agenda.scrollTop = agenda.scrollHeight;
    const days = [...agenda.querySelectorAll('[data-agenda-day]')];
    const last = days[days.length - 1];
    const empty = last?.querySelector('.hub-week-agenda-empty');
    const tab = document.querySelector('.shell-bottom-nav');
    const lastBox = last?.getBoundingClientRect();
    const emptyBox = empty?.getBoundingClientRect();
    const tabTop = tab?.getBoundingClientRect().top ?? window.innerHeight;
    const pad = agenda ? getComputedStyle(agenda).paddingBottom : null;
    return {
      lastDate: last?.getAttribute('data-agenda-day') ?? null,
      emptyText: (empty?.textContent || '').trim(),
      lastBottom: lastBox ? Math.round(lastBox.bottom) : null,
      emptyBottom: emptyBox ? Math.round(emptyBox.bottom) : null,
      tabTop: Math.round(tabTop),
      pad,
      above: !!(emptyBox && emptyBox.bottom <= tabTop + 1 && emptyBox.height > 0),
    };
  });
}

{
  const { ctx, page } = await openPage(375, 812, true, DAY);
  await waitVisible(page, '[data-day-board="1"]');
  const stats = await measurePhoneDay(page);
  console.log('s8b-day-375', stats);
  assertPhoneDayChrome('day 375', stats);
  await shot(page, 's8b-day-375.png');
  await ctx.close();
}

{
  const { ctx, page } = await openPage(390, 844, true, DAY);
  await waitVisible(page, '[data-day-board="1"]');
  const stats = await measurePhoneDay(page);
  console.log('s8b-day-390', stats);
  assertPhoneDayChrome('day 390', stats);
  await shot(page, 's8b-day-390.png');
  await ctx.close();
}

{
  const { ctx, page } = await openPage(375, 812, true, WEEK);
  await waitVisible(page, '[data-week-agenda="1"]');
  const bottom = await measureWeekBottom(page);
  console.log('s8b-week-375-bottom', bottom);
  if (!bottom.above || bottom.emptyText !== 'Nothing booked' || !/px/.test(bottom.pad ?? '')) {
    throw new Error(`week 375 bottom fail ${JSON.stringify(bottom)}`);
  }
  await shot(page, 's8b-week-375-bottom.png');
  await ctx.close();
}

{
  const { ctx, page } = await openPage(390, 844, true, WEEK);
  await waitVisible(page, '[data-week-agenda="1"]');
  const bottom = await measureWeekBottom(page);
  console.log('s8b-week-390-bottom', bottom);
  if (!bottom.above || bottom.emptyText !== 'Nothing booked') {
    throw new Error(`week 390 bottom fail ${JSON.stringify(bottom)}`);
  }
  await shot(page, 's8b-week-390-bottom.png');
  await ctx.close();
}

{
  const { ctx, page } = await openPage(1280, 900, false, DAY);
  await waitVisible(page, '[data-day-board="1"]');
  const desktop = await page.evaluate(() => {
    const board = [...document.querySelectorAll('[data-day-board="1"]')]
      .find((el) => el.getBoundingClientRect().width > 0);
    const pin = board?.querySelector('[data-day-chip-pin="1"]');
    const hint = board?.querySelector('.hub-day-drop-hint');
    const labels = [...(board?.querySelectorAll('.hub-schedule-label') ?? [])]
      .map((el) => (el.textContent || '').trim());
    return {
      start: board?.getAttribute('data-day-start'),
      pinSticky: pin ? getComputedStyle(pin).position : null,
      hintDisplay: hint ? getComputedStyle(hint).display : null,
      has6am: labels.some((label) => /6\s*AM/i.test(label)),
      has5am: labels.some((label) => /5\s*AM/i.test(label)),
    };
  });
  console.log('s8b-day-1280', desktop);
  if (
    desktop.pinSticky === 'sticky'
    || desktop.hintDisplay === 'none'
    || desktop.start !== '6'
    || !desktop.has6am
    || desktop.has5am
  ) {
    throw new Error(`day 1280 changed ${JSON.stringify(desktop)}`);
  }
  await shot(page, 's8b-day-1280.png');

  await page.locator('[data-day-board="1"]:visible [data-unassigned-lock="1"]').click();
  await page.waitForFunction(() => /New Job/.test(document.body.innerText), { timeout: 8000 });
  await shot(page, 's8b-day-1280-create.png');
  await ctx.close();
}

{
  const { ctx, page } = await openPage(375, 812, true, DAY);
  await waitVisible(page, '[data-day-board="1"]');
  await page.locator('[data-day-board="1"]:visible [data-unassigned-lock="1"]').click();
  await page.waitForTimeout(400);
  const opened = await page.evaluate(() => /New Job/.test(document.body.innerText));
  console.log('s8b-day-empty-375', { opened });
  if (opened) throw new Error('phone empty slot opened New Job');
  await shot(page, 's8b-day-empty-375.png');
  await ctx.close();
}

{
  const { ctx, page } = await openPage(390, 844, true, DAY);
  await waitVisible(page, '[data-day-board="1"]');
  await page.locator('[data-day-board="1"]:visible [data-unassigned-lock="1"]').click();
  await page.waitForTimeout(400);
  const opened = await page.evaluate(() => /New Job/.test(document.body.innerText));
  console.log('s8b-day-empty-390', { opened });
  if (opened) throw new Error('phone empty slot opened New Job');
  await shot(page, 's8b-day-empty-390.png');
  await ctx.close();
}

async function measureEarly(page) {
  await page.waitForFunction(() => (
    [...document.querySelectorAll('[data-schedule-job="look-job-early"]')]
      .some((el) => el.getBoundingClientRect().width > 0)
  ), { timeout: 20000 });
  return page.evaluate(() => {
    const board = [...document.querySelectorAll('[data-day-board="1"]')]
      .find((el) => el.getBoundingClientRect().width > 0);
    const crew = board?.querySelector('.hub-day-crew-lock');
    const edge = crew?.getBoundingClientRect().right ?? 0;
    const read = (id) => {
      const chip = document.querySelector(`[data-schedule-job="${id}"] [data-day-chip-pin="1"]`);
      const bar = document.querySelector(`[data-schedule-job="${id}"]`);
      const box = chip?.getBoundingClientRect();
      const barBox = bar?.getBoundingClientRect();
      const text = (chip?.textContent || '').replace(/\s+/g, ' ').trim();
      return {
        text,
        firstWord: text.split(/\s+/)[0] ?? '',
        left: box ? Math.round(box.left) : null,
        edge: Math.round(edge),
        visible: !!(box && box.right > edge + 1 && box.left < window.innerWidth && box.width > 8),
        barVisible: !!(barBox && barBox.right > edge + 8 && barBox.left < window.innerWidth - 8),
      };
    };
    const hoursHead = board?.querySelector('.hub-day-hours-head');
    const firstHour = [...(hoursHead?.querySelectorAll('.hub-schedule-label') ?? [])]
      .map((el) => {
        const box = el.getBoundingClientRect();
        return {
          text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
          left: Math.round(box.left),
          width: Math.round(box.width),
          whole: box.left >= edge - 2 && box.width > 12,
        };
      })
      .find((label) => label.whole);
    return {
      start: board?.getAttribute('data-day-start'),
      firstHour,
      early: read('look-job-early'),
      seven: read('look-job-seven'),
    };
  });
}

function assertEarly(label, early) {
  console.log(label, early);
  if (
    early.start !== '5'
    || !early.firstHour
    || !/^5\s*AM$/i.test(early.firstHour.text)
    || !early.early.visible
    || !early.early.barVisible
    || early.early.firstWord !== '05:30'
    || !/Early call-out/.test(early.early.text)
    || early.early.left == null
    || early.early.left < early.early.edge - 4
    || !early.seven.visible
    || !early.seven.barVisible
    || early.seven.firstWord !== '07:00'
    || !/Morning start/.test(early.seven.text)
  ) {
    throw new Error(`${label} fail ${JSON.stringify(early)}`);
  }
}

{
  const { ctx, page } = await openPage(375, 812, true, EARLY);
  await waitVisible(page, '[data-day-board="1"]');
  const early = await measureEarly(page);
  assertEarly('s8b-day-early-375', early);
  await shot(page, 's8b-day-early-375.png');
  await ctx.close();
}

{
  const { ctx, page } = await openPage(390, 844, true, EARLY);
  await waitVisible(page, '[data-day-board="1"]');
  const early = await measureEarly(page);
  assertEarly('s8b-day-early-390', early);
  await shot(page, 's8b-day-early-390.png');
  await ctx.close();
}

await browser.close();
console.log('wrote S8b frames to', OUT);
