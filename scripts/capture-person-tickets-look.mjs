import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = 'docs/look';
const HARNESS = '/settings/team?id=look-team-alex&look=person-tickets';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function openHarness(page) {
  await page.goto(`${BASE}${HARNESS}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#team-member-open', { timeout: 20000 });
  await page.waitForSelector('#team-member-tickets', { timeout: 20000 });
  await page.waitForFunction(() => {
    const name = document.querySelector('.hub-team-hero');
    const save = document.querySelector('.hub-team-add .hub-team-next');
    return name?.textContent?.includes('Alex Nguyen') && save?.textContent?.includes('Save ticket');
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

async function measure(page) {
  return page.evaluate(() => {
    const cream = document.querySelector('.hub-team.ops-page');
    const paper = document.querySelector('.hub-team-sheet');
    const bar = document.querySelector('.hub-team-sheet-bar');
    const name = document.querySelector('.hub-team-hero');
    const save = document.querySelector('.hub-team-add .hub-team-next');
    return {
      cream: cream ? getComputedStyle(cream).backgroundColor : null,
      paper: paper ? getComputedStyle(paper).backgroundColor : null,
      paperWidth: paper ? Math.round(paper.getBoundingClientRect().width) : null,
      paperRight: paper ? Math.round(paper.getBoundingClientRect().right) : null,
      paperBottom: paper ? Math.round(paper.getBoundingClientRect().bottom) : null,
      viewW: window.innerWidth,
      viewH: window.innerHeight,
      barH: bar ? Math.round(bar.getBoundingClientRect().height) : null,
      namePx: name ? getComputedStyle(name).fontSize : null,
      saveH: save ? Math.round(save.getBoundingClientRect().height) : null,
      saveBg: save ? getComputedStyle(save).backgroundColor : null,
    };
  });
}

const laptop = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
});
const laptopPage = await laptop.newPage();
await openHarness(laptopPage);
const laptopMetrics = await measure(laptopPage);
const creamAt = await laptopPage.evaluate(() => {
  const x = 10;
  const y = 80;
  const el = document.elementFromPoint(x, y);
  return el ? getComputedStyle(el).backgroundColor : null;
});
console.log('laptop', { ...laptopMetrics, creamAt });
await laptopPage.screenshot({ path: `${OUT}/person-tickets-laptop-1280.png`, type: 'png' });
await laptop.close();

const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
const phonePage = await phone.newPage();
await openHarness(phonePage);
console.log('phone', await measure(phonePage));
await phonePage.screenshot({ path: `${OUT}/person-tickets-phone-390.png`, type: 'png' });
await phone.close();

await browser.close();
console.log('wrote person-tickets LOOK frames');
