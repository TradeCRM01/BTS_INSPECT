import { copyFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const PHASE = process.env.P1_PHASE === 'after' ? 'after' : 'before';
const DOC_OUT = 'docs/look/p1';
const ART_OUT = '/opt/cursor/artifacts/p1';

mkdirSync(DOC_OUT, { recursive: true });
mkdirSync(ART_OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const DASH_WIDTHS = [375, 390, 768, 1024, 1280];
const URL = `${BASE}/?auditAuth=1&look=dashboard`;

function save(name) {
  copyFileSync(`${DOC_OUT}/${name}`, `${ART_OUT}/${name}`);
  console.log('wrote', `${DOC_OUT}/${name}`);
}

async function openDashboard(page) {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 25000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

async function contextFor(width) {
  const phone = width <= 430;
  return browser.newContext({
    viewport: { width, height: phone ? 844 : 900 },
    deviceScaleFactor: 1,
    isMobile: phone,
    hasTouch: phone,
    locale: 'en-AU',
    timezoneId: 'Australia/Perth',
    colorScheme: 'light',
  });
}

for (const width of DASH_WIDTHS) {
  const ctx = await contextFor(width);
  const page = await ctx.newPage();
  await openDashboard(page);
  const top = `p1-dashboard-${PHASE}-${width}.png`;
  await page.screenshot({ path: `${DOC_OUT}/${top}`, type: 'png' });
  save(top);

  await page.evaluate(() => {
    const main = document.querySelector('main');
    if (main) main.scrollTop = Math.min(main.scrollHeight, 520);
    else window.scrollTo(0, 520);
  });
  await page.waitForTimeout(200);
  const scrolled = `p1-dashboard-${PHASE}-${width}-scroll.png`;
  await page.screenshot({ path: `${DOC_OUT}/${scrolled}`, type: 'png' });
  save(scrolled);
  await ctx.close();
}

for (const width of [768, 1280]) {
  const ctx = await contextFor(width);
  const page = await ctx.newPage();
  await openDashboard(page);
  const name = `p1-nav-${PHASE}-${width}.png`;
  await page.screenshot({ path: `${DOC_OUT}/${name}`, type: 'png', clip: { x: 0, y: 0, width, height: 88 } });
  save(name);
  await ctx.close();
}

{
  const ctx = await contextFor(390);
  const page = await ctx.newPage();
  await openDashboard(page);
  const name = `p1-tabs-${PHASE}-390.png`;
  await page.screenshot({
    path: `${DOC_OUT}/${name}`,
    type: 'png',
    clip: { x: 0, y: 844 - 88, width: 390, height: 88 },
  });
  save(name);
  await ctx.close();
}

await browser.close();
console.log(`p1 ${PHASE} LOOK capture done`);
