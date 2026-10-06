import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT_DIR || 'docs/look';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

const states = [
  { look: 'crew-s8d-needs-crew', slug: 'needs-crew' },
  { look: 'crew-s8d-booked', slug: 'booked' },
  { look: 'crew-s8d-not-scheduled', slug: 'not-scheduled' },
];

const widths = [
  { w: 375, tag: '375' },
  { w: 390, tag: '390' },
  { w: 1280, tag: '1280' },
];

async function capture(look, slug, width, tag) {
  const context = await browser.newContext({
    viewport: { width, height: width < 500 ? 844 : 900 },
    deviceScaleFactor: 1,
    locale: 'en-AU',
    isMobile: width < 500,
    hasTouch: width < 500,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/jobs?auditAuth=1&look=${look}`, { waitUntil: 'domcontentloaded' });
  if (width >= 1280) {
    await page.waitForSelector('.hub-jobs-row .hub-jobs-status', { timeout: 20000 });
  } else {
    await page.waitForSelector('[data-jobs-phone-row]', { timeout: 20000 });
    await page.waitForSelector('.hub-jobs-phone-status', { timeout: 20000 });
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  const path = `${OUT}/crew-s8d-${slug}-${tag}.png`;
  await page.screenshot({ path, type: 'png' });
  await context.close();
  return path;
}

for (const state of states) {
  for (const { w, tag } of widths) {
    const path = await capture(state.look, state.slug, w, tag);
    console.log('wrote', path);
  }
}

await browser.close();
