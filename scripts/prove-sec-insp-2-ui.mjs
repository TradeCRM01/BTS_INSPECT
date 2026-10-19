import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT || 'docs/look';
mkdirSync(OUT, { recursive: true });

const WIDTHS = [375, 390, 1024, 1280];
const PAGES = [
  {
    name: 'list',
    path: '/inspections?auditAuth=1&look=inspections-list',
    wait: '.hub-inspections-row',
    text: 'Pat Snapshot',
  },
  {
    name: 'detail-edit',
    path: '/inspections/look-insp-pat?auditAuth=1&look=inspection-snapshot-edit',
    wait: '[data-inspector-line="1"]',
    text: 'Pat Snapshot',
  },
  {
    name: 'detail-view',
    path: '/inspections/look-insp-pat?auditAuth=1&look=inspection-snapshot-view',
    wait: '[data-inspector-line="1"]',
    text: 'Pat Snapshot',
  },
];

function overflowMeasure() {
  const innerWidth = window.innerWidth;
  const scrollWidth = document.documentElement.scrollWidth;
  const paper = document.querySelector('.hub-inspections-document, .hub-inspections-list-doc, .hub-inspections');
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
  const inspector = document.querySelector('[data-inspector-line="1"]');
  const clippedSnapshot = [];
  if (inspector && inspector.scrollWidth > inspector.clientWidth + 1) {
    clippedSnapshot.push((inspector.textContent || '').slice(0, 80));
  }
  const paperRight = paper ? Math.round(paper.getBoundingClientRect().right) : 0;
  return {
    innerWidth,
    scrollWidth,
    maxRight: Math.round(maxRight),
    paperRight,
    snapshotText: document.body.textContent?.includes('Pat Snapshot') ?? false,
    licenceText: document.body.textContent?.includes('EC-4411') ?? false,
    clippedSnapshot,
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
    const okRight = measure.maxRight <= measure.innerWidth + 1
      && measure.paperRight <= measure.innerWidth + 1;
    const okText = measure.snapshotText && measure.licenceText && measure.clippedSnapshot.length === 0;
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
      path: `${OUT}/sec-insp-2-${pageSpec.name}-${width}.png`,
      type: 'png',
    });
    await context.close();
  }
}

await browser.close();
writeFileSync(`${OUT}/sec-insp-2-ui.json`, JSON.stringify(rows, null, 2));
console.log(JSON.stringify(rows, null, 2));
if (failed) {
  console.error('SEC-INSP-2 UI overflow or snapshot text failed');
  process.exit(1);
}
console.log('SEC-INSP-2 UI proof passed');
