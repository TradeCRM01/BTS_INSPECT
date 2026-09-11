// LOOK frames for the Job notes & photos field flow on the job sheet.
// Opens the DEV look harness (/jobs/audit-doc-job?look=visit-notes) at laptop 1280 and phone 390,
// measures the New update tab against the paper kit, and fails on any drift.
// Run: node scripts/capture-job-notes-photos-look.mjs (needs `npm run dev` on LOOK_BASE_URL).
// Set LOOK_FILLED_DIR to also write the filled state (photos attached, sentence typed, All done) there.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = 'docs/look';
const FILLED_DIR = process.env.LOOK_FILLED_DIR || null;
const HARNESS = '/jobs/audit-doc-job?look=visit-notes';
const PHOTOS = ['public/look/photos/site-switchboard.jpg', 'public/look/photos/site-wall-cavity.jpg'];

const SHEET = 'rgb(255, 253, 248)';
const INK = 'rgb(10, 37, 64)';
const MUTED = 'rgb(91, 107, 124)';
const LINE = 'rgb(226, 217, 204)';
const ACTION = 'rgb(46, 117, 182)';

mkdirSync(OUT, { recursive: true });
if (FILLED_DIR) mkdirSync(FILLED_DIR, { recursive: true });

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

// LOOK_BROWSER_CHANNEL=chrome runs on an installed Google Chrome when the bundled Chromium is absent.
const browser = await chromium.launch({ headless: true, channel: process.env.LOOK_BROWSER_CHANNEL || undefined });

