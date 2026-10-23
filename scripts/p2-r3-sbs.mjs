#!/usr/bin/env node
// Compose item-8 side-by-sides into /opt/cursor/artifacts/p2-r3/.
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.P2_R3_OUT || '/opt/cursor/artifacts/p2-r3';
const SRC = process.env.P2_CAPTURE_DIR || '/tmp/p2-r3-frames';
const MOCKUP_CANDIDATES = [
  join(ROOT, 'design/directions/4-dark-light/schedule-1280-light.png'),
  join(ROOT, 'docs/look/schedule-1280-light.png'),
  '/opt/cursor/artifacts/p2-r2/schedule-1280-light.png',
  '/opt/cursor/artifacts/schedule-1280-light.png',
];

const PAIRS = [
  { id: 'week-1280', live: 'schedule-week-1280-top.png', out: 'sbs-week-1280.png', label: 'week 1280' },
  { id: 'tray-1280', live: 'schedule-needs-date-rail-1280.png', out: 'sbs-tray-1280.png', label: 'tray 1280' },
  { id: 'day-1280', live: 'schedule-day-1280-top.png', out: 'sbs-day-1280.png', label: 'day 1280' },
  { id: 'week-390', live: 'schedule-week-390-top.png', out: 'sbs-week-390.png', label: 'week 390' },
  { id: 'tray-390', live: 'schedule-unscheduled-tray-390.png', out: 'sbs-tray-390.png', label: 'tray 390' },
  { id: 'edit-390', live: 'schedule-quickbook-sheet-390.png', out: 'sbs-edit-390.png', label: 'edit 390' },
];

function findMockup() {
  for (const p of MOCKUP_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  return null;
}

mkdirSync(OUT, { recursive: true });
const mockup = findMockup();
const browser = await chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });

for (const pair of PAIRS) {
  const live = join(SRC, pair.live);
  if (!existsSync(live)) {
    console.error(`missing live frame ${live}`);
    continue;
  }
  copyFileSync(live, join(OUT, pair.live));
  const left = mockup
    ? `file://${mockup}`
    : '';
  const html = `<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; background: #E8E4D8; color: #0A2540; font: 14px/1.4 ui-sans-serif, system-ui; }
  .row { display: flex; gap: 16px; padding: 16px; align-items: flex-start; }
  figure { margin: 0; background: #FFFDF8; padding: 12px; flex: 1 1 0; min-width: 0; }
  figcaption { font-weight: 600; margin: 0 0 8px; }
  img { display: block; width: 100%; height: auto; background: #F5F0E6; }
  .miss { min-height: 320px; display: flex; align-items: center; justify-content: center; border: 1px dashed #0A2540; padding: 24px; text-align: center; }
</style>
<div class="row">
  <figure>
    <figcaption>schedule-1280-light${mockup ? '' : ' (not in this tree)'}</figcaption>
    ${mockup ? `<img src="${left}" alt="signed mockup">` : '<div class="miss">Signed mockup design/directions/4-dark-light/schedule-1280-light.png is not in this tree, origin/main, or /opt/cursor/artifacts. Live frame is on the right.</div>'}
  </figure>
  <figure>
    <figcaption>live ${pair.label}</figcaption>
    <img src="file://${live}" alt="${pair.label}">
  </figure>
</div>`;
  await page.setContent(html, { waitUntil: 'load' });
  const body = await page.$('body');
  const box = await body.boundingBox();
  await page.setViewportSize({ width: Math.ceil(box.width), height: Math.ceil(box.height) });
  await page.screenshot({ path: join(OUT, pair.out), animations: 'disabled' });
  console.log(join(OUT, pair.out));
}

writeFileSync(join(OUT, 'paths.txt'), [
  `mockup=${mockup ?? 'MISSING'}`,
  ...PAIRS.flatMap(p => [join(OUT, p.out), join(OUT, p.live)]),
  '',
].join('\n'));
await browser.close();
console.log(`wrote ${OUT}`);
