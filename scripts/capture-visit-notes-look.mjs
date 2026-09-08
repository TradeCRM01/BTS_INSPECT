import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = 'docs/look';
const HARNESS = '/jobs/audit-doc-job?look=visit-notes';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function openHarness(page) {
  await page.goto(`${BASE}${HARNESS}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#job-visit-notes', { timeout: 20000 });
  await page.waitForFunction(() => {
    const tray = document.querySelector('#job-visit-notes');
    const log = document.querySelector('#job-visit-notes .job-visit-log');
    return tray?.textContent?.includes('Visit notes')
      && tray?.textContent?.includes('Fitted the new unit')
      && tray?.textContent?.includes('Alex Reed')
      && !!log;
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

async function frameTray(page, { block }) {
  await page.evaluate((align) => {
    const tray = document.getElementById('job-visit-notes');
    tray?.scrollIntoView({ block: align, inline: 'nearest' });
  }, block);
  await page.waitForTimeout(200);
}

async function measure(page) {
  return page.evaluate(() => {
    const cream = document.querySelector('.hub-jobs.ops-page');
    const paper = document.querySelector('.hub-jobs-document');
    const tray = document.querySelector('#job-visit-notes');
    const compose = document.querySelector('#job-visit-notes .job-visit-hairline');
    const post = document.querySelector('#job-visit-notes .job-visit-post');
    const title = document.querySelector('#job-visit-notes .ops-section-title');
    const primary = document.querySelector('.hub-jobs-document .hub-jobs-tools .btn-primary');
    return {
      cream: cream ? getComputedStyle(cream).backgroundColor : null,
      paper: paper ? getComputedStyle(paper).backgroundColor : null,
      paperWidth: paper ? Math.round(paper.getBoundingClientRect().width) : null,
      trayInsidePaper: !!(paper && tray && paper.contains(tray)),
      trayTop: tray ? Math.round(tray.getBoundingClientRect().top) : null,
      trayCard: tray ? {
        bg: getComputedStyle(tray).backgroundColor,
        border: getComputedStyle(tray).borderRadius,
        shadow: getComputedStyle(tray).boxShadow,
      } : null,
      composeBorder: compose ? getComputedStyle(compose).borderBottomColor : null,
      composeBox: compose ? getComputedStyle(compose).boxShadow : null,
      postH: post ? Math.round(post.getBoundingClientRect().height) : null,
      postBg: post ? getComputedStyle(post).backgroundColor : null,
      titleFamily: title ? getComputedStyle(title).fontFamily : null,
      titleWeight: title ? getComputedStyle(title).fontWeight : null,
      primaryH: primary ? Math.round(primary.getBoundingClientRect().height) : null,
      primaryBg: primary ? getComputedStyle(primary).backgroundColor : null,
      viewW: window.innerWidth,
      viewH: window.innerHeight,
    };
  });
}

const laptop = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
  locale: 'en-AU',
});
const laptopPage = await laptop.newPage();
await openHarness(laptopPage);
await frameTray(laptopPage, { block: 'center' });
console.log('laptop', await measure(laptopPage));
await laptopPage.screenshot({ path: `${OUT}/visit-notes-laptop-1280.png`, type: 'png' });
await laptop.close();

const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  locale: 'en-AU',
});
const phonePage = await phone.newPage();
await openHarness(phonePage);
await frameTray(phonePage, { block: 'start' });
await phonePage.evaluate(() => {
  const tray = document.getElementById('job-visit-notes');
  if (!tray) return;
  const y = window.scrollY + tray.getBoundingClientRect().top - 72;
  window.scrollTo(0, Math.max(0, y));
});
await phonePage.waitForTimeout(200);
console.log('phone', await measure(phonePage));
await phonePage.screenshot({ path: `${OUT}/visit-notes-phone-390.png`, type: 'png' });
await phone.close();

await browser.close();
console.log('wrote visit-notes LOOK frames');
