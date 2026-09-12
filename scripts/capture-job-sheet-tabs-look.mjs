// LOOK + FUNCTION proof for the job sheet section rail and its Overview hub.
// Opens the DEV audit job (/jobs/audit-doc-job?auditAuth=1) at laptop 1280 and phone 390, measures the rail
// against the paper kit (all four labels at rest on both, no scroll), walks the four tabs and reads which trays
// are on the page, reads the five Overview lane chips and their cream / navy / #2E75B6 paint (empty fixture, then
// ?look=job-photos for real note and photo counts), clicks each lane and
// checks the sheet lands on its tray, reads the Paperwork group labels, the open bill on Materials, the
// reschedule deep link, the one primary, the More menu, and Post update landing in the notes composer.
// Run: node scripts/capture-job-sheet-tabs-look.mjs (needs `npm run dev` on LOOK_BASE_URL).
// Set LOOK_EXTRA_DIR to also write the Paperwork and Schedule & people views there.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { format, parseISO } from 'date-fns';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = 'docs/look';
const EXTRA_DIR = process.env.LOOK_EXTRA_DIR || null;
const JOB = '/jobs/audit-doc-job';

const PAGE = 'rgb(245, 240, 230)';
const SHEET = 'rgb(255, 253, 248)';
const INK = 'rgb(10, 37, 64)';
const MUTED = 'rgb(91, 107, 124)';
const LINE = 'rgb(226, 217, 204)';
const ACTION = 'rgb(46, 117, 182)';

const TABS = ['Overview', 'Schedule & people', 'Paperwork', 'Materials'];
const PANES = {
  overview: ['.hub-jobs-ledger', '#job-lanes'],
  schedule: ['#job-schedule', '#job-hours'],
  paperwork: ['#job-swms', '#job-visit-notes', '#job-insp', '#job-gallery', '#job-testing-due', '#job-quotes'],
  materials: ['#job-bill'],
};
const LANES = ['job-schedule', 'job-swms', 'job-visit-notes', 'job-quotes', 'job-bill'];
const GROUPS = ['Safety', 'Field records', 'Quotes & invoices'];
const CHIP_CLASSES = ['ops-status-ok', 'ops-status-wait', 'ops-status-info', 'ops-status-progress', 'ops-status-bad'];

// The audit job is pinned to Brisbane today at 07:30 with one crew member and empty lists.
const TODAY = format(parseISO(new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })), 'EEE d MMM');
const EMPTY_CHIPS = ['Booked', 'No JHA', 'Nothing posted', 'None yet', 'No materials'];
const EMPTY_METAS = [`${TODAY} 07:30 · Field Audit`, '0 JHA / SWMS · 0 Take 5', '0 inspections · 0 photos', '', 'Cost $0.00 · Charge $0.00'];

mkdirSync(OUT, { recursive: true });
if (EXTRA_DIR) mkdirSync(EXTRA_DIR, { recursive: true });

let passes = 0;
function assert(ok, message) {
  if (!ok) throw new Error(message);
  passes += 1;
}

// LOOK_BROWSER_CHANNEL=chrome runs on an installed Google Chrome when the bundled Chromium is absent.
const browser = await chromium.launch({ headless: true, channel: process.env.LOOK_BROWSER_CHANNEL || undefined });

