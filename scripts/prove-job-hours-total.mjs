// FUNCTION + LOOK proof for the running total on the job sheet's Time lane.
// Opens the DEV audit job on Schedule & people at laptop 1280 and phone 390, reads the "Time on this job"
// heading on the empty fixture (0h 00m) and on ?look=job-hours (1h 30m + 0h 45m closed, one running entry
// ignored = 2h 15m), checks the total paints in navy / muted / #2E75B6 only, stays on one line inside its
// tray on phone, leaves the per-row durations alone, and writes the frames to docs/look.
// Run: node scripts/prove-job-hours-total.mjs (needs `npm run dev` on LOOK_BASE_URL).
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = 'docs/look';
const JOB = '/jobs/audit-doc-job';

const INK = 'rgb(10, 37, 64)';
const MUTED = 'rgb(91, 107, 124)';
const ACTION = 'rgb(46, 117, 182)';
const PAPER = [INK, MUTED, ACTION];

const FIXTURES = [
  { name: 'empty', query: '?auditAuth=1&tab=schedule', total: '0h 00m', count: '0', rows: [] },
  { name: 'total', query: '?auditAuth=1&tab=schedule&look=job-hours', total: '2h 15m', count: '3', rows: ['', '1h 30m', '0h 45m'] },
];

mkdirSync(OUT, { recursive: true });

let passes = 0;
function assert(ok, message) {
  if (!ok) throw new Error(message);
  passes += 1;
}

// LOOK_BROWSER_CHANNEL=chrome runs on an installed Google Chrome when the bundled Chromium is absent.
const browser = await chromium.launch({ headless: true, channel: process.env.LOOK_BROWSER_CHANNEL || undefined });

async function open(page, fixture) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto(`${BASE}${JOB}${fixture.query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.job-sheet-tab.is-on[data-tab="schedule"]', { timeout: 20000 });
  // The heading reads 0h 00m while the query is in flight, so wait for the list itself to settle.
  await page.waitForSelector(fixture.rows.length ? '#job-hours .ops-related-row' : '#job-hours .ops-tray-empty', { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => document.querySelector('#job-hours').firstElementChild.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(250);
  return pageErrors;
}

async function readLane(page) {
  return page.evaluate(() => {
    const cs = el => getComputedStyle(el);
    const tray = document.querySelector('#job-hours .ops-tray');
    const head = tray.querySelector('.ops-tray-head');
    const h2 = tray.querySelector('.ops-section-title');
    const count = h2.querySelector('.ops-meta:not([data-summary])');
    const total = h2.querySelector('[data-summary]');
    const label = h2.querySelector('.truncate');
    const h2Rect = h2.getBoundingClientRect();
    const totalRect = total.getBoundingClientRect();
    // An empty tray's head is display: contents, so the paper edge is the tray itself.
    const edge = (head.getClientRects().length ? head : tray).getBoundingClientRect();
    return {
      // Flex children carry no whitespace between them, so the visible heading is label, then the total.
      heading: [...h2.children].filter(el => el.getClientRects().length).map(el => el.textContent.trim()).join(' '),
      // The job sheet's document look hides the count and icon inside tray titles.
      countShown: count.getClientRects().length > 0,
      total: total.textContent.replace(/^·\s*/, '').trim(),
      totalColor: cs(total).color,
      totalFont: `${cs(total).fontFamily} ${cs(total).fontSize} ${cs(total).fontWeight}`,
      totalWrap: cs(total).whiteSpace,
      totalOneLine: totalRect.height > 0 && totalRect.height < parseFloat(cs(total).fontSize) * 2,
      totalInsideTray: totalRect.left >= edge.left - 1 && totalRect.right <= edge.right + 1,
      headingOverflows: h2.scrollWidth > h2.clientWidth + 1,
      // `truncate` clips the label with an ellipsis, so the h2 never overflows. Read the label's own box.
      labelClipped: label.scrollWidth > label.clientWidth + 1,
      headingInsideTray: h2Rect.right <= edge.right + 1,
      viewport: innerWidth,
      rowDurations: [...tray.querySelectorAll('.ops-related-row')].map(row => row.querySelector('.ops-related-main > .ops-meta')?.textContent.trim() ?? ''),
      rowTitles: [...tray.querySelectorAll('.ops-related-title')].map(el => el.textContent.trim()),
    };
  });
}

async function frame(context, label, viewport) {
  for (const fixture of FIXTURES) {
    const page = await context.newPage();
    const pageErrors = await open(page, fixture);
    const tag = `${label} ${fixture.name}`;
    await page.waitForFunction(
      expected => document.querySelector('#job-hours [data-summary]')?.textContent.includes(expected),
      fixture.total,
      { timeout: 10000 },
    );
    const m = await readLane(page);
    console.log(tag, m);
    assert(m.heading === `Time on this job · ${fixture.total}`, `${tag}: heading ${JSON.stringify(m.heading)}`);
    assert(!m.countShown, `${tag}: count shown in the document heading`);
    assert(m.total === fixture.total, `${tag}: total ${m.total}`);
    assert(PAPER.includes(m.totalColor), `${tag}: total paints ${m.totalColor}`);
    assert(m.totalFont.includes('Source Sans 3') && m.totalFont.endsWith('400'), `${tag}: total font ${m.totalFont}`);
    assert(m.totalWrap === 'nowrap' && m.totalOneLine, `${tag}: total wraps ${m.totalWrap}, one line ${m.totalOneLine}`);
    assert(m.totalInsideTray && m.headingInsideTray && !m.headingOverflows, `${tag}: heading overflows ${m.headingOverflows}, inside tray ${m.headingInsideTray}/${m.totalInsideTray}`);
    assert(!m.labelClipped, `${tag}: label clipped to an ellipsis`);
    assert(JSON.stringify(m.rowDurations) === JSON.stringify(fixture.rows), `${tag}: row durations ${JSON.stringify(m.rowDurations)}`);
    if (fixture.rows.length) {
      assert(m.rowTitles[0].endsWith('running') && !m.rowTitles[1].endsWith('running'), `${tag}: running row ${JSON.stringify(m.rowTitles)}`);
    }
    assert(pageErrors.length === 0, `${tag}: page errors ${JSON.stringify(pageErrors)}`);
    const suffix = fixture.name === 'empty' ? '-empty' : '';
    await page.screenshot({ path: `${OUT}/job-hours-total${suffix}-${viewport}.png`, type: 'png' });
    await page.close();
  }
}

// Brisbane so the seeded rows read as a crew day (07:30–09:00) rather than the runner's UTC clock.
const TZ = 'Australia/Brisbane';
const laptop = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: 'en-AU', timezoneId: TZ });
await frame(laptop, 'laptop', 'laptop-1280');
await laptop.close();

const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'en-AU', timezoneId: TZ });
await frame(phone, 'phone', 'phone-390');
await phone.close();

await browser.close();
console.log(`${passes} checks passed. Wrote job hours total LOOK frames.`);
