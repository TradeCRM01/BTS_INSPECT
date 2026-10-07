import { copyFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const DOC_OUT = 'docs/look';
const ART_OUT = '/opt/cursor/artifacts';
const HARNESS = '/clients?auditAuth=1&look=clients-list';

mkdirSync(DOC_OUT, { recursive: true });
mkdirSync(ART_OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(process.env.LOOK_BROWSER_CHANNEL ? { channel: process.env.LOOK_BROWSER_CHANNEL } : {}),
});

async function openList(page) {
  await page.goto(`${BASE}${HARNESS}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hub-clients-list-doc .hub-clients-row', { timeout: 20000 });
  await page.waitForFunction(() => {
    const rows = [...document.querySelectorAll('.hub-clients-list-doc .hub-clients-row')];
    const title = document.querySelector('.hub-clients-list-doc .ops-page-title');
    return title?.textContent === 'Clients'
      && rows.length >= 3
      && rows.some((row) => row.textContent?.includes('Northside Electrical'));
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

function saveBoth(name) {
  const docPath = `${DOC_OUT}/${name}`;
  const artPath = `${ART_OUT}/${name}`;
  copyFileSync(docPath, artPath);
  console.log('wrote', docPath, 'and', artPath);
}

async function rowMidpoint(page) {
  return page.evaluate(() => {
    const row = document.querySelector('.hub-clients-list-doc .hub-clients-row');
    if (!row) return null;
    const r = row.getBoundingClientRect();
    return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5 };
  });
}

async function moreButtonCenter(page) {
  return page.evaluate(() => {
    const btn = document.querySelector(
      '.hub-clients-list-doc .hub-clients-row .hub-clients-list-more-trigger',
    );
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: Math.round(r.height) };
  });
}

async function capturePhone(width, tag) {
  const ctx = await browser.newContext({
    viewport: { width, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: 'en-AU',
    timezoneId: 'Australia/Perth',
  });
  const page = await ctx.newPage();
  await openList(page);

  const row = page.locator('.hub-clients-list-doc .hub-clients-row').first();
  const box = await row.boundingBox();
  if (!box) throw new Error('no row box');
  await row.click({ position: { x: box.width * 0.5, y: box.height * 0.5 } });
  await page.waitForURL(/\/clients\/look-client-northside/, { timeout: 15000 });
  await page.waitForTimeout(300);
  const detailName = `clients-row-phone-${tag}-mid-opens-detail.png`;
  await page.screenshot({ path: `${DOC_OUT}/${detailName}`, type: 'png' });
  saveBoth(detailName);

  await page.goto(`${BASE}${HARNESS}`, { waitUntil: 'domcontentloaded' });
  await openList(page);
  const moreBtn = page.locator('.hub-clients-list-doc .hub-clients-row .hub-clients-list-more-trigger').first();
  const moreBox = await moreBtn.boundingBox();
  if (!moreBox) throw new Error('no more trigger');
  if (moreBox.height < 44) console.warn('more trigger height', moreBox.height, 'expected >= 44');
  await moreBtn.click();
  await page.locator('.hub-clients-row .hub-clients-list-more.is-open .hub-clients-list-more-menu').waitFor({
    state: 'visible',
    timeout: 10000,
  });
  await page.waitForTimeout(300);
  const menuName = `clients-row-phone-${tag}-more-menu.png`;
  await page.screenshot({ path: `${DOC_OUT}/${menuName}`, type: 'png' });
  saveBoth(menuName);

  await ctx.close();
}

async function captureLaptop() {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    locale: 'en-AU',
    timezoneId: 'Australia/Perth',
  });
  const page = await ctx.newPage();
  await openList(page);

  const row = page.locator('.hub-clients-list-doc .hub-clients-row').first();
  const box = await row.boundingBox();
  if (!box) throw new Error('no row box');
  await row.click({ position: { x: box.width * 0.5, y: box.height * 0.5 } });
  await page.waitForURL(/\/clients\/look-client-northside/, { timeout: 15000 });
  await page.waitForTimeout(300);
  const detailName = 'clients-row-laptop-1280-mid-opens-detail.png';
  await page.screenshot({ path: `${DOC_OUT}/${detailName}`, type: 'png' });
  saveBoth(detailName);

  await page.goto(`${BASE}${HARNESS}`, { waitUntil: 'domcontentloaded' });
  await openList(page);
  const moreBtn = page.locator('.hub-clients-list-doc .hub-clients-row .hub-clients-list-more-trigger').first();
  await moreBtn.click();
  await page.locator('.hub-clients-row .hub-clients-list-more.is-open .hub-clients-list-more-menu').waitFor({
    state: 'visible',
    timeout: 10000,
  });
  await page.waitForTimeout(300);
  const menuName = 'clients-row-laptop-1280-more-menu.png';
  await page.screenshot({ path: `${DOC_OUT}/${menuName}`, type: 'png' });
  saveBoth(menuName);

  await ctx.close();
}

await capturePhone(375, '375');
await capturePhone(390, '390');
await captureLaptop();
await browser.close();

console.log('clients-row LOOK capture done');
