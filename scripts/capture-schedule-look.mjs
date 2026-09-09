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
    const shell = document.querySelector('.shell-header');
    const dayHeads = board ? [...board.querySelectorAll('.hub-week-head')] : [];
    const crewLabels = board
      ? [...board.querySelectorAll('.hub-week-crew .hub-schedule-crew-name, .hub-day-crew-lock .hub-schedule-crew-name')]
      : [];
    const hours = board?.querySelector('[data-day-hours="1"]');
    const hoursBox = hours?.getBoundingClientRect();
    const hourCol = hours?.querySelector('.hub-schedule-label')?.parentElement?.parentElement;
    const chipReads = board
      ? [...board.querySelectorAll('.hub-week-chip')].map((el) => {
        const box = el.getBoundingClientRect();
        const desc = el.querySelector('.hub-week-chip-desc');
        const descStyle = desc ? getComputedStyle(desc) : null;
        const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
        return {
          text,
          w: Math.round(box.width),
          h: Math.round(box.height),
          descWrap: descStyle ? descStyle.whiteSpace : null,
          descOverflowWrap: descStyle ? descStyle.overflowWrap : null,
          ellipsis: !!(desc && descStyle?.textOverflow === 'ellipsis' && desc.scrollWidth > desc.clientWidth + 1),
          hasSiteCopy: /no site address/i.test(text),
          staleDate: /31 Mar|31 March|created/i.test(text),
          clock: el.getAttribute('data-chip-clock'),
        };
      })
      : [];
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
        || locks.every((lock) => lock.clipBy <= 0 && /Crew|Dave|Jack|Sam|Unassigned/.test(lock.text)),
      hours: hours
        ? {
          clientWidth: Math.round(hours.clientWidth),
          scrollWidth: Math.round(hours.scrollWidth),
          scrollLeft: Math.round(hours.scrollLeft),
          hourW: hourCol ? Math.round(hourCol.getBoundingClientRect().width) : null,
          overflow: hours.scrollWidth > hours.clientWidth + 1,
        }
        : null,
      chips: chipReads,
      titlesWrap: chipReads.every((chip) => !chip.ellipsis),
      noSiteHero: chipReads.every((chip) => !chip.hasSiteCopy),
      noStaleChipDate: chipReads.every((chip) => !chip.staleDate),
      untimedWeight: !chipReads.some((chip) => /Hot water/.test(chip.text))
        || chipReads.some((chip) => /Hot water/.test(chip.text) && chip.h >= 40 && chip.w >= 180),
      chipCount: chips.length,
      trackInPaper: !!(paper && track && paper.contains(track)),
      boardInPaper: !!(paper && board && paper.contains(board)),
      primaryH: primary ? Math.round(primary.getBoundingClientRect().height) : null,
      primaryBg: primary ? getComputedStyle(primary).backgroundColor : null,
      viewW: window.innerWidth,
      viewH: window.innerHeight,
      shellH: shell ? Math.round(shell.getBoundingClientRect().height) : 0,
      paperH: paperBox ? Math.round(paperBox.height) : 0,
      paperBottom: paperBox ? Math.round(paperBox.bottom) : 0,
      sheetFill: (() => {
        const shellH = shell ? shell.getBoundingClientRect().height : 0;
        const usable = window.innerHeight - shellH;
        return usable > 0 && paperBox ? Number((paperBox.height / usable).toFixed(3)) : 0;
      })(),
      creamBelow: paperBox ? Math.round(window.innerHeight - paperBox.bottom) : null,
      boardFill: paperBox && boardBox
        ? Number((boardBox.height / Math.max(paperBox.height - (boardBox.top - paperBox.top), 1)).toFixed(3))
        : 0,
      daysVisible: dayHeads.filter((el) => {
        const box = el.getBoundingClientRect();
        const visible = Math.min(box.right, window.innerWidth) - Math.max(box.left, 0);
        return box.width > 0 && visible / box.width >= 0.7;
      }).length,
      crewCrush: crewLabels
        .filter((el) => {
          const style = getComputedStyle(el);
          return style.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1;
        })
        .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim()),
      crewLabels: crewLabels.map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim()),
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

const weekLaptop = await shoot(1280, 900, false, WEEK, 'schedule-week-laptop-1280.png');
const dayLaptop = await shoot(1280, 900, false, DAY, 'schedule-day-laptop-1280.png');
const weekPhone = await shoot(390, 844, true, WEEK, 'schedule-week-phone-390.png');

const phoneDayCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  locale: 'en-AU',
});
const phoneDay = await phoneDayCtx.newPage();
await openHarness(phoneDay, DAY);
await framePaper(phoneDay);
const dayPhoneBefore = await measure(phoneDay);
await phoneDay.screenshot({ path: `${OUT}/schedule-day-phone-390.png`, type: 'png' });
await phoneDay.evaluate(() => {
  const hours = [...document.querySelectorAll('[data-day-hours="1"]')]
    .find((el) => el.getBoundingClientRect().width > 0);
  if (hours) hours.scrollLeft += 400;
});
await phoneDay.waitForTimeout(200);
const dayPhoneAfterScroll = await measure(phoneDay);
await phoneDayCtx.close();

const look = {
  titlesWrap: weekLaptop.titlesWrap && dayLaptop.titlesWrap,
  noSiteHero: weekLaptop.noSiteHero && dayLaptop.noSiteHero && weekPhone.noSiteHero,
  noStaleChipDate: weekLaptop.noStaleChipDate && dayLaptop.noStaleChipDate && weekPhone.noStaleChipDate,
  dayFits1280: dayLaptop.hours && !dayLaptop.hours.overflow,
  untimedWeight: dayLaptop.untimedWeight,
  phoneCrewReadable: dayPhoneBefore.crewNamesReadable && dayPhoneAfterScroll.crewNamesReadable,
  phoneWeekFill: weekPhone.sheetFill >= 0.86 && weekPhone.creamBelow !== null && weekPhone.creamBelow <= 16,
  phoneWeekBoard: weekPhone.boardFill >= 0.8,
  phoneWeekDays: weekPhone.daysVisible >= 7,
  phoneWeekChips: weekPhone.chips.length > 0
    && weekPhone.chips.every((chip) => chip.descWrap === 'nowrap' && chip.descOverflowWrap !== 'anywhere'),
  phoneWeekCrew: Array.isArray(weekPhone.crewCrush) && weekPhone.crewCrush.length === 0
    && Array.isArray(weekPhone.crewLabels)
    && weekPhone.crewLabels.every((name) => name && !name.includes('…') && !/\.\.\.$/.test(name)),
  laptopWeekDays: weekLaptop.daysVisible >= 7,
};
console.log('phone-day-before', dayPhoneBefore);
console.log('phone-day-after-scroll', dayPhoneAfterScroll);
console.log('look-set', look);
if (Object.values(look).some((ok) => !ok)) {
  console.error('LOOK set failed', look);
  process.exitCode = 1;
}

await browser.close();
console.log('wrote schedule LOOK frames');
