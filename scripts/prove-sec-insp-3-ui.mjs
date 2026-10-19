import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT || 'docs/look';
mkdirSync(OUT, { recursive: true });

const WIDTHS = [375, 390, 1024, 1280];
const PAGES = [
  {
    name: 'issued-view',
    path: '/inspections/look-insp-pat?auditAuth=1&look=inspection-issued-view',
    wait: '[data-issued-lock="1"]',
    text: 'Issued. Contact the office to amend.',
  },
  {
    name: 'issued-edit',
    path: '/inspections/look-insp-pat?auditAuth=1&look=inspection-issued-edit',
    wait: '[data-issued-lock="1"]',
    text: 'Issued. Contact the office to amend.',
  },
];

function overflowMeasure() {
  const innerWidth = window.innerWidth;
  const scrollWidth = document.documentElement.scrollWidth;
  const paper = document.querySelector('.hub-inspections-document, .hub-inspections');
  const nodes = [...document.querySelectorAll('body *')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  let maxRight = 0;
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (el.getAttribute('aria-hidden') === 'true') continue;
    if ((style.position === 'fixed' || style.position === 'absolute') && (r.right <= 0 || r.left >= innerWidth)) continue;
    if (el.classList.contains('shell-root') || el.closest('.shell-root')) continue;
    let scrolled = false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if ((ps.overflowX === 'auto' || ps.overflowX === 'scroll') && p.scrollWidth > p.clientWidth + 1) {
        scrolled = true;
        break;
      }
    }
    if (scrolled) continue;
    if (r.right > maxRight) maxRight = r.right;
  }
  const lock = document.querySelector('[data-issued-lock="1"]');
  const clippedLock = [];
  if (lock && lock.scrollWidth > lock.clientWidth + 1) {
    clippedLock.push((lock.textContent || '').slice(0, 80));
  }
  const paperRight = paper ? Math.round(paper.getBoundingClientRect().right) : 0;
  return {
    innerWidth,
    scrollWidth,
    maxRight: Math.round(maxRight),
    paperRight,
    lockText: document.body.textContent?.includes('Issued. Contact the office to amend.') ?? false,
    clippedLock,
  };
}

const browser = await chromium.launch({
  headless: true,
  ...(process.env.LOOK_BROWSER_CHANNEL ? { channel: process.env.LOOK_BROWSER_CHANNEL } : {}),
});

const rows = [];
let failed = false;

for (const pageSpec of PAGES) {
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: width < 500 ? 844 : 900 },
      deviceScaleFactor: 1,
      isMobile: width < 500,
      hasTouch: width < 500,
      locale: 'en-AU',
    });
    const page = await context.newPage();
    await page.goto(`${BASE}${pageSpec.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector(pageSpec.wait, { timeout: 20000 });
    await page.waitForFunction((text) => document.body.textContent?.includes(text), pageSpec.text);
    await page.evaluate(() => document.fonts.ready);
    const measure = await page.evaluate(overflowMeasure);
    const okScroll = measure.scrollWidth <= measure.innerWidth;
    const okRight = measure.maxRight <= measure.innerWidth && measure.paperRight <= measure.innerWidth;
    const okText = measure.lockText && measure.clippedLock.length === 0;
    const ok = okScroll && okRight && okText;
    if (!ok) failed = true;
    rows.push({
      page: pageSpec.name,
      width,
      ...measure,
      okScroll,
      okRight,
      okText,
      ok,
    });
    await page.screenshot({
      path: `${OUT}/sec-insp-3-${pageSpec.name}-${width}.png`,
      type: 'png',
    });
    await context.close();
  }
}

await browser.close();
writeFileSync(`${OUT}/sec-insp-3-ui.json`, JSON.stringify(rows, null, 2));
console.log(JSON.stringify(rows, null, 2));
if (failed) {
  console.error('SEC-INSP-3 UI overflow or issued lock text failed');
  process.exit(1);
}
console.log('SEC-INSP-3 UI proof passed');
