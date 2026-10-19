import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.PORTAL_CARD_OUT || '/opt/cursor/artifacts/portal-token-cards';

mkdirSync(OUT, { recursive: true });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const CASES = [
  { id: 'expired', error: 'Link expired', title: 'Link expired' },
  { id: 'revoked', error: 'Link revoked', title: 'Link revoked' },
  { id: 'invalid', error: 'Invalid link', title: 'Invalid link' },
];

const VIEWPORTS = [
  { width: 375, height: 812, isMobile: true },
  { width: 390, height: 844, isMobile: true },
  { width: 1024, height: 768, isMobile: false },
  { width: 1280, height: 800, isMobile: false },
];

const browser = await chromium.launch({
  headless: true,
  ...(process.env.LOOK_BROWSER_CHANNEL ? { channel: process.env.LOOK_BROWSER_CHANNEL } : {}),
});

const rows = [];

async function measure(page) {
  return page.evaluate(() => {
    const root = document.querySelector('#client-portal');
    const card = document.querySelector('.portal-state-card');
    const nodes = [...document.querySelectorAll('#client-portal *')];
    const rights = nodes.map((el) => el.getBoundingClientRect().right);
    const clipped = nodes.filter((el) => {
      const style = getComputedStyle(el);
      if (style.overflow === 'visible' && style.overflowX === 'visible') return false;
      return el.scrollWidth > el.clientWidth + 1;
    }).map((el) => el.className || el.tagName);
    return {
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      maxRight: rights.length ? Math.max(...rights) : 0,
      cardKind: card?.getAttribute('data-portal-error') ?? null,
      title: card?.querySelector('.portal-state-title')?.textContent ?? null,
      body: card?.querySelector('.portal-muted')?.textContent ?? null,
      generic: (card?.textContent ?? '').includes('Edge Function returned a non-2xx status code'),
      rootWidth: root ? root.getBoundingClientRect().width : null,
      clipped,
    };
  });
}

async function intercept(page, errorBody) {
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (!/\/functions\/v1\/client-portal/.test(url)) return route.continue();
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 200, headers: CORS });
    }
    return route.fulfill({
      status: 403,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify({ error: errorBody }),
    });
  });
}

for (const vp of VIEWPORTS) {
  for (const card of CASES) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      isMobile: vp.isMobile,
      hasTouch: vp.isMobile,
      locale: 'en-AU',
    });
    const page = await ctx.newPage();
    await intercept(page, card.error);
    await page.goto(`${BASE}/p?t=${card.id}-token`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`[data-portal-error="${card.id}"]`, { timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
    const metrics = await measure(page);
    const fit = metrics.scrollWidth <= metrics.innerWidth
      && metrics.maxRight <= metrics.innerWidth + 0.5
      && !metrics.generic
      && metrics.clipped.length === 0;
    rows.push({
      viewport: vp.width,
      card: card.id,
      scrollWidth: metrics.scrollWidth,
      innerWidth: metrics.innerWidth,
      maxRight: Number(metrics.maxRight.toFixed(2)),
      title: metrics.title,
      generic: metrics.generic,
      clipped: metrics.clipped,
      fit,
    });
    await page.screenshot({
      path: `${OUT}/portal-${card.id}-${vp.width}.png`,
      type: 'png',
      fullPage: true,
    });
    await ctx.close();
    if (!fit) {
      console.error('OVERFLOW', JSON.stringify({ vp: vp.width, card: card.id, metrics }, null, 2));
    }
  }
}

await browser.close();
writeFileSync(`${OUT}/width-table.json`, JSON.stringify(rows, null, 2));
console.log(JSON.stringify(rows, null, 2));
if (rows.some((row) => !row.fit)) {
  process.exit(1);
}
console.log('token cards fit at 375/390/1024/1280');
