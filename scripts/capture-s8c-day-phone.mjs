import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.S8C_OUT || '/opt/cursor/artifacts';
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
    const hoursHead = board?.querySelector('.hub-day-hours-head');
    const firstHour = [...(hoursHead?.querySelectorAll('.hub-schedule-label') ?? [])]
      .map((el) => {
        const box = el.getBoundingClientRect();
        return {
          text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
          whole: box.left >= edge - 2 && box.width > 12,
        };
      })
      .find((label) => label.whole);
    const read = (id) => {
      const chip = document.querySelector(`[data-schedule-job="${id}"] [data-day-chip-pin="1"]`);
      const desc = chip?.querySelector('.hub-week-chip-desc');
      const box = chip?.getBoundingClientRect();
      const descBox = desc?.getBoundingClientRect();
      const text = (chip?.textContent || '').replace(/\s+/g, ' ').trim();
      const title = (desc?.textContent || '').replace(/\s+/g, ' ').trim();
      const descStyle = desc ? getComputedStyle(desc) : null;
      return {
        text,
        title,
        firstTwo: title.split(/\s+/).slice(0, 2).join(' '),
        left: box ? Math.round(box.left) : null,
        edge: Math.round(edge),
        visible: !!(box && box.right > edge + 1 && box.left < window.innerWidth && box.width > 8),
        descWrap: descStyle?.whiteSpace ?? null,
        descClamp: descStyle?.webkitLineClamp ?? descStyle?.lineClamp ?? null,
        descHeight: descBox ? Math.round(descBox.height) : null,
      };
    };
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
    || early.early.firstTwo !== '286 prove'
    || early.early.descWrap === 'nowrap'
    || !early.seven.visible
    || early.seven.firstTwo !== '286 prove'
  ) {
    throw new Error(`${label} fail ${JSON.stringify(early)}`);
  }
}

async function pinShortBar(page) {
  await page.evaluate(() => {
    const track = [...document.querySelectorAll('[data-day-hours="1"]')]
      .find((el) => el.getBoundingClientRect().width > 0);
    const chip = document.querySelector('[data-schedule-job="look-job-early"]');
    const bar = chip?.closest('.absolute');
    if (!track || !(bar instanceof HTMLElement)) return;
    const left = Number.parseFloat(bar.style.left) || 0;
    const width = Number.parseFloat(bar.style.width) || 0;
    track.scrollLeft = left + Math.max(0, width - 40);
  });
  await page.waitForTimeout(200);
  return page.evaluate(() => {
    const board = [...document.querySelectorAll('[data-day-board="1"]')]
      .find((el) => el.getBoundingClientRect().width > 0);
    const crew = board?.querySelector('.hub-day-crew-lock');
    const edge = crew?.getBoundingClientRect().right ?? 0;
    const chip = document.querySelector('[data-schedule-job="look-job-early"] [data-day-chip-pin="1"]');
    const barEl = document.querySelector('[data-schedule-job="look-job-early"]');
    const desc = chip?.querySelector('.hub-week-chip-desc');
    const box = chip?.getBoundingClientRect();
    const barBox = barEl?.getBoundingClientRect();
    const title = (desc?.textContent || '').replace(/\s+/g, ' ').trim();
    const visibleBar = barBox ? Math.min(barBox.right, window.innerWidth) - Math.max(barBox.left, edge) : 0;
    return {
      title,
      firstTwo: title.split(/\s+/).slice(0, 2).join(' '),
      left: box ? Math.round(box.left) : null,
      edge: Math.round(edge),
      visibleBar: Math.round(visibleBar),
      pinned: !!(box && box.left >= edge - 4 && box.right > edge + 8),
    };
  });
}

{
  const { ctx, page } = await openPage(375, 812, true, EARLY);
  await waitVisible(page, '[data-day-board="1"]');
  const early = await measureEarly(page);
  assertEarly('s8c-day-early-375', early);
  await shot(page, 's8c-day-early-375.png');
  await ctx.close();
}

