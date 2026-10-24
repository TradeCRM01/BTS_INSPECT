#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { closeHarness, measure, measureMockup1280, openState } from '../src/proof/p2Schedule/harness.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.P2_R8B_OUT || '/opt/cursor/artifacts/p2-r8b';
mkdirSync(OUT, { recursive: true });

const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.round(a * 10) === Math.round(b * 10);
const px = n => (Number.isFinite(n) ? Number(n).toFixed(2) : String(n));

const browser = await chromium.launch({
  executablePath: ['/usr/local/bin/google-chrome', '/usr/bin/google-chrome'].find(p => existsSync(p)),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
});

const mock = await measureMockup1280();
const week = await measure('week-1280');
const rail = await measure('rail-1280');
const phone = await measure('week-390');
const tablet = await measure('week-768');

writeFileSync(join(OUT, 'week-390-top.png'), phone.png.top);
writeFileSync(join(OUT, 'week-768-top.png'), tablet.png.top);
if (week.png.focus) writeFileSync(join(OUT, 'seg-focus-1280.png'), week.png.focus);

const qb = await openState('week-390');
await qb.page.getByRole('button', { name: 'New job' }).first().click();
await qb.page.locator('[data-schedule-section="quickbook"][data-open="1"]').waitFor({ timeout: 4_000 }).catch(() => {});
await qb.page.screenshot({ path: join(OUT, 'quickbook-390.png'), animations: 'disabled', caret: 'hide' });
const qbTz = await qb.page.evaluate(() => ({
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  tzOffset: new Date().getTimezoneOffset(),
  geistCheck: document.fonts.check('16px Geist'),
  geistTitleCheck: document.fonts.check('48px Geist'),
}));
await qb.close();