async function open(page, query) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto(`${BASE}${JOB}${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.job-sheet-tabs .job-sheet-tab.is-on', { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  return pageErrors;
}

async function readRail(page) {
  return page.evaluate(() => {
    const cs = el => getComputedStyle(el);
    const rail = document.querySelector('.job-sheet-tabs');
    const tabs = [...rail.querySelectorAll('.job-sheet-tab')];
    const on = rail.querySelector('.job-sheet-tab.is-on');
    const off = tabs.find(t => t !== on);
    const primaries = [...document.querySelectorAll('.hub-jobs-document .hub-jobs-tools .btn-primary')];
    const primary = primaries[0];
    const railRect = rail.getBoundingClientRect();
    const onRect = on.getBoundingClientRect();
    return {
      url: location.search + location.hash,
      labels: tabs.map(t => t.textContent.trim()),
      roles: [rail.getAttribute('role'), ...new Set(tabs.map(t => t.getAttribute('role')))],
      selectedCount: tabs.filter(t => t.getAttribute('aria-selected') === 'true').length,
      on: on.dataset.tab,
      onColor: cs(on).color,
      onWeight: cs(on).fontWeight,
      onShadow: cs(on).boxShadow,
      offColor: cs(off).color,
      offShadow: cs(off).boxShadow,
      tabH: Math.round(onRect.height),
      tabFont: `${cs(on).fontFamily} ${cs(on).fontSize}`,
      hairline: cs(rail).borderBottom,
      scrolls: rail.scrollWidth > rail.clientWidth,
      // The first chip carries a negative margin so its text lines up with the hero, like the list strip.
      onInsideRail: onRect.left >= railRect.left - 13 && onRect.right <= railRect.right + 1,
      // Every label sits inside the rail's visible box at rest. On phone that is what keeps Materials a word.
      allInsideRail: tabs.every(t => {
        const r = t.getBoundingClientRect();
        return r.left >= railRect.left - 13 && r.right <= railRect.right + 1;
      }),
      railFlush: Math.round(railRect.left) === Math.round(document.querySelector('.hub-jobs-sheet-body').getBoundingClientRect().left),
      primaryCount: primaries.length,
      primaryGap: Math.round(railRect.top - primary.getBoundingClientRect().bottom),
      primaryH: Math.round(primary.getBoundingClientRect().height),
      primaryBg: cs(primary).backgroundColor,
      sheetBg: cs(document.querySelector('.hub-jobs-sheet-body')).backgroundColor,
      pageBg: cs(document.querySelector('.hub-jobs') || document.body).backgroundColor,
      historyLength: history.length,
    };
  });
}

async function visiblePanes(page) {
  return page.evaluate(() => {
    const shown = [...document.querySelectorAll('[data-job-tab]')]
      .filter(el => el.checkVisibility() || getComputedStyle(el).display === 'contents' && !el.hidden)
      .map(el => el.dataset.jobTab);
    return [...new Set(shown)];
  });
}

async function isShown(page, selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return null;
    if (el.hidden) return false;
    return el.checkVisibility() || getComputedStyle(el).display === 'contents';
  }, selector);
}

async function readLanes(page) {
  return page.evaluate(() => [...document.querySelectorAll('#job-lanes [data-lane]')].map(row => {
    const chip = row.querySelector('.ops-status');
    return {
      lane: row.dataset.lane,
      title: row.querySelector('.ops-related-title').textContent.trim(),
      meta: row.querySelector('.ops-meta')?.textContent.trim() ?? '',
      chip: chip.textContent.trim(),
      chipClasses: [...chip.classList],
      chipH: Math.round(chip.getBoundingClientRect().height),
      chipFont: getComputedStyle(chip).fontFamily,
      chipColor: getComputedStyle(chip).color,
      chipBg: getComputedStyle(chip).backgroundColor,
      chipBorder: getComputedStyle(chip).borderColor,
      rowH: Math.round(row.getBoundingClientRect().height),
      isButton: !!row.querySelector('button.ops-related-main'),
      chevron: !!row.querySelector('svg.lucide-chevron-right'),
    };
  }));
}

// The sheet scrolls inside the AppShell main, not the window. A tray wrapper is display: contents, so
// measure its first laid-out child. Wait for the smooth scroll to settle before reading.
async function landedOn(page, id) {
  let last = -1;
  for (let i = 0; i < 20; i += 1) {
    await page.waitForTimeout(50);
    const now = await page.evaluate(() => {
      const main = document.querySelector('main');
      return main ? main.scrollTop : document.scrollingElement.scrollTop;
    });
    if (now === last) break;
    last = now;
  }
  return page.evaluate(id => {
    const el = document.getElementById(id);
    const box = el.getClientRects().length ? el : el.firstElementChild;
    const main = document.querySelector('main') ?? document.scrollingElement;
    const mainTop = main.getBoundingClientRect().top;
    return {
      top: Math.round(box.getBoundingClientRect().top - mainTop),
      atEnd: Math.ceil(main.scrollTop + main.clientHeight) >= main.scrollHeight - 1,
    };
  }, id);
}

// Phone drops the tab type one step and runs the rail flush to the paper edge so all four labels sit at rest.
function checkLook(label, m, phone) {
  assert(JSON.stringify(m.labels) === JSON.stringify(TABS), `${label}: tabs ${JSON.stringify(m.labels)}`);
  assert(JSON.stringify(m.roles) === JSON.stringify(['tablist', 'tab']), `${label}: roles ${JSON.stringify(m.roles)}`);
  assert(m.selectedCount === 1, `${label}: ${m.selectedCount} tabs selected`);
  assert(m.onColor === INK && m.onWeight === '600', `${label}: on tab ${m.onColor} ${m.onWeight}`);
  assert(m.onShadow.includes(ACTION) && m.onShadow.includes('inset'), `${label}: on tab underline ${m.onShadow}`);
  assert(m.offColor === MUTED && m.offShadow === 'none', `${label}: off tab ${m.offColor} ${m.offShadow}`);
  assert(m.tabH === 44, `${label}: tab height ${m.tabH}`);
  assert(m.tabFont.includes('Source Sans 3') && m.tabFont.endsWith(phone ? '13px' : '14px'), `${label}: tab font ${m.tabFont}`);
  assert(!m.scrolls && m.allInsideRail, `${label}: rail scrolls ${m.scrolls}, all tabs inside ${m.allInsideRail}`);
  assert(m.railFlush === phone, `${label}: rail flush to the paper edge ${m.railFlush}`);
  assert(m.hairline === `1px solid ${LINE}`, `${label}: rail hairline ${m.hairline}`);
  assert(m.primaryGap >= 8 && m.primaryGap <= 24, `${label}: rail sits ${m.primaryGap}px under the primary`);
  assert(m.primaryCount === 1, `${label}: ${m.primaryCount} primaries in the tools row`);
  assert(m.primaryH === 44 && m.primaryBg === ACTION, `${label}: primary ${m.primaryH} ${m.primaryBg}`);
  assert(m.sheetBg === SHEET, `${label}: sheet ${m.sheetBg}`);
  assert(m.pageBg === PAGE, `${label}: page ${m.pageBg}`);
}

async function checkTab(page, label, tab) {
  const shown = await visiblePanes(page);
  assert(JSON.stringify(shown) === JSON.stringify([tab]), `${label}: ${tab} shows panes ${JSON.stringify(shown)}`);
  for (const sel of PANES[tab]) {
    assert((await isShown(page, sel)) === true, `${label}: ${tab} should show ${sel}`);
  }
  for (const [other, sels] of Object.entries(PANES)) {
    if (other === tab) continue;
    for (const sel of sels) {
      const state = await isShown(page, sel);
      assert(state === false || state === null, `${label}: ${tab} still shows ${sel}`);
    }
  }
}

async function clickTab(page, tab) {
  await page.click(`.job-sheet-tab[data-tab="${tab}"]`);
  await page.waitForSelector(`.job-sheet-tab.is-on[data-tab="${tab}"]`);
  await page.waitForTimeout(150);
}

function checkLanes(label, lanes, chips, metas) {
  assert(JSON.stringify(lanes.map(l => l.lane)) === JSON.stringify(LANES), `${label}: lanes ${JSON.stringify(lanes.map(l => l.lane))}`);
  assert(JSON.stringify(lanes.map(l => l.chip)) === JSON.stringify(chips), `${label}: chips ${JSON.stringify(lanes.map(l => l.chip))}`);
  assert(JSON.stringify(lanes.map(l => l.meta)) === JSON.stringify(metas), `${label}: metas ${JSON.stringify(lanes.map(l => l.meta))}`);
  for (const lane of lanes) {
    assert(lane.chipClasses.filter(c => CHIP_CLASSES.includes(c)).length === 1, `${label}: ${lane.lane} chip classes ${lane.chipClasses}`);
    assert(lane.isButton && !lane.chevron, `${label}: ${lane.lane} row button ${lane.isButton} chevron ${lane.chevron}`);
  }
}

// The ?look= harnesses hide the hub, so only the plain audit page measures the rows.
// Chips speak cream, navy, and #2E75B6 only. Settled is ink on the cream chip, pending is muted on the same chip.
function checkLaneLook(label, lanes) {
  for (const lane of lanes) {
    assert(lane.chipH === 24 && lane.chipFont.includes('Source Sans 3'), `${label}: ${lane.lane} chip ${lane.chipH}px ${lane.chipFont}`);
    assert(lane.rowH === lanes[0].rowH && lane.rowH >= 44, `${label}: ${lane.lane} row ${lane.rowH}px against ${lanes[0].rowH}px`);
    if (lane.chipClasses.includes('ops-status-ok')) {
      assert(lane.chipColor === INK && lane.chipBg === PAGE && lane.chipBorder === LINE, `${label}: ${lane.lane} ok chip ${lane.chipColor} on ${lane.chipBg} / ${lane.chipBorder}`);
    } else if (lane.chipClasses.includes('ops-status-wait')) {
      assert(lane.chipColor === MUTED && lane.chipBg === PAGE && lane.chipBorder === LINE, `${label}: ${lane.lane} wait chip ${lane.chipColor} on ${lane.chipBg} / ${lane.chipBorder}`);
    } else {
      assert(lane.chipColor === ACTION, `${label}: ${lane.lane} chip ${lane.chipColor} on ${lane.chipBg}`);
    }
  }
}

async function frame(context, label, viewport) {
  const page = await context.newPage();
  const pageErrors = await open(page, '?auditAuth=1');

  const fresh = await readRail(page);
  console.log(label, fresh);
  checkLook(label, fresh, viewport === 'phone-390');
  assert(fresh.on === 'overview' && !fresh.url.includes('tab='), `${label}: default ${fresh.on} ${fresh.url}`);
  await checkTab(page, label, 'overview');
  const lanes = await readLanes(page);
  console.log(label, 'lanes', lanes.map(l => `${l.lane}: ${l.chip} | ${l.meta}`));
  checkLanes(label, lanes, EMPTY_CHIPS, EMPTY_METAS);
  checkLaneLook(label, lanes);
  const scope = await page.evaluate(() => document.querySelector('.hub-jobs-ledger .hub-jobs-scope')?.innerText.replace(/\s+/g, ' ').trim());
  assert(scope === 'Scope of works Isolate and replace the main board.', `${label}: scope block ${JSON.stringify(scope)}`);
  await page.screenshot({ path: `${OUT}/job-sheet-tabs-${viewport}.png`, type: 'png' });

  const walk = ['schedule', 'paperwork', 'materials', 'overview'];
  for (const tab of walk) {
    await clickTab(page, tab);
    const m = await readRail(page);
    assert(m.on === tab, `${label}: clicked ${tab}, rail says ${m.on}`);
    assert(tab === 'overview' ? !m.url.includes('tab=') : m.url.includes(`tab=${tab}`), `${label}: ${tab} url ${m.url}`);
    assert(m.url.includes('auditAuth=1'), `${label}: ${tab} dropped other params ${m.url}`);
    assert(m.historyLength === fresh.historyLength, `${label}: ${tab} pushed history ${fresh.historyLength} -> ${m.historyLength}`);
    assert(m.onInsideRail, `${label}: ${tab} chip sits outside the rail`);
    await checkTab(page, label, tab);
    if (tab === 'paperwork') {
      const groups = await page.evaluate(() => [...document.querySelectorAll('.job-sheet-group')].filter(el => !el.hidden).map(el => el.textContent.trim()));
      assert(JSON.stringify(groups) === JSON.stringify(GROUPS), `${label}: paperwork groups ${JSON.stringify(groups)}`);
      const ordered = await page.evaluate(() => {
        const [a, b, c] = ['#job-swms', '#job-visit-notes', '#job-quotes'].map(sel => document.querySelector(sel));
        const before = (x, y) => Boolean(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING);
        return before(a, b) && before(b, c);
      });
      assert(ordered, `${label}: paperwork trays out of document order`);
      const safety = await page.evaluate(() => [...document.querySelectorAll('#job-swms .ops-section-title')].map(el => el.textContent.trim()));
      assert(safety.some(t => t.startsWith('JHA / SWMS')) && safety.some(t => t.startsWith('Take 5')), `${label}: safety trays ${JSON.stringify(safety)}`);
    }
    if (tab === 'materials') {
      const bill = await page.evaluate(() => {
        const panel = document.querySelector('#job-bill .hub-jobs-bill-head ~ div');
        return { open: !!panel, text: panel?.textContent ?? '', chevron: !!document.querySelector('#job-bill .hub-jobs-bill-head svg.rotate-180') };
      });
      assert(bill.open && bill.text.includes('Charge total') && bill.chevron, `${label}: materials bill panel ${JSON.stringify({ open: bill.open, chevron: bill.chevron })}`);
    }
    if (EXTRA_DIR && (tab === 'paperwork' || tab === 'schedule')) {
      await page.screenshot({ path: `${EXTRA_DIR}/job-sheet-tabs-${tab}-${viewport}.png`, type: 'png' });
    }
  }

  for (const lane of LANES) {
    await clickTab(page, 'overview');
    await page.click(`#job-lanes [data-lane="${lane}"] button`);
    const tab = { 'job-schedule': 'schedule', 'job-swms': 'paperwork', 'job-visit-notes': 'paperwork', 'job-quotes': 'paperwork', 'job-bill': 'materials' }[lane];
    await page.waitForSelector(`.job-sheet-tab.is-on[data-tab="${tab}"]`);
    const m = await readRail(page);
    assert(m.url.includes(`tab=${tab}`) && m.historyLength === fresh.historyLength, `${label}: lane ${lane} url ${m.url} history ${m.historyLength}`);
    const landed = await landedOn(page, lane);
    assert(landed.top >= -1 && (landed.top < 400 || landed.atEnd), `${label}: lane ${lane} did not land on its tray (top ${landed.top}, at end ${landed.atEnd})`);
  }

  await clickTab(page, 'overview');
  await page.click('.hub-job-more > summary');
  const menu = await page.evaluate(() => [...document.querySelectorAll('.hub-job-more-menu [role="menuitem"]')].map(b => b.textContent.trim()));
  assert(menu[0] === 'Schedule & people' && menu[1] === 'Post update' && !menu.includes('Schedule / crew'), `${label}: more menu ${JSON.stringify(menu)}`);
  await page.click('.hub-job-more-menu [role="menuitem"]:has-text("Post update")');
  await page.waitForSelector('.job-sheet-tab.is-on[data-tab="paperwork"]');
  await page.waitForTimeout(200);
  const composer = await page.evaluate(() => ({
    focused: document.activeElement?.tagName === 'TEXTAREA' && !!document.activeElement.closest('#job-visit-notes'),
    newTab: document.querySelector('#job-visit-notes .job-notes-tab[data-tab="new"]')?.getAttribute('aria-selected') === 'true',
  }));
  assert(composer.focused && composer.newTab, `${label}: Post update landed ${JSON.stringify(composer)}`);

  await page.close();
  assert(pageErrors.length === 0, `${label}: page errors ${JSON.stringify(pageErrors)}`);

  const seeded = await context.newPage();
  const seededErrors = await open(seeded, '?auditAuth=1&look=job-photos');
  const seededLanes = await readLanes(seeded);
  console.log(label, 'seeded lanes', seededLanes.map(l => `${l.lane}: ${l.chip} | ${l.meta}`));
  const notes = await seeded.evaluate(() => Number(document.querySelector('#job-visit-notes .job-notes-tab-count')?.textContent));
  const photos = await seeded.evaluate(() => document.querySelectorAll('#job-gallery [data-gallery-photo]').length);
  assert(notes === 3 && photos === 6, `${label}: seeded fixture has ${notes} notes and ${photos} photos`);
  checkLanes(label, seededLanes, ['Booked', 'No JHA', '3 notes', 'None yet', 'No materials'], [EMPTY_METAS[0], EMPTY_METAS[1], '0 inspections · 6 photos', '', EMPTY_METAS[4]]);
  await seeded.close();
  assert(seededErrors.length === 0, `${label}: seeded page errors ${JSON.stringify(seededErrors)}`);

  const deep = await context.newPage();
  const deepErrors = await open(deep, '?auditAuth=1&tab=schedule');
  assert((await readRail(deep)).on === 'schedule', `${label}: ?tab=schedule did not open Schedule & people`);
  await checkTab(deep, label, 'schedule');
  await deep.close();
  assert(deepErrors.length === 0, `${label}: deep link page errors ${JSON.stringify(deepErrors)}`);

  const hash = await context.newPage();
  const hashErrors = await open(hash, '?auditAuth=1#job-gallery');
  assert((await readRail(hash)).on === 'paperwork', `${label}: #job-gallery did not open Paperwork`);
  await checkTab(hash, label, 'paperwork');
  const gallery = await landedOn(hash, 'job-gallery');
  assert(gallery.top >= -1 && (gallery.top < 400 || gallery.atEnd), `${label}: #job-gallery not scrolled into view (top ${gallery.top}, at end ${gallery.atEnd})`);
  await clickTab(hash, 'overview');
  assert((await readRail(hash)).on === 'overview', `${label}: Overview unreachable after a hash load`);
  await hash.close();
  assert(hashErrors.length === 0, `${label}: hash page errors ${JSON.stringify(hashErrors)}`);

  const resched = await context.newPage();
  const reschedErrors = await open(resched, '?auditAuth=1&tab=materials&reschedule=1');
  await resched.waitForTimeout(300);
  const r = await readRail(resched);
  assert(r.on === 'schedule' && r.url.includes('reschedule=1') && r.url.includes('tab=schedule'), `${label}: reschedule ${r.on} ${r.url}`);
  await resched.close();
  assert(reschedErrors.length === 0, `${label}: reschedule page errors ${JSON.stringify(reschedErrors)}`);
}

const laptop = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
  locale: 'en-AU',
});
await frame(laptop, 'laptop', 'laptop-1280');
await laptop.close();

const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  locale: 'en-AU',
});
await frame(phone, 'phone', 'phone-390');
await phone.close();

await browser.close();
console.log(`${passes} checks passed. Wrote job sheet tab rail LOOK frames.`);
