// LOOK frames for the composed visit note as one card on the job sheet's Visit notes wall.
// Opens the DEV look harness (/jobs/audit-doc-job?look=visit-notes) at laptop 1280 and phone 390,
// measures the card, header, nested sections, and column alignment, and fails on any drift.
// Run: node scripts/capture-visit-composed-note-look.mjs (needs `npm run dev` on LOOK_BASE_URL).
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = 'docs/look';
const HARNESS = '/jobs/audit-doc-job?look=visit-notes';
const SECTION_LABELS = ['Done', 'Left to do', 'Parts used', 'Parts needed next visit', 'Customer wants'];

mkdirSync(OUT, { recursive: true });

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

const browser = await chromium.launch({ headless: true });

async function openHarness(page) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto(`${BASE}${HARNESS}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#job-visit-notes .job-visit-log', { timeout: 20000 });
  await page.waitForFunction(() => {
    const tray = document.querySelector('#job-visit-notes');
    const fields = document.querySelectorAll('#job-visit-notes textarea[data-visit-section]');
    return tray?.textContent?.includes('Visit notes')
      && tray?.textContent?.includes('Fitted the new unit')
      && fields.length === 5;
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  return pageErrors;
}

async function scrollTo(page, selector, block = 'start') {
  return page.evaluate(([sel, blk]) => {
    const target = document.querySelector(sel);
    if (!target) return { ok: false };
    target.scrollIntoView({ block: blk, inline: 'nearest' });
    return { ok: true, top: Math.round(target.getBoundingClientRect().top), scrollY: Math.round(window.scrollY) };
  }, [selector, block]);
}

async function measure(page) {
  return page.evaluate(() => {
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const rect = (el) => (el ? el.getBoundingClientRect() : null);
    const tray = document.querySelector('#job-visit-notes');
    const rows = [...tray.querySelectorAll('.job-visit-row')];
    const first = rows[0] ?? null;
    const stamp = first?.querySelector('.job-visit-stamp') ?? null;
    const author = first?.querySelector('.job-visit-author') ?? null;
    const time = first?.querySelector('.job-visit-time') ?? null;
    const body = first?.querySelector('.job-visit-body') ?? null;
    const block = first?.querySelector('.job-visit-body .job-visit-block') ?? null;
    const composerField = tray.querySelector('textarea[data-visit-section]');
    const primary = document.querySelector('.hub-jobs-document .hub-jobs-tools .btn-primary');
    const firstTrack = block ? parseFloat(cs(block).gridTemplateColumns.split(' ')[0]) : NaN;
    const columnGap = block ? parseFloat(cs(block).columnGap) : NaN;
    const inView = (el) => {
      const r = rect(el);
      return !!r && r.top >= 0 && r.bottom <= window.innerHeight;
    };
    return {
      view: `${window.innerWidth}x${window.innerHeight}`,
      rowCount: rows.length,
      perRow: rows.map(row => ({
        stamps: row.querySelectorAll('.job-visit-stamp').length,
        authors: row.querySelectorAll('.job-visit-author').length,
        times: row.querySelectorAll('.job-visit-time').length,
        author: row.querySelector('.job-visit-author')?.textContent ?? null,
        time: row.querySelector('.job-visit-time')?.textContent ?? null,
      })),
      stampsInsideBodies: tray.querySelectorAll('.job-visit-body .job-visit-stamp').length,
      firstLabels: [...(first?.querySelectorAll('.job-visit-body .job-visit-block .job-visit-section-label') ?? [])].map(l => l.textContent),
      card: first ? {
        backgroundColor: cs(first).backgroundColor,
        borderTopWidth: cs(first).borderTopWidth,
        borderTopColor: cs(first).borderTopColor,
        borderTopLeftRadius: cs(first).borderTopLeftRadius,
        boxShadow: cs(first).boxShadow,
        padding: cs(first).padding,
        height: Math.round(rect(first).height),
      } : null,
      authorFont: author ? `${cs(author).fontFamily} ${cs(author).fontWeight} ${cs(author).fontSize}` : null,
      timeFont: time ? `${cs(time).fontFamily} ${cs(time).fontWeight} ${cs(time).fontSize}` : null,
      stampDisplay: stamp ? cs(stamp).display : null,
      bodyInset: body?.firstElementChild && stamp
        ? Math.round((rect(body.firstElementChild).left - rect(stamp).left) * 10) / 10
        : null,
      blockDisplay: block ? cs(block).display : null,
      blockColumns: block ? cs(block).gridTemplateColumns : null,
      blockTextLeft: block && Number.isFinite(firstTrack) ? Math.round((rect(block).left + firstTrack + columnGap) * 10) / 10 : null,
      composerTextLeft: composerField ? Math.round(rect(composerField).left * 10) / 10 : null,
      firstCardInView: inView(first),
      primaryH: primary ? Math.round(rect(primary).height) : null,
      primaryBg: cs(primary)?.backgroundColor ?? null,
    };
  });
}

function check(label, m, { bodyInset, alignColumns }) {
  assert(m.rowCount === 3, `${label}: expected 3 cards, got ${m.rowCount}`);
  m.perRow.forEach((row, i) => {
    assert(row.stamps === 1, `${label}: card ${i} has ${row.stamps} stamps`);
    assert(row.authors === 1, `${label}: card ${i} has ${row.authors} authors`);
    assert(row.times === 1, `${label}: card ${i} has ${row.times} times`);
  });
  assert(
    JSON.stringify(m.firstLabels) === JSON.stringify(SECTION_LABELS),
    `${label}: first card labels ${JSON.stringify(m.firstLabels)} != ${JSON.stringify(SECTION_LABELS)}`,
  );
  assert(m.stampsInsideBodies === 0, `${label}: ${m.stampsInsideBodies} stamps nested inside bodies`);
  assert(m.card.backgroundColor === 'rgb(255, 253, 248)', `${label}: card background ${m.card.backgroundColor}`);
  assert(m.card.borderTopWidth === '1px', `${label}: card border width ${m.card.borderTopWidth}`);
  assert(m.card.borderTopColor === 'rgb(226, 217, 204)', `${label}: card border color ${m.card.borderTopColor}`);
  assert(m.card.borderTopLeftRadius === '12px', `${label}: card radius ${m.card.borderTopLeftRadius}`);
  assert(m.card.boxShadow.includes('inset'), `${label}: card shadow has no inset: ${m.card.boxShadow}`);
  assert(m.authorFont.includes('Rajdhani') && m.authorFont.includes(' 700 '), `${label}: author font ${m.authorFont}`);
  assert(m.timeFont.includes('Source Sans 3'), `${label}: time font ${m.timeFont}`);
  assert(Math.abs(m.bodyInset - bodyInset) <= 1, `${label}: body inset ${m.bodyInset}, expected ${bodyInset}`);
  if (alignColumns) {
    assert(m.blockDisplay === 'grid', `${label}: block display ${m.blockDisplay}`);
    assert(
      Math.abs(m.blockTextLeft - m.composerTextLeft) <= 2,
      `${label}: block text column left ${m.blockTextLeft} vs composer text left ${m.composerTextLeft}`,
    );
  }
  assert(m.primaryH === 44, `${label}: primary height ${m.primaryH}`);
  assert(m.primaryBg === 'rgb(46, 117, 182)', `${label}: primary background ${m.primaryBg}`);
}

async function frame(context, label, anchor, out, expectations) {
  const page = await context.newPage();
  const pageErrors = await openHarness(page);
  console.log(`${label} scroll`, await scrollTo(page, anchor));
  await page.waitForTimeout(200);
  const m = await measure(page);
  console.log(label, m);
  await page.screenshot({ path: `${OUT}/${out}`, type: 'png' });
  await page.close();
  assert(pageErrors.length === 0, `${label}: page errors ${JSON.stringify(pageErrors)}`);
  check(label, m, expectations);
}

const laptop = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
  locale: 'en-AU',
});
await frame(laptop, 'laptop', '#job-visit-notes .ops-section-title', 'visit-composed-note-laptop-1280.png', { bodyInset: 12, alignColumns: true });
await laptop.close();

const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  locale: 'en-AU',
});
await frame(phone, 'phone', '#job-visit-notes .job-visit-log', 'visit-composed-note-phone-390.png', { bodyInset: 8, alignColumns: false });
await phone.close();

await browser.close();
console.log('wrote visit composed note LOOK frames');
