#!/usr/bin/env node
// Render the signed mockup HTML and the live P2 harness, then write composited
// side-by-sides from embedded PNG data. Nothing in the output loads over a URL.
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { measure, closeHarness, openState } from '../src/proof/p2Schedule/harness.ts';
import { MOCKUP_H1_LEFT, MOCKUP_SEARCH_TOL, MOCKUP_SEARCH_WIDTH, MOCKUP_TRAY_HEADING_H } from '../src/proof/p2Schedule/matrix.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.P2_R6_OUT || '/opt/cursor/artifacts/p2-r6';
const MOCKUP_URL = process.env.P2_MOCKUP_URL || 'http://127.0.0.1:8765/schedule-1280-light.html';
const MOCKUP_SRC = [
  join(OUT, 'mockup/schedule-1280-light.html'),
  '/opt/cursor/artifacts/p2-r5/mockup/schedule-1280-light.html',
  '/opt/cursor/artifacts/p2-r4/mockup/schedule-1280-light.html',
].find(p => existsSync(p));

const PAIRS = [
  { id: 'week-1280', state: 'week-1280', out: 'sbs-week-1280.png', live: 'live-week-1280.png', mock: 'mockup-week-1280.png', left: 'mockup 1280', right: 'head week 1280', crop: 'top' },
  { id: 'tray-1280', state: 'rail-1280', out: 'sbs-tray-1280.png', live: 'live-tray-1280.png', mock: 'mockup-tray-1280.png', left: 'mockup tray', right: 'head tray 1280', crop: 'tray' },
  { id: 'day-1280', state: 'day-1280', out: 'sbs-day-1280.png', live: 'live-day-1280.png', mock: 'mockup-week-1280.png', left: 'mockup week (no day paper)', right: 'head day 1280', crop: 'top' },
  { id: 'week-390', state: 'week-390', out: 'sbs-week-390.png', live: 'live-week-390.png', mock: 'mockup-week-1280.png', left: 'mockup 1280 (no 390 paper)', right: 'head week 390', crop: 'top' },
  { id: 'tray-390', state: 'tray-390', out: 'sbs-tray-390.png', live: 'live-tray-390.png', mock: 'mockup-tray-1280.png', left: 'mockup tray (no 390 paper)', right: 'head tray 390', crop: 'tray' },
  { id: 'edit-390', state: 'sheet-390', out: 'sbs-edit-390.png', live: 'live-edit-390.png', mock: 'mockup-week-1280.png', left: 'mockup 1280 (no sheet paper)', right: 'head edit 390', crop: 'top' },
];

const near = (a, b, tol = 1) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;
const px = (n) => (Number.isFinite(n) ? n.toFixed(2) : String(n));

