import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = 'docs/look';
const HARNESS = '/?look=dashboard';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function openHarness(page) {
  await page.goto(`${BASE}${HARNESS}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
  await page.waitForSelector('[data-dashboard-widgets="1"]', { timeout: 20000 });
  await page.waitForFunction(() => {
    const hero = document.querySelector('.dashboard-home-hero');
    const widgets = document.querySelector('[data-dashboard-widgets="1"]');
    return hero?.textContent?.includes('Dashboard') && !!widgets && widgets.innerText.trim().length > 0;
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

async function measure(page) {
  return page.evaluate(() => {
    const cream = document.querySelector('.dashboard-home.ops-page');
    const paper = document.querySelector('.dashboard-home-sheet');
    const widgets = document.querySelector('[data-dashboard-widgets="1"]');
    const canvas = document.querySelector('.dashboard-home-canvas');
    const primary = document.querySelector('.dashboard-home-primary');
    const hero = document.querySelector('.dashboard-home-hero');
    return {
      cream: cream ? getComputedStyle(cream).backgroundColor : null,
      paper: paper ? getComputedStyle(paper).backgroundColor : null,
      paperWidth: paper ? Math.round(paper.getBoundingClientRect().width) : null,
      paperBottom: paper ? Math.round(paper.getBoundingClientRect().bottom) : null,
      widgetsTop: widgets ? Math.round(widgets.getBoundingClientRect().top) : null,
      widgetsInsidePaper: !!(paper && widgets && paper.contains(widgets)),
      canvasOverflowX: canvas ? getComputedStyle(canvas).overflowX : null,
      heroPx: hero ? getComputedStyle(hero).fontSize : null,
      heroFamily: hero ? getComputedStyle(hero).fontFamily : null,
      primaryH: primary ? Math.round(primary.getBoundingClientRect().height) : null,
      primaryBg: primary ? getComputedStyle(primary).backgroundColor : null,
      viewW: window.innerWidth,
      viewH: window.innerHeight,
      widgetText: widgets?.innerText?.slice(0, 240) ?? null,
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
console.log('laptop', await measure(laptopPage));
await laptopPage.screenshot({ path: `${OUT}/dashboard-widgets-laptop-1280.png`, type: 'png' });
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
console.log('phone', await measure(phonePage));
await phonePage.screenshot({ path: `${OUT}/dashboard-widgets-phone-390.png`, type: 'png' });
await phone.close();

await browser.close();
console.log('wrote dashboard widgets LOOK frames');
