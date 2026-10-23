#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { closeHarness, measure, measureMockup1280, measureMockup390 } from '../src/proof/p2Schedule/harness.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.P2_R8C_OUT || '/opt/cursor/artifacts/p2-r8c';
mkdirSync(OUT, { recursive: true });

const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1;
const px = n => (Number.isFinite(n) ? Number(n).toFixed(2) : String(n));

const serveFixtures = async () => {
  const root = mkdtempSync(join(tmpdir(), 'p2-r8c-sbs-'));
  const htmlDir = join(root, 'directions/4-dark-light/html');
  mkdirSync(htmlDir, { recursive: true });
  mkdirSync(join(root, 'directions/_src'), { recursive: true });
  const fixtures = join(ROOT, 'docs/look/p2/fixtures');
  copyFileSync(join(fixtures, 'schedule-1280-light.html'), join(htmlDir, 'schedule-1280-light.html'));
  copyFileSync(join(fixtures, 'schedule-390-light.html'), join(htmlDir, 'schedule-390-light.html'));
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
const mock390 = await measureMockup390();
const week = await measure('week-1280');
const phone = await measure('week-390');
const tablet = await measure('week-768');

writeFileSync(join(OUT, 'week-390-top.png'), phone.png.top);
writeFileSync(join(OUT, 'week-768-top.png'), tablet.png.top);
writeFileSync(join(OUT, 'week-1280-top.png'), week.png.top);

const { root, server, port } = await serveFixtures();
const shot = async (w, h, file, path) => {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}${path}`);
  await page.waitForSelector('.s-head .h1');
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ path: join(OUT, file), type: 'png' });
  await page.close();
  return png;
};
await shot(390, 812, 'mockup-week-390.png', '/directions/4-dark-light/html/schedule-390-light.html');
await shot(1280, 900, 'mockup-week-1280.png', '/directions/4-dark-light/html/schedule-1280-light.html');
writeFileSync(join(OUT, 'live-week-390.png'), phone.png.top);
writeFileSync(join(OUT, 'live-week-1280.png'), week.png.top);
await new Promise(r => server.close(() => r()));
rmSync(root, { recursive: true, force: true });

const compose = async (w, h, left, right, out, labels) => {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#F5F0E6;font:12px/16px ui-sans-serif,system-ui">
  <div style="display:flex;gap:8px;padding:8px">
    <figure style="margin:0"><figcaption>${labels[0]}</figcaption><img src="data:image/png;base64,${left.toString('base64')}" style="width:${labels[2]}px;border:1px solid #ccc"></figure>
    <figure style="margin:0"><figcaption>${labels[1]}</figcaption><img src="data:image/png;base64,${right.toString('base64')}" style="width:${labels[2]}px;border:1px solid #ccc"></figure>
  </div></body></html>`);
  await page.screenshot({ path: join(OUT, out), type: 'png' });
  await page.close();
};
await compose(820, 860, readFileSync(join(OUT, 'mockup-week-390.png')), phone.png.top, 'sbs-week-390.png', ['mockup 390 (fixture over http)', 'head week 390', '390']);
await compose(1400, 940, readFileSync(join(OUT, 'mockup-week-1280.png')), week.png.top, 'sbs-week-1280.png', ['mockup 1280 (fixture over http)', 'head week 1280', '640']);

const c = phone.chrome;
const t = tablet.chrome;
const rows = [
  ['390 search left', px(mock390.searchLeft), px(c.searchLeft), near(c.searchLeft, c.headerLeft) ? 'MATCH' : 'MISS'],
  ['390 search right', px(mock390.searchRight), px(c.searchRight), near(c.searchRight, c.pageRight - 16) ? 'MATCH' : 'MISS'],
  ['390 header left', px(mock390.headerLeft), px(c.headerLeft), near(c.headerLeft, 16) ? 'MATCH' : 'MISS'],
  ['390 day-group left', px(mock390.dayGroupLeft), px(c.dayGroupLeft), near(c.dayGroupLeft, mock390.dayGroupLeft) ? 'MATCH' : 'MISS'],
  ['390 card left', px(mock390.cardLeft), px(c.cardLeft), near(c.cardLeft, mock390.cardLeft) ? 'MATCH' : 'MISS'],
  ['390 eyebrow gap', px(mock390.eyebrowGap), px(c.eyebrowTop - c.barBottom), near(c.eyebrowTop - c.barBottom, mock390.eyebrowGap) ? 'MATCH' : 'MISS'],
  ['768 header left', '16', px(t.headerLeft), t.headerLeft === 16 ? 'MATCH' : 'MISS'],
  ['768 list left', '16', px(t.listLeft), t.headerLeft === t.listLeft ? 'MATCH' : 'MISS'],
  ['1280 search', px(mock1280.searchW), px(week.chrome.searchWidth), near(week.chrome.searchWidth, mock1280.searchW) ? 'MATCH' : 'MISS'],
];
const md = ['# r8c mock vs head', '', '| Element | fixture | head | verdict |', '|---|---|---|---|', ...rows.map(r => `| ${r[0]} | ${r[1]} | ${r[2]} | **${r[3]}** |`), '',
  `Geist 390 fixture ${mock390.geistCheck}. 1280 fixture ${mock1280.geistCheck}. Search 755.27 / New job 128.22 vs CoS 753/129: both Geist true.`,
].join('\n');
writeFileSync(join(OUT, 'compare.md'), md);
writeFileSync(join(OUT, 'compare.json'), JSON.stringify({ mock1280, mock390, phone: c, tablet: t, week: week.chrome }, null, 2));
console.log(md);

await browser.close();
await closeHarness();
