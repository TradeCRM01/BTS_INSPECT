import { copyFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const DOC_OUT = 'docs/look';
const ART_OUT = '/opt/cursor/artifacts';
const PROOFS_OUT = '/workspace/grafter-proofs/dash1';

mkdirSync(DOC_OUT, { recursive: true });
mkdirSync(ART_OUT, { recursive: true });
mkdirSync(PROOFS_OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function openDashboard(page, look) {
  const q = look ? `?auditAuth=1&look=${look}` : '?auditAuth=1&look=dashboard';
  await page.goto(`${BASE}/${q}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-dashboard-view-grid="1"]', { timeout: 20000 });
  await page.waitForFunction(() => {
    const grid = document.querySelector('[data-dashboard-view-grid="1"]');
    return grid && grid.children.length >= 3;
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

function saveAll(name) {
  for (const dir of [ART_OUT, PROOFS_OUT]) {
    copyFileSync(`${DOC_OUT}/${name}`, `${dir}/${name}`);
  }
  console.log('wrote', `${DOC_OUT}/${name}`);
}

async function capture(width, tag, look) {
  const ctx = await browser.newContext({
    viewport: { width, height: width <= 400 ? 844 : 900 },
    deviceScaleFactor: 1,
    isMobile: width <= 400,
    hasTouch: width <= 400,
    locale: 'en-AU',
    timezoneId: 'Australia/Perth',
  });
  const page = await ctx.newPage();
  await openDashboard(page, look);
  const suffix = look === 'dashboard-jack' ? 'jack' : 'default';
  const name = `dash1-${suffix}-${tag}.png`;
  await page.screenshot({ path: `${DOC_OUT}/${name}`, type: 'png', fullPage: true });
  saveAll(name);
  await ctx.close();
}

for (const w of [375, 390, 1280]) {
  await capture(w, w, 'dashboard');
}
for (const w of [375, 390, 1280]) {
  await capture(w, w, 'dashboard-jack');
}

await browser.close();
console.log('dash1 LOOK capture done');
