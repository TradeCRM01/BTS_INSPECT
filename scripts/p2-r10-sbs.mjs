#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { closeHarness, measure, measureMockup1280 } from '../src/proof/p2Schedule/harness.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTS = [
  process.env.P2_R10_OUT || '/opt/cursor/artifacts/p2-r10',
  process.env.P2_R10_STORE || '/cursor/stores/self/artifacts/p2-r10',
];
for (const out of OUTS) mkdirSync(out, { recursive: true });

const exact = (a, b) => a === b;
const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1;
const px = n => (Number.isFinite(n) ? Number(n).toFixed(2) : String(n));

const serveFixtures = async () => {
  const root = mkdtempSync(join(tmpdir(), 'p2-r10-sbs-'));
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
  return { root, server, port: server.address().port };
};

const browser = await chromium.launch({
  executablePath: ['/usr/local/bin/google-chrome', '/usr/bin/google-chrome'].find(p => existsSync(p)),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
});

const mock1280 = await measureMockup1280();
const week = await measure('week-1280');
const phone = await measure('week-390');
const tablet = await measure('week-768');

const writeAll = (name, buf) => {
  for (const out of OUTS) writeFileSync(join(out, name), buf);
};

writeAll('week-390-top.png', phone.png.top);
writeAll('week-768-top.png', tablet.png.top);
writeAll('week-1280-top.png', week.png.top);

const { root, server, port } = await serveFixtures();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:${port}/directions/4-dark-light/html/schedule-1280-light.html`);
await page.waitForSelector('.s-head .h1');
await page.evaluate(() => document.fonts.ready);
const mockPng = await page.screenshot({ type: 'png' });
await page.close();
writeAll('mockup-week-1280.png', mockPng);
writeAll('live-week-1280.png', week.png.top);
await new Promise(r => server.close(() => r()));
rmSync(root, { recursive: true, force: true });

const compose = async (w, h, left, right, out, labels) => {
  const shot = await browser.newPage({ viewport: { width: w, height: h } });
  await shot.setContent(`<!doctype html><html><body style="margin:0;background:#F5F0E6;font:12px/16px ui-sans-serif,system-ui">
  <div style="display:flex;gap:8px;padding:8px">
    <figure style="margin:0"><figcaption>${labels[0]}</figcaption><img src="data:image/png;base64,${left.toString('base64')}" style="width:${labels[2]}px;border:1px solid #ccc"></figure>
    <figure style="margin:0"><figcaption>${labels[1]}</figcaption><img src="data:image/png;base64,${right.toString('base64')}" style="width:${labels[2]}px;border:1px solid #ccc"></figure>
  </div></body></html>`);
  const buf = await shot.screenshot({ type: 'png' });
  writeAll(out, buf);
  await shot.close();
};
await compose(1400, 940, mockPng, week.png.top, 'sbs-week-1280.png', ['mockup 1280 (fixture over http)', 'head week 1280', '640']);

const c = phone.chrome;
const t = tablet.chrome;
const w = week.chrome;
const rows = [
  ['390 header left', '16', px(c.headerLeft), near(c.headerLeft, 16) ? 'MATCH' : 'MISS'],
  ['390 search left', '16', px(c.searchLeft), near(c.searchLeft, 16) ? 'MATCH' : 'MISS'],
  ['390 list left', '16', px(c.listLeft), near(c.listLeft, 16) ? 'MATCH' : 'MISS'],
  ['390 search right', String(phone.iw - 16), px(c.searchRight), near(c.searchRight, phone.iw - 16) ? 'MATCH' : 'MISS'],
  ['390 overflow docSW', String(phone.iw), String(phone.docSW), phone.docSW <= phone.iw ? 'MATCH' : 'MISS'],
  ['768 header left', '16', px(t.headerLeft), t.headerLeft === 16 ? 'MATCH' : 'MISS'],
  ['768 list left', '16', px(t.listLeft), t.headerLeft === t.listLeft ? 'MATCH' : 'MISS'],
  ['1280 search (exact)', px(mock1280.searchW), px(w.searchWidth), exact(w.searchWidth, mock1280.searchW) ? 'MATCH' : 'MISS'],
  ['1280 New job y (exact)', px(mock1280.newJobY), px(w.newJobY), exact(w.newJobY, mock1280.newJobY) ? 'MATCH' : 'MISS'],
  ['1280 eyebrow lh (exact)', String(mock1280.eyebrowLh), String(w.eyebrowLh), exact(w.eyebrowLh, mock1280.eyebrowLh) ? 'MATCH' : 'MISS'],
  ['1280 New job size', `${px(mock1280.newJobW)}×${px(mock1280.newJobH)}`, `${px(w.newJobW)}×${px(w.newJobH)}`, exact(w.newJobW, mock1280.newJobW) && exact(w.newJobH, mock1280.newJobH) ? 'MATCH' : 'MISS'],
  ['1280 Today', `${px(mock1280.todayW)}×${px(mock1280.todayH)} ${mock1280.todayFill} painted ${mock1280.todayPainted}`, `${px(w.todayW)}×${px(w.todayH)} ${w.todayFill} painted ${w.todayPainted}`, exact(w.todayW, mock1280.todayW) && exact(w.todayH, mock1280.todayH) && exact(w.todayFill, mock1280.todayFill) && exact(w.todayPainted, mock1280.todayPainted) ? 'MATCH' : 'MISS'],
  ['Week/Day active fill', mock1280.segActivePaint, w.segActivePaint, exact(mock1280.segActivePaint, w.segActivePaint) ? 'MATCH' : 'MISS'],
  ['Week/Day track paint', mock1280.segTrackPaint, w.segTrackPaint, exact(mock1280.segTrackPaint, w.segTrackPaint) ? 'MATCH' : 'MISS'],
  ['Week/Day active ink', mock1280.segActiveInk, w.segActiveInk, exact(mock1280.segActiveInk, w.segActiveInk) ? 'MATCH' : 'MISS'],
  ['Geist 16px fonts.check', String(mock1280.geistCheck), String(w.geistCheck), mock1280.geistCheck && w.geistCheck ? 'MATCH' : 'MISS'],
];
const md = ['# r10 mock vs head', '', '| Element | fixture / pin | head | verdict |', '|---|---|---|---|', ...rows.map(r => `| ${r[0]} | ${r[1]} | ${r[2]} | **${r[3]}** |`), '',
  `No 390 Schedule mock exists. 390 pins only the 16px gutter and overflow. Search MATCH is exact (not ±1). Geist fixture ${mock1280.geistCheck}. Search ${px(w.searchWidth)} / New job y ${px(w.newJobY)} / eyebrow lh ${w.eyebrowLh}.`,
].join('\n');
for (const out of OUTS) {
  writeFileSync(join(out, 'compare.md'), md);
  writeFileSync(join(out, 'compare.json'), JSON.stringify({ mock1280, phone: c, tablet: t, week: w }, null, 2));
}
console.log(md);

await browser.close();
await closeHarness();