const mockPage = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const root = mkdtempSync(join(tmpdir(), 'p2-r8b-sbs-'));
const htmlDir = join(root, 'directions/4-dark-light/html');
mkdirSync(htmlDir, { recursive: true });
mkdirSync(join(root, 'directions/_src'), { recursive: true });
const fixtures = join(ROOT, 'docs/look/p2/fixtures');
copyFileSync(join(fixtures, 'schedule-1280-light.html'), join(htmlDir, 'schedule-1280-light.html'));
copyFileSync(join(fixtures, 'direction.css'), join(htmlDir, 'direction.css'));
copyFileSync(join(fixtures, 'tokens.css'), join(root, 'directions/4-dark-light/tokens.css'));
copyFileSync(join(fixtures, 'app.css'), join(root, 'directions/_src/app.css'));
const font = join(ROOT, 'public/fonts/Geist-Variable.woff2');
const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
  const file = urlPath.includes('Geist-VariableFont_wght') ? font : join(root, urlPath);
  if (!existsSync(file) || statSync(file).isDirectory()) { res.statusCode = 404; res.end(); return; }
  const ext = file.split('.').pop() ?? '';
  const types = { html: 'text/html; charset=utf-8', css: 'text/css', woff2: 'font/woff2', ttf: 'font/woff2' };
  res.setHeader('content-type', types[ext] ?? 'application/octet-stream');
  res.end(readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const { port } = server.address();
await mockPage.goto(`http://127.0.0.1:${port}/directions/4-dark-light/html/schedule-1280-light.html`);
await mockPage.waitForSelector('.s-head .h1');
await mockPage.evaluate(() => document.fonts.ready);
const mockFonts = await mockPage.evaluate(() => ({
  geistCheck: document.fonts.check('16px Geist'),
  geistTitleCheck: document.fonts.check('48px Geist'),
  status: [...document.fonts].map(f => ({ family: f.family, status: f.status })),
}));
const mockPng = await mockPage.screenshot({ path: join(OUT, 'mockup-week-1280.png'), type: 'png' });
writeFileSync(join(OUT, 'live-week-1280.png'), week.png.top);
await mockPage.close();
server.close();
rmSync(root, { recursive: true, force: true });

const composePage = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const html = `<!doctype html><meta charset="utf-8"><canvas id="c"></canvas>
<script type="module">
  const left = new Image(); const right = new Image();
  left.src = 'data:image/png;base64,${mockPng.toString('base64')}';
  right.src = 'data:image/png;base64,${week.png.top.toString('base64')}';
  await Promise.all([left.decode(), right.decode()]);
  const cap = 28, gap = 16, pad = 16, cell = 640;
  const scale = img => { const s = Math.min(cell / img.width, cell / img.height, 1); return { w: Math.round(img.width * s), h: Math.round(img.height * s) }; };
  const L = scale(left); const R = scale(right);
  const c = document.getElementById('c');
  c.width = pad * 2 + L.w + gap + R.w;
  c.height = pad * 2 + cap + Math.max(L.h, R.h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#E8E4D8'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#0A2540'; ctx.font = '600 13px ui-sans-serif, system-ui';
  ctx.fillText('mockup 1280 (fixture over http)', pad, pad + 16);
  ctx.fillText('head week 1280', pad + L.w + gap, pad + 16);
  ctx.drawImage(left, pad, pad + cap, L.w, L.h);
  ctx.drawImage(right, pad + L.w + gap, pad + cap, R.w, R.h);
  window.__ready = { w: c.width, h: c.height };
</script>`;
await composePage.setContent(html, { waitUntil: 'networkidle' });
await composePage.waitForFunction(() => window.__ready);
const info = await composePage.evaluate(() => window.__ready);
await composePage.setViewportSize({ width: Math.ceil(info.w), height: Math.ceil(info.h) });
await composePage.locator('#c').screenshot({ path: join(OUT, 'sbs-week-1280.png'), type: 'png' });
await composePage.close();

const c = week.chrome;
const fillMatch = mock.segActivePaint === c.segActivePaint;
const rows = [
  ['h1 600 48/52', `${mock.h1Weight} ${mock.h1Size}/${mock.h1Lh}`, `${c.h1Weight} ${c.h1Size}/${c.h1Lh}`, near(c.h1Weight, mock.h1Weight) && near(c.h1Size, mock.h1Size) && near(c.h1Lh, mock.h1Lh) ? 'MATCH' : 'MISMATCH'],
  ['Sub-line 400 16/24', `${mock.subWeight} ${mock.subSize}/${mock.subLh}`, `${c.whisperWeight} ${c.whisperSize}/${c.whisperLh}`, near(c.whisperWeight, mock.subWeight) && near(c.whisperSize, mock.subSize) && near(c.whisperLh, mock.subLh) ? 'MATCH' : 'MISMATCH'],
  ['Eyebrow painted', mock.eyebrowPaint, c.eyebrowPaint, mock.eyebrowPaint === c.eyebrowPaint ? 'MATCH' : 'MISMATCH'],
  ['Eyebrow text-transform', mock.eyebrowTransform, c.eyebrowTransform, mock.eyebrowTransform === c.eyebrowTransform ? 'MATCH' : 'MISMATCH'],
  ['Eyebrow letter-spacing', mock.eyebrowLetterSpacing, c.eyebrowLetterSpacing, mock.eyebrowLetterSpacing === c.eyebrowLetterSpacing ? 'MATCH' : 'MISMATCH'],
  ['New job', `${px(mock.newJobW)}×${px(mock.newJobH)}`, `${px(c.newJobW)}×${px(c.newJobH)}`, near(c.newJobW, mock.newJobW) && near(c.newJobH, mock.newJobH) ? 'MATCH' : 'MISMATCH'],
  ['Week/Day track painted (fill)', mock.segTrackPaint, c.segTrackPaint, mock.segTrackPaint === c.segTrackPaint ? 'MATCH' : 'MISMATCH'],
  ['Week/Day active FILL (x+4,y+3; not the letter)', mock.segActivePaint, c.segActivePaint, fillMatch ? 'MATCH' : 'MISMATCH'],
  ['Week/Day active TEXT (darkest pixel in the segment)', mock.segActiveInk, c.segActiveInk, mock.segActiveInk === c.segActiveInk ? 'MATCH' : 'MISMATCH'],
  ['Search', `${px(mock.searchW)}×${px(mock.searchH)}`, `${px(c.searchWidth)}×${px(c.searchH)}`, near(c.searchWidth, mock.searchW) && near(c.searchH, mock.searchH) ? 'MATCH' : 'MISMATCH'],
  ['Today 86×48 white', `${px(mock.todayW)}×${px(mock.todayH)} ${mock.todayFill}`, `${px(c.todayW)}×${px(c.todayH)} ${c.todayFill}`, near(c.todayW, mock.todayW) && near(c.todayH, mock.todayH) && mock.todayFill === c.todayFill ? 'MATCH' : 'MISMATCH'],
  ['Board full-bleed', `${px(mock.boardLeft)}–${px(mock.boardRight)}`, `${px(c.boardLeft)}–${px(c.boardRight)}`, near(c.boardLeft, mock.boardLeft) && near(c.boardRight, mock.boardRight) ? 'MATCH' : 'MISMATCH'],
  ['Tray heading h26 600 20/26', `${px(mock.trayH)} ${mock.trayWeight} ${mock.traySize}/${mock.trayLh}`, `${px(rail.chrome.trayHeadingH)} ${c.trayWeight} ${c.traySize}/${c.trayLh}`, near(rail.chrome.trayHeadingH, mock.trayH) ? 'MATCH' : 'MISMATCH'],
  ['Geist 16px fonts.check', String(mock.geistCheck), String(c.geistCheck), mock.geistCheck === c.geistCheck ? 'MATCH' : 'MISMATCH'],
];

const md = [
  '# r8b mockup vs head (fixture over http, same Playwright run pins)',
  '',
  '| Element | fixture | head | verdict |',
  '|---|---|---|---|',
  ...rows.map(r => `| ${r[0]} | ${r[1]} | ${r[2]} | **${r[3]}** |`),
  '',
  'Active-segment note: r8 compared a centre sample that hit the **text** `rgb(10,10,11)` on the fixture against the inverse **fill** on head. Those are different layers. This table samples fill at (x+4,y+3) and text via darkest pixel.',
  '',
  `Geist: fixture \`document.fonts.check('16px Geist')\` = ${mock.geistCheck}, fixture 48px = ${mockFonts.geistTitleCheck}; head 16px = ${c.geistCheck}, head 48px = ${qbTz.geistTitleCheck}. Search ${px(c.searchWidth)} vs fixture ${px(mock.searchW)}; New job ${px(c.newJobW)} vs fixture ${px(mock.newJobW)}.`,
  '',
  `Phone gutters: 390 headerLeft=${phone.chrome.headerLeft} listLeft=${phone.chrome.listLeft}; 768 headerLeft=${tablet.chrome.headerLeft} listLeft=${tablet.chrome.listLeft}.`,
  '',
  `TZ probe: timezoneId line is \`timezoneId: TIMEZONE\` in harness.ts; this run timeZone=${c.timeZone} tzOffset=${c.tzOffset}; quickbook page ${qbTz.timeZone} / ${qbTz.tzOffset}.`,
  '',
  'Frames: `sbs-week-1280.png`, `week-390-top.png`, `week-768-top.png`, `seg-focus-1280.png`, `quickbook-390.png`.',
  '',
].join('\n');
writeFileSync(join(OUT, 'compare.md'), md);
writeFileSync(join(OUT, 'compare.json'), `${JSON.stringify({
  mock, chrome: c, rail: rail.chrome, phone: phone.chrome, tablet: tablet.chrome, mockFonts, qbTz,
}, null, 2)}\n`);
await closeHarness();
await browser.close();
console.log(md);