function mockupProbe() {
  const vis = el => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const box = el => {
    if (!vis(el)) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
  };
  const lines = el => {
    if (!vis(el)) return 0;
    const lh = parseFloat(getComputedStyle(el).lineHeight);
    return lh ? Math.round(el.getBoundingClientRect().height / lh) : 0;
  };
  const head = document.querySelector('.s-head');
  const h1 = document.querySelector('.s-head .h1, .s-head h1');
  const eyebrow = document.querySelector('.s-head .eyebrow');
  const newJob = document.querySelector('.s-head .btn-primary');
  const tools = document.querySelector('.tools');
  const seg = document.querySelector('.segc');
  const navs = [...document.querySelectorAll('.wk .icon-btn')];
  const range = document.querySelector('.wk .lbl');
  const search = document.querySelector('.fld');
  const today = document.querySelector('.tools .btn-secondary');
  const board = document.querySelector('.board');
  const heads = [...document.querySelectorAll('.hd')];
  const line1 = document.querySelector('.bk .t');
  const title = [...document.querySelectorAll('.bk .ti')].find(el => (el.textContent ?? '').includes('Blocked sewer')) ?? document.querySelector('.bk .ti');
  const trayH = document.querySelector('.tray .h2');
  const trayRow = document.querySelector('.tray-row');
  const crew = document.querySelector('.lane .nm');
  const crewHead = heads[0];
  const toolsPadRight = tools ? parseFloat(getComputedStyle(tools).paddingRight) || 0 : 0;
  return {
    headerLeft: head?.getBoundingClientRect().left ?? -1,
    headerPadLeft: head ? parseFloat(getComputedStyle(head).paddingLeft) || 0 : 0,
    h1Left: h1?.getBoundingClientRect().left ?? -1,
    eyebrowLeft: eyebrow?.getBoundingClientRect().left ?? -1,
    h1ParentLeft: (h1?.parentElement ?? head)?.getBoundingClientRect().left ?? -1,
    newJobLeft: newJob?.getBoundingClientRect().left ?? -1,
    headerBox: box(head),
    newJobBox: box(newJob),
    segBox: box(seg),
    navBoxes: navs.map(box).filter(Boolean),
    range: (range?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    rangeBox: box(range),
    searchWidth: search?.getBoundingClientRect().width ?? 0,
    searchBox: box(search),
    todayBox: box(today),
    todayRight: today?.getBoundingClientRect().right ?? -1,
    toolbarRight: tools ? tools.getBoundingClientRect().right - toolsPadRight : -1,
    toolbarBottom: tools?.getBoundingClientRect().bottom ?? -1,
    boardTop: board?.getBoundingClientRect().top ?? -1,
    crewToolbarShown: vis(crewHead) && (crewHead.textContent ?? '').trim() === 'Crew' && crewHead.closest('.tools') ? 1 : 0,
    crewColHead: (crewHead?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    dayHeadText: heads.map(el => (el.textContent ?? '').replace(/\s+/g, ' ').trim()),
    dayHeadBox: box(heads[1] ?? heads[0]),
    dayHeadLines: lines(heads[1] ?? heads[0]),
    line1: (line1?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    line1Box: box(line1),
    titleLines: lines(title),
    titleBox: box(title),
    titleText: (title?.textContent ?? '').trim(),
    trayHeadingH: trayH?.getBoundingClientRect().height ?? 0,
    trayHeadingText: (trayH?.textContent ?? '').trim(),
    trayCols: trayRow ? getComputedStyle(trayRow).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
    crewLines: lines(crew),
    crewText: (crew?.textContent ?? '').trim(),
    crewBox: box(crew),
    ink: getComputedStyle(document.body).color,
    pageBg: getComputedStyle(document.body).backgroundColor,
  };
}

async function compose(page, leftBuf, rightBuf, leftLabel, rightLabel, dest) {
  const html = `<!doctype html>
<meta charset="utf-8">
<canvas id="c"></canvas>
<script type="module">
  const left = new Image();
  const right = new Image();
  left.src = 'data:image/png;base64,${leftBuf.toString('base64')}';
  right.src = 'data:image/png;base64,${rightBuf.toString('base64')}';
  await Promise.all([left.decode(), right.decode()]);
  const cap = 28;
  const gap = 16;
  const pad = 16;
  const cell = 640;
  const scale = (img) => {
    const s = Math.min(cell / img.width, cell / img.height, 1);
    return { w: Math.round(img.width * s), h: Math.round(img.height * s) };
  };
  const L = scale(left);
  const R = scale(right);
  const c = document.getElementById('c');
  c.width = pad * 2 + L.w + gap + R.w;
  c.height = pad * 2 + cap + Math.max(L.h, R.h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#E8E4D8';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#0A2540';
  ctx.font = '600 13px ui-sans-serif, system-ui';
  ctx.fillText(${JSON.stringify(leftLabel)}, pad, pad + 16);
  ctx.fillText(${JSON.stringify(rightLabel)}, pad + L.w + gap, pad + 16);
  ctx.fillStyle = '#FFFDF8';
  ctx.fillRect(pad, pad + cap, L.w, L.h);
  ctx.fillRect(pad + L.w + gap, pad + cap, R.w, R.h);
  ctx.drawImage(left, pad, pad + cap, L.w, L.h);
  ctx.drawImage(right, pad + L.w + gap, pad + cap, R.w, R.h);
  window.__ready = { w: c.width, h: c.height, left: left.naturalWidth, right: right.naturalWidth };
</script>`;
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__ready && window.__ready.left > 10 && window.__ready.right > 10);
  const info = await page.evaluate(() => window.__ready);
  await page.setViewportSize({ width: Math.ceil(info.w), height: Math.ceil(info.h) });
  await page.locator('#c').screenshot({ path: dest, type: 'png' });
  const paint = await page.evaluate(() => {
    const c = document.getElementById('c');
    const ctx = c.getContext('2d');
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const ink = (x0, y0, x1, y1) => {
      let n = 0;
      for (let y = y0; y < y1; y += 3) {
        for (let x = x0; x < x1; x += 3) {
          const i = (y * img.width + x) * 4;
          if (Math.hypot(img.data[i] - 232, img.data[i + 1] - 228, img.data[i + 2] - 216) > 18) n += 1;
        }
      }
      return n;
    };
    const pad = 16;
    const cap = 28;
    const gap = 16;
    const mid = pad + Math.round((c.width - pad * 2 - gap) / 2);
    return {
      leftInk: ink(pad, pad + cap, mid, c.height - pad),
      rightInk: ink(mid + gap, pad + cap, c.width - pad, c.height - pad),
      w: c.width,
      h: c.height,
    };
  });
  if (paint.leftInk < 80 || paint.rightInk < 80) {
    throw new Error(`empty SBS panel ${dest} leftInk=${paint.leftInk} rightInk=${paint.rightInk}`);
  }
  return { ...info, ...paint };
}

async function painted(page, png, box) {
  if (!box) return { painted: 0, cornerCut: false };
  return page.evaluate(async ([b64, box]) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const pxAt = (x, y) => {
      const i = (y * img.width + x) * 4;
      return [img.data[i], img.data[i + 1], img.data[i + 2]];
    };
    const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const x0 = Math.max(1, Math.round(box.x));
    const y0 = Math.max(1, Math.round(box.y));
    const x1 = Math.min(img.width - 2, Math.round(box.x + box.w) - 1);
    if (x1 - x0 < 6) return { painted: 0, cornerCut: false };
    let paintedN = 0;
    const steps = Math.max(6, Math.floor((x1 - x0) / 4));
    for (let i = 1; i < steps; i += 1) {
      const x = x0 + Math.round(((x1 - x0) * i) / steps);
      if (gap(pxAt(x, y0 + 1), pxAt(x, y0 + 5)) >= 18) paintedN += 1;
    }
    const mid = pxAt(Math.round((x0 + x1) / 2), y0 + 1);
    const corner = pxAt(x0 + 1, y0 + 1);
    return { painted: paintedN, cornerCut: gap(corner, mid) >= 18 };
  }, [png.toString('base64'), box]);
}

mkdirSync(OUT, { recursive: true });
if (!MOCKUP_SRC) throw new Error('missing mockup schedule-1280-light.html');
mkdirSync(join(OUT, 'mockup'), { recursive: true });
const MOCKUP = join(OUT, 'mockup/schedule-1280-light.html');
if (MOCKUP_SRC !== MOCKUP) copyFileSync(MOCKUP_SRC, MOCKUP);

const browser = await chromium.launch({
  executablePath: ['/usr/local/bin/google-chrome', '/usr/bin/google-chrome'].find(p => existsSync(p)),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
});
const mockPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await mockPage.goto(MOCKUP_URL, { waitUntil: 'networkidle' });
await mockPage.waitForSelector('.s-head');
const mockProbe = await mockPage.evaluate(mockupProbe);
const mockFull = await mockPage.screenshot({ path: join(OUT, 'mockup-full-1280.png'), fullPage: true, type: 'png' });
const mockTop = await mockPage.screenshot({ path: join(OUT, 'mockup-week-1280.png'), type: 'png' });
await mockPage.locator('.tray').scrollIntoViewIfNeeded();
const mockTray = await mockPage.screenshot({ path: join(OUT, 'mockup-tray-1280.png'), type: 'png' });
const mockPaint = {
  seg: await painted(mockPage, mockTop, mockProbe.segBox),
  today: await painted(mockPage, mockTop, mockProbe.todayBox),
  nav: await painted(mockPage, mockTop, mockProbe.navBoxes[0]),
};

const live = {};
for (const pair of PAIRS) {
  const m = await measure(pair.state);
  const buf = m.png.top;
  writeFileSync(join(OUT, pair.live), buf);
  live[pair.id] = m;
}

const composePage = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const paintedInfo = [];
for (const pair of PAIRS) {
  const leftPath = join(OUT, pair.mock);
  const rightPath = join(OUT, pair.live);
  const info = await compose(
    composePage,
    readFileSync(leftPath),
    readFileSync(rightPath),
    pair.left,
    pair.right,
    join(OUT, pair.out),
  );
  paintedInfo.push({ id: pair.id, path: join(OUT, pair.out), ...info });
  console.log(join(OUT, pair.out), info);
}

const OVERFLOW_STATES = [
  'week-375', 'week-390', 'week-768', 'week-1024', 'week-1280',
  'day-375', 'day-390', 'day-768', 'day-1024', 'day-1280',
  'tray-375', 'tray-390', 'tray-768', 'rail-1024', 'rail-1280',
  'edit-375', 'sheet-390', 'edit-768', 'edit-1024', 'edit-1280',
];
const overflow = [];
for (const id of OVERFLOW_STATES) {
  const opened = await openState(id);
  const box = await opened.page.evaluate(() => window.__p2.measureDom());
  const png = await opened.page.screenshot({ animations: 'disabled', caret: 'hide', type: 'png' });
  await opened.close();
  overflow.push({
    id,
    iw: box.iw,
    docSW: box.docSW,
    bodySW: box.bodySW,
    maxRight: box.maxRight,
    maxEl: box.maxEl,
  });
  writeFileSync(join(OUT, `overflow-${id}.png`), png);
}

async function cardCloseup(state, dest) {
  const opened = await openState(state);
  const probe = await opened.page.evaluate(() => {
    const vis = (node) => {
      const r = node.getBoundingClientRect();
      const s = getComputedStyle(node);
      return r.width > 8 && r.height > 8 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.right > 0;
    };
    const el = [...document.querySelectorAll('[data-week-chip="aaaaaaaa-0061-4000-8000-000000000061"], [data-schedule-job="aaaaaaaa-0061-4000-8000-000000000061"]')]
      .find(vis) ?? null;
    if (el) el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const card = el && vis(el) ? el : [...document.querySelectorAll('[data-week-chip="aaaaaaaa-0061-4000-8000-000000000061"], [data-schedule-job="aaaaaaaa-0061-4000-8000-000000000061"]')].find(vis) ?? null;
    const clock = card?.querySelector('.hub-week-chip-clock, .hub-week-agenda-time');
    const cardR = card?.getBoundingClientRect();
    const textR = clock?.getBoundingClientRect();
    return {
      found: !!card,
      clock: (clock?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      x: cardR?.x ?? -1,
      y: cardR?.y ?? -1,
      w: cardR?.width ?? 0,
      h: cardR?.height ?? 0,
      cardRight: cardR?.right ?? -1,
      textRight: textR?.right ?? -1,
      fits: !!cardR && !!textR && textR.right <= cardR.right + 0.5,
    };
  });
  if (!probe.found || probe.w < 8) throw new Error(`#0061 card missing on ${state}`);
  const pad = 12;
  const vw = opened.page.viewportSize().width;
  const vh = opened.page.viewportSize().height;
  await opened.page.screenshot({
    path: dest,
    type: 'png',
    clip: {
      x: Math.max(0, probe.x - pad),
      y: Math.max(0, probe.y - pad),
      width: Math.min(vw, probe.w + pad * 2),
      height: Math.min(vh, probe.h + pad * 2),
    },
  });
  await opened.close();
  return probe;
}

const closeups = {
  '1280': await cardCloseup('week-1280', join(OUT, 'card-0061-1280.png')),
  '390': await cardCloseup('week-390', join(OUT, 'card-0061-390.png')),
};

const week = live['week-1280'].chrome;
const rail = live['tray-1280'].chrome;
const day = live['day-1280'].chrome;
const phone = live['week-390'].chrome;
const searchW = week.searchWidth;
const searchDelta = Math.abs(searchW - mockProbe.searchWidth);
const todayFlush = Math.abs(week.todayRight - week.toolbarRight);
const toolsGap = Math.abs(week.toolbarBottom - week.boardTop);
const trayH = rail.trayHeadingH;

const rows = [
  ['Schedule h1 absolute x (±1)', '.s-head .h1 over http', '.ops-page-title',
    `h1.left ${px(mockProbe.h1Left)} parent ${px(mockProbe.h1ParentLeft)} (.s-head left ${px(mockProbe.headerLeft)} pad ${px(mockProbe.headerPadLeft)})`,
    `h1.left ${px(week.h1Left)} parent ${px(week.h1ParentLeft)} (page left ${px(week.pageLeft)} pad ${px(week.pagePadLeft)})`,
    near(mockProbe.h1Left, MOCKUP_H1_LEFT, 1) && near(week.h1Left, MOCKUP_H1_LEFT, 1) ? 'MATCH' : 'MISMATCH'],
  ['eyebrow absolute x (±1)', '.s-head .eyebrow over http', '[data-schedule-eyebrow]',
    `eyebrow.left ${px(mockProbe.eyebrowLeft)}`,
    `eyebrow.left ${px(week.eyebrowLeft)}`,
    near(mockProbe.eyebrowLeft, MOCKUP_H1_LEFT, 1) && near(week.eyebrowLeft, MOCKUP_H1_LEFT, 1) ? 'MATCH' : 'MISMATCH'],
  ['header left, New job right', '.s-head / .s-head .btn-primary', '.ops-page-head / New job button',
    `headerLeft ${px(mockProbe.headerLeft)} < newJob ${px(mockProbe.newJobLeft)}`,
    `headerLeft ${px(week.headerLeft)} < newJob ${px(week.newJobLeft)}`,
    mockProbe.headerLeft < mockProbe.newJobLeft && week.headerLeft < week.newJobLeft ? 'MATCH' : 'MISMATCH'],
  ['toolbar order Week/Day · ‹ range › · search flex:1 · Today flush right', '.tools :40', '.hub-week-track',
    `search ${px(mockProbe.searchWidth)} Today.right ${px(mockProbe.todayRight)} == tools.innerRight ${px(mockProbe.toolbarRight)}`,
    `search ${px(searchW)} Today.right ${px(week.todayRight)} toolbar.right ${px(week.toolbarRight)} crewToolbar=${week.crewToolbarShown}`,
    searchDelta <= MOCKUP_SEARCH_TOL && todayFlush <= 1 && week.crewToolbarShown === 0 ? 'MATCH' : 'MISMATCH'],
  ['search width vs mockup fld (521 is MISMATCH)', '.fld', '.hub-week-search',
    `${px(mockProbe.searchWidth)} (signed ${MOCKUP_SEARCH_WIDTH})`,
    `${px(searchW)} Δ ${px(searchDelta)}`,
    searchDelta <= MOCKUP_SEARCH_TOL ? 'MATCH' : 'MISMATCH'],
  ['Today.right == toolbar.right', '.tools .btn-secondary', '.hub-week-today / .hub-week-track',
    `${px(mockProbe.todayRight)} == ${px(mockProbe.toolbarRight)}`,
    `${px(week.todayRight)} == ${px(week.toolbarRight)} Δ ${px(todayFlush)}`,
    todayFlush <= 1 ? 'MATCH' : 'MISMATCH'],
  ['Crew is board column header only, not toolbar', '.hd first = Crew', '.hub-week-track .hub-schedule-crew-filter',
    `col head "${mockProbe.crewColHead}" on toolbar=${mockProbe.crewToolbarShown}`,
    `crewToolbarShown ${week.crewToolbarShown}`,
    week.crewToolbarShown === 0 ? 'MATCH' : 'MISMATCH'],
  ['no Quick book row: toolbar.bottom == board.top', '.tools + .board', '.hub-week-track + board',
    `tools.bottom ${px(mockProbe.toolbarBottom)} board.top ${px(mockProbe.boardTop)} Δ ${px(Math.abs(mockProbe.toolbarBottom - mockProbe.boardTop))}`,
    `toolbar.bottom ${px(week.toolbarBottom)} board.top ${px(week.boardTop)} Δ ${px(toolsGap)}`,
    toolsGap <= 1 ? 'MATCH' : 'MISMATCH'],
  ['pill seg painted stroke + radius', '.segc', '.hub-week-seg',
    `painted ${mockPaint.seg.painted} cornerCut ${mockPaint.seg.cornerCut}`,
    `painted ${week.segPainted} cornerCut ${week.segCornerCut}`,
    week.segPainted >= 4 && week.segCornerCut ? 'MATCH' : 'MISMATCH'],
  ['boxed ‹ ›', '.wk .icon-btn', '.hub-week-nav-box',
    `n=${mockProbe.navBoxes.length} painted ${mockPaint.nav.painted}`,
    `n=${week.navBoxes.length} painted ${week.navPainted} cornerCut ${week.navCornerCut}`,
    week.navPainted >= 4 && week.navCornerCut ? 'MATCH' : 'MISMATCH'],
  ['range 19 to 25 Oct', '.wk .lbl', '.hub-week-range-full',
    mockProbe.range, week.range, mockProbe.range === week.range ? 'MATCH' : 'MISMATCH'],
  ['outlined Today', '.tools .btn-secondary', '.hub-week-today',
    `painted ${mockPaint.today.painted} cornerCut ${mockPaint.today.cornerCut}`,
    `painted ${week.todayPainted} cornerCut ${week.todayCornerCut}`,
    week.todayPainted >= 4 && week.todayCornerCut ? 'MATCH' : 'MISMATCH'],
  ['day heads one left line Mon 19', '.hd', '.hub-week-head / .hub-week-head-short',
    `${mockProbe.dayHeadText[1] ?? mockProbe.dayHeadText[0]} lines=${mockProbe.dayHeadLines}`,
    `${week.dayHeadText[0]} short=${week.dayHeadShortShown} lines=${week.dayHeadLines}`,
    week.dayHeadShortShown === 7 && week.dayHeadLines <= 1 && week.dayHeadText.some(t => /Mon\s*19/.test(t) && !/Oct/.test(t)) ? 'MATCH' : 'MISMATCH'],
  ['card line 1', '.bk .t', '.hub-week-chip-line1',
    mockProbe.line1, week.line1_0036,
    mockProbe.line1 === week.line1_0036 ? 'MATCH' : 'MISMATCH'],
  ['titles wrap to 2 lines (rect/lh)', '.bk .ti', '.hub-week-chip-desc',
    `${mockProbe.titleText} lines=${mockProbe.titleLines}`,
    `lines=${week.titleLines}`,
    week.titleLines === 2 ? 'MATCH' : 'MISMATCH'],
  ['tray heading height vs measured mockup over http', '.tray .h2 over http', '.ops-card-kicker',
    `${mockProbe.trayHeadingText} h=${px(mockProbe.trayHeadingH)} (signed ${MOCKUP_TRAY_HEADING_H})`,
    `${rail.trayHeadingText} h=${px(trayH)} cols=${rail.trayCols}`,
    rail.trayHeadingText === 'Unscheduled' && near(trayH, mockProbe.trayHeadingH, 1) && near(trayH, MOCKUP_TRAY_HEADING_H, 1) && rail.trayCols === 3 ? 'MATCH' : 'MISMATCH'],
  ['#0061 clock stays inside the Mon card', '.bk overflow:hidden', '.hub-week-chip-clock / .hub-week-agenda-time',
    'mockup .bk clips card copy',
    `1280 "${closeups['1280'].clock}" fits=${closeups['1280'].fits} textR ${px(closeups['1280'].textRight)} cardR ${px(closeups['1280'].cardRight)}; 390 "${closeups['390'].clock}" fits=${closeups['390'].fits} textR ${px(closeups['390'].textRight)} cardR ${px(closeups['390'].cardRight)}`,
    closeups['1280'].fits && closeups['390'].fits ? 'MATCH' : 'MISMATCH'],
  ['day untimed does not span track', '(no day mockup)', '[data-untimed-chip] vs .hub-day-track',
    'derived',
    `${px(day.dayUntimedWidth)} / ${px(day.dayTrackWidth)}`,
    day.dayUntimedWidth > 0 && day.dayUntimedWidth < day.dayTrackWidth * 0.55 ? 'MATCH' : 'MISMATCH'],
  ['crew names one-line rect', '.lane .nm', '.hub-schedule-crew-name',
    `${mockProbe.crewText} lines=${mockProbe.crewLines}`,
    `week=${week.weekCrewLines} day=${day.dayCrewLines}`,
    week.weekCrewLines === 1 && day.dayCrewLines === 1 ? 'MATCH' : 'MISMATCH'],
  ['390 header not clipped', '(no 390 mockup)', '.ops-page-head',
    'no 390 paper',
    `headerTop ${px(phone.headerTop)}`,
    'head-only'],
  ['390 Today sits with the range (overflow/kills still apply)', '(no 390 mockup)', '.hub-week-today',
    'no 390 paper',
    `Δ ${px(Math.abs(phone.todayTop - phone.rangeTop))} sameRow ${phone.sameRangeRow}`,
    'head-only'],
  ['390 no extra Quick book row under the toolbar', '(no 390 mockup)', '[data-schedule-section=quickbook]',
    'no 390 paper',
    `quick ${px(phone.quickBookTop)} range ${px(phone.rangeTop)}`,
    'head-only'],
];

const md = [
  '# Item 8 — mockup vs head (r6)',
  '',
  'Mockup rendered from `schedule-1280-light.html` at 1280 in Chromium. Live frames from the P2 harness on the built dist. Side-by-sides are composited from embedded PNG data.',
  '',
  'Verdicts: MATCH only when rects sit within ±1px (search ±2 of the measured mockup fld) and colours are exact. Approximate is MISMATCH. 390 rows are head-only — there is no 390 Schedule mockup.',
  '',
  '| Point | mockup selector | head selector | mockup | head | verdict |',
  '|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r[0]} | \`${r[1]}\` | \`${r[2]}\` | ${r[3]} | ${r[4]} | **${r[5]}** |`),
  '',
  '## Frames',
  ...PAIRS.map(p => `- \`/opt/cursor/artifacts/p2-r6/${p.out}\``),
  '- `/opt/cursor/artifacts/p2-r6/card-0061-1280.png`',
  '- `/opt/cursor/artifacts/p2-r6/card-0061-390.png`',
  '',
  '## Compose proof',
  ...paintedInfo.map(p => `- ${p.path} leftPx=${p.left} rightPx=${p.right} leftInk=${p.leftInk} rightInk=${p.rightInk}`),
  '',
  '## Overflow (view + edit)',
  '',
  '| state | iw | docSW | bodySW | maxRight | maxEl |',
  '|---|---:|---:|---:|---:|---|',
  ...overflow.map(o => `| ${o.id} | ${o.iw} | ${o.docSW} | ${o.bodySW} | ${o.maxRight} | ${o.maxEl ?? ''} |`),
  '',
];
writeFileSync(join(OUT, 'item8-checklist.md'), md.join('\n'));
writeFileSync(join(OUT, 'item8-measure.json'), `${JSON.stringify({ mockProbe, mockPaint, week, rail, day, phone, paintedInfo, overflow }, null, 2)}\n`);
writeFileSync(join(OUT, 'overflow.md'), [
  '# Overflow r6',
  '',
  '| state | iw | docSW | bodySW | maxRight | maxEl |',
  '|---|---:|---:|---:|---:|---|',
  ...overflow.map(o => `| ${o.id} | ${o.iw} | ${o.docSW} | ${o.bodySW} | ${o.maxRight} | ${o.maxEl ?? ''} |`),
  '',
].join('\n'));
await closeHarness();
await browser.close();
console.log(md.join('\n'));
