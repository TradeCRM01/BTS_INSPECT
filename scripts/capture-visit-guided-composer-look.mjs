// LOOK frames for the guided visit-note composer on the job sheet's Visit notes tray.
// Opens the DEV look harness (/jobs/audit-doc-job?look=visit-notes), types into three of
// the five sections so labels read both filled and empty, and frames (1) the composer open
// and (2) the wall with the seeded multi-section note, at laptop 1280 and phone 390.
// Run: node scripts/capture-visit-guided-composer-look.mjs (needs `npm run dev` on LOOK_BASE_URL).
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = 'docs/look';
const HARNESS = '/jobs/audit-doc-job?look=visit-notes';

// "Left to do" and "Parts needed next visit" stay empty so their prompts show in the frame.
const FILL = {
  done: 'Replaced the failed unit and tested the run.',
  parts_used: '1 unit, 3 m of 20 mm pipe, 4 saddles.',
  customer_wants: 'A quote for the upstairs run.',
};

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function openHarness(page) {
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
}

async function fillSections(page) {
  for (const [key, text] of Object.entries(FILL)) {
    await page.fill(`#job-visit-notes textarea[data-visit-section="${key}"]`, text);
  }
  // Blur so the frame shows the resting state, not a focused field.
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForTimeout(150);
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
    const cream = document.querySelector('.hub-jobs.ops-page');
    const paper = document.querySelector('.hub-jobs-document');
    const title = document.querySelector('#job-visit-notes .ops-section-title');
    const labels = [...document.querySelectorAll('#job-visit-notes .job-visit-section-field .job-visit-section-label')];
    const fields = [...document.querySelectorAll('#job-visit-notes textarea[data-visit-section]')];
    const rows = [...document.querySelectorAll('#job-visit-notes .job-visit-section-field')];
    const post = document.querySelector('#job-visit-notes .job-visit-post');
    const addPhotos = document.querySelector('#job-visit-notes .job-visit-photo-add');
    const wallLabels = [...document.querySelectorAll('#job-visit-notes .job-visit-body .job-visit-block .job-visit-section-label')];
    const firstBlock = document.querySelector('#job-visit-notes .job-visit-body .job-visit-block');
    const primary = document.querySelector('.hub-jobs-document .hub-jobs-tools .btn-primary');
    const inView = (el) => {
      const r = rect(el);
      return !!r && r.top >= 0 && r.bottom <= window.innerHeight;
    };
    return {
      view: `${window.innerWidth}x${window.innerHeight}`,
      cream: cs(cream)?.backgroundColor ?? null,
      paper: cs(paper)?.backgroundColor ?? null,
      paperShadow: cs(paper)?.boxShadow ?? null,
      paperWidth: paper ? Math.round(rect(paper).width) : null,
      title: title ? `${cs(title).fontFamily} ${cs(title).fontWeight} ${cs(title).fontSize}` : null,
      sectionLabels: labels.map(l => l.textContent),
      labelFont: labels[0] ? `${cs(labels[0]).fontFamily} ${cs(labels[0]).fontWeight} ${cs(labels[0]).fontSize} ${cs(labels[0]).textTransform}` : null,
      labelColors: labels.map(l => cs(l).color),
      fieldFont: fields[0] ? `${cs(fields[0]).fontFamily} ${cs(fields[0]).fontSize}` : null,
      fieldValues: fields.map(f => f.value),
      rowLine: rows[0] ? `${cs(rows[0]).borderBottomWidth} ${cs(rows[0]).borderBottomColor}` : null,
      rowDisplay: rows[0] ? cs(rows[0]).display : null,
      rowHeights: rows.map(r => Math.round(rect(r).height)),
      allSectionsInView: rows.every(inView),
      postText: post?.textContent ?? null,
      postDisabled: post?.disabled ?? null,
      postColor: cs(post)?.color ?? null,
      postH: post ? Math.round(rect(post).height) : null,
      postBg: cs(post)?.backgroundColor ?? null,
      addPhotosInView: inView(addPhotos),
      wallLabels: wallLabels.map(l => l.textContent),
      wallLabelColor: wallLabels[0] ? cs(wallLabels[0]).color : null,
      wallBlockDisplay: firstBlock ? cs(firstBlock).display : null,
      wallFirstBlockInView: inView(firstBlock),
      primaryH: primary ? Math.round(rect(primary).height) : null,
      primaryBg: cs(primary)?.backgroundColor ?? null,
    };
  });
}

// Composer frame: three sections typed, Post note live. Wall frame: a fresh tray at rest
// (Post note quiet) with the seeded multi-section note beneath the five prompts.
async function frame(context, label, anchor, out, { fill }) {
  const page = await context.newPage();
  await openHarness(page);
  if (fill) await fillSections(page);
  console.log(`${label} scroll`, await scrollTo(page, anchor));
  await page.waitForTimeout(200);
  console.log(label, await measure(page));
  await page.screenshot({ path: `${OUT}/${out}`, type: 'png' });
  await page.close();
}

const laptop = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
  locale: 'en-AU',
});
await frame(laptop, 'laptop composer', '#job-hours .ops-section-title', 'visit-guided-composer-laptop-1280.png', { fill: true });
await frame(laptop, 'laptop wall', '#job-hours .ops-section-title', 'visit-guided-note-wall-laptop-1280.png', { fill: false });
await laptop.close();

const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  locale: 'en-AU',
});
await frame(phone, 'phone composer', '#job-visit-notes', 'visit-guided-composer-phone-390.png', { fill: true });
await frame(phone, 'phone wall', '#job-visit-notes', 'visit-guided-note-wall-phone-390.png', { fill: false });
await phone.close();

await browser.close();
console.log('wrote visit guided composer LOOK frames');