{
  const { ctx, page } = await openPage(390, 844, true, EARLY);
  await waitVisible(page, '[data-day-board="1"]');
  const early = await measureEarly(page);
  assertEarly('s8c-day-early-390', early);
  await shot(page, 's8c-day-early-390.png');
  await ctx.close();
}

{
  const { ctx, page } = await openPage(375, 812, true, EARLY);
  await waitVisible(page, '[data-day-board="1"]');
  const pin = await pinShortBar(page);
  console.log('s8c-day-pin-375', pin);
  if (!pin.pinned || pin.firstTwo !== '286 prove' || pin.visibleBar < 24) {
    throw new Error(`pin 375 fail ${JSON.stringify(pin)}`);
  }
  await shot(page, 's8c-day-pin-375.png');
  await ctx.close();
}

{
  const { ctx, page } = await openPage(390, 844, true, EARLY);
  await waitVisible(page, '[data-day-board="1"]');
  const pin = await pinShortBar(page);
  console.log('s8c-day-pin-390', pin);
  if (!pin.pinned || pin.firstTwo !== '286 prove' || pin.visibleBar < 24) {
    throw new Error(`pin 390 fail ${JSON.stringify(pin)}`);
  }
  await shot(page, 's8c-day-pin-390.png');
  await ctx.close();
}

{
  const { ctx, page } = await openPage(390, 844, true, WEEK);
  await waitVisible(page, '[data-week-agenda="1"]');
  const bottom = await page.evaluate(() => {
    const agenda = [...document.querySelectorAll('[data-week-agenda="1"]')]
      .find((el) => el.getBoundingClientRect().width > 0);
    if (!agenda) return { ok: false };
    agenda.scrollTop = agenda.scrollHeight;
    const days = [...agenda.querySelectorAll('[data-agenda-day]')];
    const last = days[days.length - 1];
    const empty = last?.querySelector('.hub-week-agenda-empty');
    const tab = document.querySelector('.shell-bottom-nav');
    const emptyBox = empty?.getBoundingClientRect();
    const tabTop = tab?.getBoundingClientRect().top ?? window.innerHeight;
    const gap = emptyBox ? tabTop - emptyBox.bottom : null;
    return {
      lastDate: last?.getAttribute('data-agenda-day') ?? null,
      emptyText: (empty?.textContent || '').trim(),
      emptyBottom: emptyBox ? Math.round(emptyBox.bottom * 10) / 10 : null,
      tabTop: Math.round(tabTop * 10) / 10,
      gap: gap == null ? null : Math.round(gap * 10) / 10,
      pad: getComputedStyle(agenda).paddingBottom,
    };
  });
  console.log('s8c-week-390-bottom', bottom);
  if (bottom.emptyText !== 'Nothing booked' || bottom.gap == null || bottom.gap < 8) {
    throw new Error(`week 390 bottom fail ${JSON.stringify(bottom)}`);
  }
  await shot(page, 's8c-week-390-bottom.png');
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
    const desc = board?.querySelector('.hub-week-chip-desc');
    const labels = [...(board?.querySelectorAll('.hub-schedule-label') ?? [])]
      .map((el) => (el.textContent || '').trim());
    return {
      start: board?.getAttribute('data-day-start'),
      pinSticky: pin ? getComputedStyle(pin).position : null,
      hintDisplay: hint ? getComputedStyle(hint).display : null,
      descClamp: desc ? getComputedStyle(desc).webkitLineClamp : null,
      has6am: labels.some((label) => /6\s*AM/i.test(label)),
      has5am: labels.some((label) => /5\s*AM/i.test(label)),
    };
  });
  console.log('s8c-day-1280', desktop);
  if (
    desktop.pinSticky === 'sticky'
    || desktop.hintDisplay === 'none'
    || desktop.start !== '6'
    || !desktop.has6am
    || desktop.has5am
    || desktop.descClamp === '2'
  ) {
    throw new Error(`day 1280 changed ${JSON.stringify(desktop)}`);
  }
  await shot(page, 's8c-day-1280.png');
  await ctx.close();
}

await browser.close();
console.log('wrote S8c frames to', OUT);
