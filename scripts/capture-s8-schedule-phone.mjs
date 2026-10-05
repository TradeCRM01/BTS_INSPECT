import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.S8_OUT || '/opt/cursor/artifacts';
const WEEK = '/schedule?look=week-board';
const DAY = '/schedule?look=week-board&view=day';

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
    const paper = document.querySelector('[data-week-sheet="1"]');
    const hero = document.querySelector('.hub-week-hero');
    return hero?.textContent?.includes('Schedule')
      && !!paper
      && paper.innerText.includes('on the board');
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  return { ctx, page };
}

async function waitVisibleBoard(page, sel) {
  await page.waitForFunction((boardSel) => (
    [...document.querySelectorAll(boardSel)].some((el) => {
      const box = el.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    })
  ), sel, { timeout: 20000 });
}

async function shot(page, file) {
  await page.screenshot({ path: `${OUT}/${file}`, type: 'png' });
  console.log('wrote', file);
}

async function measureWeek(page) {
  return page.evaluate(() => {
    const agenda = document.querySelector('[data-week-agenda="1"]');
    const grid = [...document.querySelectorAll('[data-week-board="1"]')]
      .find((el) => el.getBoundingClientRect().width > 0);
    const days = agenda
      ? [...agenda.querySelectorAll('[data-agenda-day]')]
      : [];
    const swipe = /swipe sideways/i.test(document.body.innerText);
    return {
      agenda: !!agenda && agenda.getBoundingClientRect().width > 0,
      grid: !!grid,
      dayCount: days.length,
      emptyDays: days.filter((day) => /Nothing booked/i.test(day.textContent || '')).length,
      today: days.some((day) => day.classList.contains('is-today')),
      swipe,
      scrollX: agenda ? agenda.scrollWidth > agenda.clientWidth + 1 : null,
      overflowX: agenda ? getComputedStyle(agenda).overflowX : null,
    };
  });
}

{
  const { ctx, page } = await openPage(375, 812, true, WEEK);
  await waitVisibleBoard(page, '[data-week-agenda="1"]');
  const stats = await measureWeek(page);
  console.log('week-375', stats);
  if (!stats.agenda || stats.dayCount !== 7 || stats.swipe || stats.scrollX) {
    throw new Error(`week 375 fail ${JSON.stringify(stats)}`);
  }
  await shot(page, 's8-week-375.png');
  await ctx.close();
}

{
  const { ctx, page } = await openPage(390, 844, true, WEEK);
  await waitVisibleBoard(page, '[data-week-agenda="1"]');
  const stats = await measureWeek(page);
  console.log('week-390', stats);
  if (!stats.agenda || stats.dayCount !== 7 || stats.swipe || stats.scrollX) {
    throw new Error(`week 390 fail ${JSON.stringify(stats)}`);
  }
  await shot(page, 's8-week-390.png');
  await ctx.close();
}

{
  const { ctx, page } = await openPage(1280, 900, false, WEEK);
  await waitVisibleBoard(page, '[data-week-board="1"]');
  const stats = await measureWeek(page);
  console.log('week-1280', stats);
  if (!stats.grid || stats.agenda) {
    throw new Error(`week 1280 fail ${JSON.stringify(stats)}`);
  }
  await shot(page, 's8-week-1280.png');
  await ctx.close();
}

{
  const { ctx, page } = await openPage(1280, 900, false, DAY);
  await waitVisibleBoard(page, '[data-day-board="1"]');
  await shot(page, 's8-day-1280.png');
  await ctx.close();
}

async function daySearchWalk(width, height, suffix) {
  const { ctx, page } = await openPage(width, height, true, DAY);
  await waitVisibleBoard(page, '[data-day-board="1"]');
  const search = page.locator('[data-schedule-search="1"] input').first();
  await search.click();
  await search.fill('Install');
  await page.waitForSelector('[data-schedule-search-hit]', { timeout: 20000 });
  const searchStats = await page.evaluate(() => {
    const title = document.querySelector('.hub-schedule-search-title');
    const style = title ? getComputedStyle(title) : null;
    const hit = document.querySelector('[data-schedule-search-hit]');
    return {
      title: title?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      overflow: style?.textOverflow ?? null,
      whiteSpace: style?.whiteSpace ?? null,
      wrap: style?.whiteSpace === 'normal',
      ellipsis: !!(title && style?.textOverflow === 'ellipsis' && title.scrollWidth > title.clientWidth + 1),
      statusUnder: (() => {
        if (!hit || !title) return false;
        const status = hit.querySelector('.hub-schedule-search-status');
        if (!status) return false;
        return status.getBoundingClientRect().top >= title.getBoundingClientRect().bottom - 1;
      })(),
      dragCopy: /drag onto a name or a time/i.test(document.body.innerText),
    };
  });
  console.log(`day-search-${suffix}`, searchStats);
  if (searchStats.ellipsis || searchStats.dragCopy || !searchStats.statusUnder || !searchStats.wrap) {
    throw new Error(`day search ${suffix} fail ${JSON.stringify(searchStats)}`);
  }
  await shot(page, `s8-day-search-${suffix}.png`);

  await page.locator('[data-schedule-search-hit]').first().click();
  await page.waitForSelector('.hub-schedule-job-sheet', { timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector('[data-schedule-search-hit]'));
  const sheetStats = await page.evaluate(() => {
    const sheet = document.querySelector('.hub-schedule-job-sheet');
    const save = document.querySelector('.hub-schedule-job-sheet-foot .btn-primary');
    const date = document.querySelector('.hub-schedule-job-sheet input[type="date"]');
    return {
      title: sheet?.querySelector('h2')?.textContent ?? null,
      saveH: save ? Math.round(save.getBoundingClientRect().height) : null,
      date: date instanceof HTMLInputElement ? date.value : null,
    };
  });
  console.log(`day-sheet-${suffix}`, sheetStats);
  if (sheetStats.title !== 'Schedule this job' || sheetStats.saveH !== 44) {
    throw new Error(`day sheet ${suffix} fail ${JSON.stringify(sheetStats)}`);
  }
  await shot(page, `s8-day-sheet-${suffix}.png`);

  await page.locator('.hub-schedule-job-sheet select').selectOption({ label: 'Dave Hale' });
  await page.locator('.hub-schedule-job-sheet input[type="time"]').nth(0).fill('09:00');
  await page.locator('.hub-schedule-job-sheet input[type="time"]').nth(1).fill('12:00');
  await page.locator('.hub-schedule-job-sheet-foot .btn-primary').click();
  await page.waitForFunction(() => !document.querySelector('.hub-schedule-job-sheet'));
  await page.waitForFunction(() => (
    [...document.querySelectorAll('[data-schedule-job]')].some((el) => /Install 2x new switchboards/i.test(el.textContent || ''))
  ), { timeout: 20000 });
  const savedStats = await page.evaluate(() => ({
    toast: /is on the board/i.test(document.body.innerText),
    job: [...document.querySelectorAll('[data-schedule-job]')].some((el) => /Install 2x new switchboards/i.test(el.textContent || '')),
  }));
  console.log(`day-saved-${suffix}`, savedStats);
  if (!savedStats.job) {
    throw new Error(`day saved ${suffix} fail ${JSON.stringify(savedStats)}`);
  }
  await shot(page, `s8-day-saved-${suffix}.png`);
  await ctx.close();
}

await daySearchWalk(375, 812, '375');
await daySearchWalk(390, 844, '390');

await browser.close();
console.log('wrote S8 frames to', OUT);
