import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = 'docs/look';
const WEEK = '/schedule?look=week-board';
const DAY = '/schedule?look=week-board&view=day';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function openHarness(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-week-sheet="1"]', { timeout: 20000 });
  await page.waitForFunction(() => {
    const paper = document.querySelector('[data-week-sheet="1"]');
    const hero = document.querySelector('.hub-week-hero');
    return hero?.textContent?.includes('Schedule')
      && !!paper
      && paper.innerText.includes('on the board');
  });
  const view = new URL(page.url()).searchParams.get('view') === 'day' ? 'day' : 'week';
  await page.waitForFunction((mode) => {
    const boardSel = mode === 'day' ? '[data-day-board="1"]' : '[data-week-board="1"]';
    const jobSel = mode === 'day' ? '[data-schedule-job]' : '[data-week-chip]';
    return [...document.querySelectorAll(boardSel)].some((board) => {
      const box = board.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && board.querySelector(jobSel);
    });
  }, view, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

async function framePaper(page) {
  await page.evaluate(() => {
    const paper = document.querySelector('.hub-week-document');
    paper?.scrollIntoView({ block: 'start', inline: 'nearest' });
  });
  await page.waitForTimeout(200);
}

async function measure(page) {
  return page.evaluate(() => {
    const cream = document.querySelector('.hub-board-cal.ops-page');
    const paper = document.querySelector('.hub-week-document');
    const bar = document.querySelector('.hub-week-sheet-bar');
    const hero = document.querySelector('.hub-week-hero');
    const track = document.querySelector('[data-week-track="1"]');
    const board = [...document.querySelectorAll('[data-week-board="1"], [data-day-board="1"]')]
      .find((el) => el.getBoundingClientRect().width > 0);
    const primary = document.querySelector('.hub-week-document .btn-primary');
    const chips = board
      ? board.querySelectorAll('[data-week-chip], [data-schedule-job]')
      : [];
    const paperStyle = paper ? getComputedStyle(paper) : null;
    const pageBox = cream?.getBoundingClientRect();
    const paperBox = paper?.getBoundingClientRect();
    const boardBox = board?.getBoundingClientRect();
    const cell = board?.querySelector('.hub-week-cell:not(.is-empty)')
      || board?.querySelector('.hub-week-cell');
    const chip = cell?.querySelector('.hub-week-chip');
    const cellBox = cell?.getBoundingClientRect();
    const chipBox = chip?.getBoundingClientRect();
    const weekendEmpty = board
      ? [...board.querySelectorAll('.hub-week-cell.is-empty')].length
      : 0;
    const rail = document.querySelector('.hub-week-document .ops-tray');
    const locks = board
      ? [...board.querySelectorAll('.hub-day-crew-lock')].map((el) => {
        const box = el.getBoundingClientRect();
        return {
          text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
          left: Math.round(box.left),
          clipBy: paperBox ? Math.round(paperBox.left - box.left) : 0,
        };
      })
      : [];
    return {
      cream: cream ? getComputedStyle(cream).backgroundColor : null,
      paper: paper ? getComputedStyle(paper).backgroundColor : null,
      paperShadow: paperStyle?.boxShadow ?? null,
      barH: bar ? Math.round(bar.getBoundingClientRect().height) : null,
      barBg: bar ? getComputedStyle(bar).backgroundColor : null,
      heroPx: hero ? getComputedStyle(hero).fontSize : null,
      heroFamily: hero ? getComputedStyle(hero).fontFamily : null,
      boardTop: pageBox && boardBox ? Math.round(boardBox.top - pageBox.top) : null,
      boardTopPaper: paperBox && boardBox ? Math.round(boardBox.top - paperBox.top) : null,
      boardTopViewport: boardBox ? Math.round(boardBox.top) : null,
      cellH: cellBox ? Math.round(cellBox.height) : null,
      cellPadY: cell ? parseFloat(getComputedStyle(cell).paddingTop) : null,
      cellAir: cellBox && chipBox ? Math.round((cellBox.height - chipBox.height) / 2) : null,
      weekendEmpty,
      railOnSheet: !!(paper && rail && paper.contains(rail)),
      crewClip: locks,
      crewNamesReadable: locks.length === 0
        || locks.every((lock) => lock.clipBy <= 0 && /Crew|Dave|Jack|Sam/.test(lock.text)),
      chipCount: chips.length,
      trackInPaper: !!(paper && track && paper.contains(track)),
      boardInPaper: !!(paper && board && paper.contains(board)),
      primaryH: primary ? Math.round(primary.getBoundingClientRect().height) : null,
      primaryBg: primary ? getComputedStyle(primary).backgroundColor : null,
      viewW: window.innerWidth,
      viewH: window.innerHeight,
      whisper: document.querySelector('.hub-week-status-whisper')?.textContent ?? null,
    };
  });
}

async function shoot(width, height, isPhone, path, file) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: isPhone,
    hasTouch: isPhone,
    locale: 'en-AU',
  });
  const page = await ctx.newPage();
  await openHarness(page, path);
  await framePaper(page);
  const stats = await measure(page);
  console.log(file, stats);
  await page.screenshot({ path: `${OUT}/${file}`, type: 'png' });
  await ctx.close();
  return stats;
}

await shoot(1280, 900, false, WEEK, 'schedule-week-laptop-1280.png');
await shoot(1280, 900, false, DAY, 'schedule-day-laptop-1280.png');
await shoot(390, 844, true, WEEK, 'schedule-week-phone-390.png');
await shoot(390, 844, true, DAY, 'schedule-day-phone-390.png');

await browser.close();
console.log('wrote schedule LOOK frames');
