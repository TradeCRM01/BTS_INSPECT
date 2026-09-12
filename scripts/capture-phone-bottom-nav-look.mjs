import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = 'docs/look';
const HARNESS = '/?look=dashboard';
const NAV = 'nav[aria-label="Phone navigation"]';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function openHarness(page) {
  await page.goto(`${BASE}${HARNESS}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.ops-page-title')?.textContent === 'Dashboard', null, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
}

async function measure(page) {
  return page.evaluate((sel) => {
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const box = (el) => {
      const r = el?.getBoundingClientRect();
      return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) } : null;
    };
    const nav = document.querySelector(sel);
    const header = document.querySelector('header.shell-header');
    const tabs = nav ? [...nav.querySelectorAll('[data-phone-tab]')] : [];
    return {
      viewW: window.innerWidth,
      viewH: window.innerHeight,
      headerBg: cs(header)?.backgroundColor ?? null,
      barVisible: !!nav && cs(nav).display !== 'none',
      barBg: cs(nav)?.backgroundColor ?? null,
      barRule: cs(nav)?.borderTopColor ?? null,
      bar: box(nav),
      main: box(document.querySelector('main')),
      tabs: tabs.map((el) => ({
        label: el.querySelector('span')?.textContent ?? '',
        active: el.classList.contains('shell-bottom-tab-active'),
        font: `${cs(el).fontFamily} ${cs(el).fontWeight} ${cs(el).fontSize}`,
        color: cs(el).color,
        topRule: cs(el).borderTopColor,
        h: box(el)?.h ?? null,
      })),
    };
  }, NAV);
}

const laptop = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: 'en-AU' });
const laptopPage = await laptop.newPage();
await openHarness(laptopPage);
console.log('laptop', JSON.stringify(await measure(laptopPage), null, 2));
await laptopPage.screenshot({ path: `${OUT}/phone-bottom-nav-laptop-1280.png`, type: 'png' });
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
console.log('phone', JSON.stringify(await measure(phonePage), null, 2));
await phonePage.screenshot({ path: `${OUT}/phone-bottom-nav-phone-390.png`, type: 'png' });
await phone.close();

await browser.close();
console.log('wrote phone-bottom-nav LOOK frames');