async function openHarness(page) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto(`${BASE}${HARNESS}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#job-visit-notes .job-notes-compose', { timeout: 20000 });
  await page.waitForFunction(() => {
    const tray = document.querySelector('#job-visit-notes');
    return tray?.textContent?.includes('Job notes & photos')
      && tray?.querySelector('.job-notes-tab-count')?.textContent === '3';
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  return pageErrors;
}

// Leaves the title clear of the sticky nav with a little paper above it, like the earlier frames.
async function scrollTo(page, selector, offset = 88) {
  return page.evaluate(([sel, off]) => {
    const target = document.querySelector(sel);
    if (!target) return { ok: false };
    target.scrollIntoView({ block: 'start', inline: 'nearest' });
    let scroller = target.parentElement;
    while (scroller && !(scroller.scrollHeight > scroller.clientHeight && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) {
      scroller = scroller.parentElement;
    }
    if (scroller) scroller.scrollTop -= off;
    else window.scrollBy(0, -off);
    return { ok: true, top: Math.round(target.getBoundingClientRect().top), scroller: scroller?.className ?? 'window' };
  }, [selector, offset]);
}

async function measure(page) {
  return page.evaluate(() => {
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const rect = (el) => (el ? el.getBoundingClientRect() : null);
    const tray = document.querySelector('#job-visit-notes');
    const title = tray.querySelector('.ops-section-title');
    const tabs = [...tray.querySelectorAll('.job-notes-tab')];
    const selected = tabs.find(tab => tab.getAttribute('aria-selected') === 'true');
    const compose = tray.querySelector('.job-notes-compose');
    const primary = tray.querySelector('.job-notes-primary');
    const post = tray.querySelector('.job-notes-post');
    const field = tray.querySelector('textarea[data-visit-section="done"]');
    const choices = [...tray.querySelectorAll('.job-notes-choice-btn')];
    const more = tray.querySelector('.job-notes-more');
    const filled = [...tray.querySelectorAll('.is-filled')];
    const visibleTextareas = [...tray.querySelectorAll('textarea')].filter(el => el.checkVisibility());
    const steps = [...compose.querySelectorAll('.job-notes-step-title, legend')].map(el => el.textContent.trim());
    const stepTops = [...compose.querySelectorAll('[data-step]')].map(el => Math.round(rect(el).top));
    const inView = (el) => {
      const r = rect(el);
      return !!r && r.top >= 0 && r.bottom <= window.innerHeight;
    };
    return {
      view: `${window.innerWidth}x${window.innerHeight}`,
      title: title?.textContent?.trim() ?? null,
      titleFont: title ? `${cs(title).fontFamily} ${cs(title).fontWeight} ${cs(title).fontSize}` : null,
      tabs: tabs.map(tab => tab.textContent.trim()),
      selectedTab: selected?.dataset.tab ?? null,
      selectedColor: selected ? cs(selected).color : null,
      steps,
      stepOrderTopToBottom: stepTops.every((top, i) => i === 0 || top >= stepTops[i - 1]),
      composeWidth: Math.round(rect(compose).width),
      trayWidth: Math.round(rect(tray).width),
      primary: primary ? {
        text: primary.textContent.trim(),
        h: Math.round(rect(primary).height),
        w: Math.round(rect(primary).width),
        bg: cs(primary).backgroundColor,
        color: cs(primary).color,
        radius: cs(primary).borderTopLeftRadius,
        font: `${cs(primary).fontFamily} ${cs(primary).fontWeight} ${cs(primary).fontSize}`,
        inView: inView(primary),
      } : null,
      post: post ? {
        text: post.textContent.trim(),
        h: Math.round(rect(post).height),
        bg: cs(post).backgroundColor,
        color: cs(post).color,
        disabled: post.disabled,
        filled: post.classList.contains('is-filled'),
      } : null,
      filledCount: filled.length,
      field: field ? {
        h: Math.round(rect(field).height),
        bg: cs(field).backgroundColor,
        border: cs(field).borderTopColor,
        radius: cs(field).borderTopLeftRadius,
        fontSize: cs(field).fontSize,
        placeholder: field.placeholder,
      } : null,
      visibleTextareas: visibleTextareas.length,
      choices: choices.map(btn => ({
        text: btn.textContent.trim(),
        h: Math.round(rect(btn).height),
        pressed: btn.getAttribute('aria-pressed'),
        border: cs(btn).borderTopColor,
        bg: cs(btn).backgroundColor,
      })),
      moreOpen: more ? more.open : null,
      moreText: more?.querySelector('summary')?.textContent?.trim() ?? null,
      photoCount: tray.querySelector('.job-visit-photo-count')?.textContent?.trim() ?? null,
      stamp: tray.querySelector('.job-notes-stamp-text')?.textContent?.trim() ?? null,
      teamOnly: tray.querySelector('.job-notes-team-only')?.textContent?.trim() ?? null,
      trayBg: cs(tray).backgroundColor,
      trayBorder: cs(tray).borderTopWidth,
      trayHairline: cs(tray).borderBottom,
      sheetPrimary: document.querySelector('.hub-jobs-document .hub-jobs-tools .btn-primary'),
      arrivingH: Math.round(rect(document.querySelector('.hub-jobs-document .hub-jobs-tools .btn-primary'))?.height ?? 0),
      arrivingBg: cs(document.querySelector('.hub-jobs-document .hub-jobs-tools .btn-primary'))?.backgroundColor ?? null,
    };
  });
}

function checkFresh(label, m) {
  assert(m.title === 'Job notes & photos', `${label}: title ${m.title}`);
  assert(m.titleFont.includes('Rajdhani') && m.titleFont.includes(' 700 '), `${label}: title font ${m.titleFont}`);
  assert(JSON.stringify(m.tabs) === JSON.stringify(['New update', 'History3']), `${label}: tabs ${JSON.stringify(m.tabs)}`);
  assert(m.selectedTab === 'new', `${label}: selected tab ${m.selectedTab}`);
  assert(m.selectedColor === INK, `${label}: selected tab color ${m.selectedColor}`);
  assert(
    JSON.stringify(m.steps) === JSON.stringify(['Show the finished work', 'What did you do?', 'Anything left to do?']),
    `${label}: steps ${JSON.stringify(m.steps)}`,
  );
  assert(m.stepOrderTopToBottom, `${label}: steps out of order`);
  assert(m.composeWidth <= m.trayWidth, `${label}: compose ${m.composeWidth} overflows tray ${m.trayWidth}`);
  assert(m.primary.text === 'Take photos', `${label}: primary text ${m.primary.text}`);
  assert(m.primary.h === 44, `${label}: primary height ${m.primary.h}`);
  assert(m.primary.bg === ACTION, `${label}: primary bg ${m.primary.bg}`);
  assert(m.primary.color === 'rgb(255, 255, 255)', `${label}: primary color ${m.primary.color}`);
  assert(m.primary.radius === '10px', `${label}: primary radius ${m.primary.radius}`);
  assert(m.primary.font.includes('Source Sans 3') && m.primary.font.includes(' 600 '), `${label}: primary font ${m.primary.font}`);
  assert(m.primary.inView, `${label}: Take photos not in view`);
  assert(m.filledCount === 1, `${label}: ${m.filledCount} filled controls, expected 1`);
  assert(m.post.text === 'Post update' && m.post.disabled && !m.post.filled, `${label}: post ${JSON.stringify(m.post)}`);
  assert(m.post.h === 44, `${label}: post height ${m.post.h}`);
  assert(m.post.bg === SHEET && m.post.color === MUTED, `${label}: disabled post ${m.post.bg} ${m.post.color}`);
  assert(m.field.bg === SHEET && m.field.border === LINE && m.field.radius === '10px', `${label}: field ${JSON.stringify(m.field)}`);
  assert(m.field.placeholder === 'e.g. Fitted the new unit, tested it and tidied up.', `${label}: placeholder ${m.field.placeholder}`);
  assert(m.visibleTextareas === 1, `${label}: ${m.visibleTextareas} textareas visible, expected 1`);
  assert(m.choices.length === 2 && m.choices.every(c => c.h === 44 && c.pressed === 'false' && c.border === LINE), `${label}: choices ${JSON.stringify(m.choices)}`);
  assert(m.moreOpen === false && m.moreText.startsWith('Parts used & customer requests'), `${label}: more ${m.moreOpen} ${m.moreText}`);
  assert(m.photoCount === '0 photos', `${label}: photo count ${m.photoCount}`);
  assert(m.stamp.endsWith('· name & time added for you'), `${label}: stamp ${m.stamp}`);
  assert(m.teamOnly === 'Team only · not sent to the customer', `${label}: team only ${m.teamOnly}`);
  assert(m.trayBg === 'rgba(0, 0, 0, 0)' && m.trayBorder === '0px', `${label}: tray is a second card ${m.trayBg} ${m.trayBorder}`);
  assert(m.trayHairline === `1px solid ${LINE}`, `${label}: tray hairline ${m.trayHairline}`);
  assert(m.arrivingH === 44 && m.arrivingBg === ACTION, `${label}: Arriving shortly ${m.arrivingH} ${m.arrivingBg}`);
}

function checkFilled(label, m) {
  assert(m.photoCount === '2 photos', `${label}: filled photo count ${m.photoCount}`);
  assert(m.primary.text === 'Take more photos' && m.primary.bg === SHEET, `${label}: filled primary ${JSON.stringify(m.primary)}`);
  assert(m.post.filled && !m.post.disabled && m.post.bg === ACTION, `${label}: filled post ${JSON.stringify(m.post)}`);
  assert(m.filledCount === 1, `${label}: ${m.filledCount} filled controls in filled state`);
  assert(m.choices[0].pressed === 'true' && m.choices[0].border === INK, `${label}: All done not pressed ${JSON.stringify(m.choices)}`);
  assert(m.visibleTextareas === 1, `${label}: ${m.visibleTextareas} textareas visible with All done`);
}

async function frame(context, label, viewport, offset) {
  const page = await context.newPage();
  const pageErrors = await openHarness(page);
  console.log(`${label} scroll`, await scrollTo(page, '#job-visit-notes .ops-section-title', offset));
  await page.waitForTimeout(200);
  const fresh = await measure(page);
  console.log(label, fresh);
  await page.screenshot({ path: `${OUT}/job-notes-photos-${viewport}.png`, type: 'png' });
  checkFresh(label, fresh);

  if (FILLED_DIR) {
    await page.setInputFiles('#job-visit-photo-input', PHOTOS);
    await page.waitForFunction(() => document.querySelector('#job-visit-notes .job-visit-photo-count')?.textContent === '2 photos');
    await page.fill('#job-visit-notes textarea[data-visit-section="done"]', 'Fitted the new unit, tested it and tidied up.');
    await page.click('#job-visit-notes [data-outcome="all_done"]');
    await page.waitForTimeout(200);
    console.log(`${label} filled scroll`, await scrollTo(page, '#job-visit-notes .ops-section-title', offset));
    await page.waitForTimeout(200);
    const filled = await measure(page);
    console.log(`${label} filled`, filled);
    await page.screenshot({ path: `${FILLED_DIR}/job-notes-photos-filled-${viewport}.png`, type: 'png' });
    checkFilled(label, filled);

    await page.click('#job-visit-notes [data-tab="history"]');
    await page.waitForSelector('#job-visit-notes .job-visit-log .job-visit-row');
    await scrollTo(page, '#job-visit-notes .ops-section-title', offset);
    await page.waitForTimeout(200);
    const rows = await page.$$eval('#job-visit-notes .job-visit-row', els => els.length);
    assert(rows === 3, `${label}: history shows ${rows} cards, expected 3`);
    await page.screenshot({ path: `${FILLED_DIR}/job-notes-photos-history-${viewport}.png`, type: 'png' });
  }

  await page.close();
  assert(pageErrors.length === 0, `${label}: page errors ${JSON.stringify(pageErrors)}`);
}

const laptop = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
  locale: 'en-AU',
});
await frame(laptop, 'laptop', 'laptop-1280', 88);
await laptop.close();

const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  locale: 'en-AU',
});
await frame(phone, 'phone', 'phone-390', 40);
await phone.close();

await browser.close();
console.log('wrote Job notes & photos LOOK frames');
