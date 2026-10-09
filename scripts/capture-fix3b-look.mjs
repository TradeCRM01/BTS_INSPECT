// FIX-3b LOOK — 1280×800 viewport + phone parity check.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const MAIN_BASE = process.env.LOOK_MAIN_BASE_URL || 'http://127.0.0.1:5174';
const OUT = process.env.LOOK_OUT_DIR || '/opt/cursor/artifacts';
const STORE = process.env.LOOK_STORE_DIR || '/cursor/stores/self/artifacts';
const MIN_BOARD_H = Number(process.env.FIX3B_MIN_BOARD_H || 280);

mkdirSync(OUT, { recursive: true });
mkdirSync(STORE, { recursive: true });

function md5File(path) {
  return createHash('md5').update(readFileSync(path)).digest('hex');
}

function saveBoth(file, meta) {
  const from = `${OUT}/${file}`;
  copyFileSync(from, `${STORE}/${file}`);
  const md5 = md5File(from);
  console.log('wrote', file, md5, meta);
  return md5;
}

async function boardBox(page) {
  return page.evaluate(() => {
    const board = [...document.querySelectorAll('[data-week-board="1"]')]
      .find((el) => el.getBoundingClientRect().width > 0);
    const day = [...document.querySelectorAll('[data-day-board="1"], .hub-day-board')]
      .find((el) => el.getBoundingClientRect().width > 0);
    const el = board ?? day;
    const r = el?.getBoundingClientRect();
    return {
      kind: board ? 'week' : day ? 'day' : 'none',
      height: r?.height ?? 0,
      width: r?.width ?? 0,
      top: r?.top ?? 0,
    };
  });
}

async function shot1280(page, file) {
  const box = await boardBox(page);
  if (box.height < MIN_BOARD_H) {
    throw new Error(`[data-week-board] height ${box.height} < ${MIN_BOARD_H} before ${file} ${JSON.stringify(box)}`);
  }
  await page.screenshot({ path: `${OUT}/${file}`, type: 'png', fullPage: false });
  return saveBoth(file, { board: box });
}

async function openDesktop(path) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    locale: 'en-AU',
    timezoneId: 'Australia/Brisbane',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-week-sheet="1"]', { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  return { browser, ctx, page };
}

async function scrollAgendaChip(page) {
  await page.evaluate(() => {
    const agenda = document.querySelector('[data-week-agenda="1"]');
    if (agenda) agenda.scrollTop = agenda.scrollHeight;
  });
  await page.waitForTimeout(200);
}

async function capturePhone(base, file) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: 'en-AU',
    timezoneId: 'Australia/Brisbane',
  });
  const page = await ctx.newPage();
  await page.goto(`${base}/schedule?auditAuth=1&look=fix3a-schedule`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-week-agenda="1"]', { timeout: 30000 });
  const chip = page.locator('[data-schedule-unscheduled-chip="1"]');
  if (await chip.count()) {
    await scrollAgendaChip(page);
    await chip.waitFor({ state: 'visible', timeout: 10000 });
  }
  await page.screenshot({ path: `${OUT}/${file}`, type: 'png', fullPage: false });
  const md5 = saveBoth(file, { phone: true });
  await browser.close();
  return md5;
}

const md5s = {};

{
  const { browser, page } = await openDesktop('/schedule?auditAuth=1&look=fix3a-schedule');
  md5s.week17 = await shot1280(page, 'fix3b-week-17-1280.png');
  await browser.close();
}

{
  const { browser, page } = await openDesktop('/schedule?auditAuth=1&look=week-board');
  md5s.weekBoard = await shot1280(page, 'fix3b-week-board-1280.png');
  await browser.close();
}

{
  const { browser, page } = await openDesktop('/schedule?auditAuth=1&look=fix3a-schedule&unscheduled=0');
  const box = await boardBox(page);
  if (box.height < MIN_BOARD_H) throw new Error(`0 unscheduled board height ${box.height}`);
  await page.screenshot({ path: `${OUT}/fix3b-week-0-1280.png`, type: 'png', fullPage: false });
  md5s.week0 = saveBoth('fix3b-week-0-1280.png', { board: box });
  await browser.close();
}

{
  const { browser, page } = await openDesktop('/schedule?auditAuth=1&look=fix3a-schedule&unscheduled=60');
  md5s.week60 = await shot1280(page, 'fix3b-week-60-1280.png');
  await browser.close();
}

{
  const { browser, page } = await openDesktop('/schedule?auditAuth=1&look=fix3a-schedule&view=day');
  const box = await boardBox(page);
  if (box.height < MIN_BOARD_H) throw new Error(`day board height ${box.height}`);
  await page.screenshot({ path: `${OUT}/fix3b-day-fri-1280.png`, type: 'png', fullPage: false });
  md5s.dayFri = saveBoth('fix3b-day-fri-1280.png', { board: box });
  await browser.close();
}

md5s.phoneHead = await capturePhone(BASE, 'fix3b-phone-390.png');
md5s.phoneMain = await capturePhone(MAIN_BASE, 'fix3b-phone-390-main.png');

async function capturePhonePath(base, path, file) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: 'en-AU',
    timezoneId: 'Australia/Brisbane',
  });
  const page = await ctx.newPage();
  await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-week-agenda="1"]', { timeout: 30000 });
  await page.screenshot({ path: `${OUT}/${file}`, type: 'png', fullPage: false });
  const md5 = saveBoth(file, { phone: true, path });
  await browser.close();
  return md5;
}

md5s.phoneZeroHead = await capturePhonePath(
  BASE,
  '/schedule?auditAuth=1&look=fix3a-schedule&unscheduled=0',
  'fix3b-phone-390-zero-head.png',
);
md5s.phoneZeroMain = await capturePhonePath(
  MAIN_BASE,
  '/schedule?auditAuth=1&look=fix3a-schedule&unscheduled=0',
  'fix3b-phone-390-zero-main.png',
);

console.log(JSON.stringify({
  md5s,
  phone17Match: md5s.phoneHead === md5s.phoneMain,
  phoneZeroMatch: md5s.phoneZeroHead === md5s.phoneZeroMain,
}, null, 2));
