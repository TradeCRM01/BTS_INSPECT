// P3 r13 LOOK frames: scroll section into view, hide fixed nav, crop by element rect.
import { createServer } from 'node:http';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = process.env.P3_R13_OUT || '/opt/cursor/artifacts/p3-r13';
const REPO_ART = join(root, 'artifacts/p3-r13');
const FIXTURE = join(root, 'docs/look/p3/fixtures');
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

for (const dir of [ART, REPO_ART]) mkdirSync(dir, { recursive: true });

const cssFile = readdirSync(join(root, 'dist/assets')).find((name) => name.endsWith('.css'));
if (!cssFile) throw new Error('dist CSS missing; run npm run build');

const harnessJs = join(root, 'dist/p3-r13-harness.js');
await esbuild.build({
  absWorkingDir: root,
  entryPoints: [join(root, 'src/pages/p3Jobs.chromium.entry.tsx')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  outfile: harnessJs,
  logLevel: 'silent',
  define: {
    'process.env.NODE_ENV': '"test"',
    'import.meta.env.MODE': '"production"',
    'import.meta.env.DEV': 'false',
    'import.meta.env.PROD': 'true',
    'import.meta.env.SSR': 'false',
    'import.meta.env.VITE_LOOK_PROOF': 'undefined',
    'import.meta.env.VITE_SUPABASE_URL': '"https://example.supabase.co"',
    'import.meta.env.VITE_SUPABASE_ANON_KEY': '"test-anon-key"',
  },
  plugins: [{
    name: 'p3-jobs-mocks',
    setup(build) {
      const mocks = join(root, 'src/pages/p3Jobs.chromium.mocks.ts');
      build.onResolve({ filter: /(?:AuthContext|useCompanyAiKey|DevConsole|GlobalSearch|(?:^|[./])supabase)$/ }, (args) => {
        const spec = args.path.replace(/\\/g, '/');
        if (/AuthContext$/.test(spec)) return { path: mocks, namespace: 'file' };
        if (/useCompanyAiKey$/.test(spec)) return { path: mocks, namespace: 'file' };
        if (/DevConsole$/.test(spec)) return { path: mocks, namespace: 'file' };
        if (/GlobalSearch$/.test(spec)) return { path: mocks, namespace: 'file' };
        if (/(?:^|[./])supabase$/.test(spec)) return { path: mocks, namespace: 'file' };
        return null;
      });
    },
  }],
});

function pageHtml(path) {
  return `<!doctype html>
<html data-theme="light" data-allow-dark="false">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="/assets/${cssFile}" />
</head>
<body>
<div id="root"></div>
<script>window.__P3__ = ${JSON.stringify({ path })};</script>
<script src="/p3-r13-harness.js"></script>
</body>
</html>`;
}

const htmlFiles = {
  'p3-r13-sheet.html': '/jobs/p3-0036',
  'p3-r13-empty-bill.html': '/jobs/p3-need-crew',
  'p3-r13-list.html': '/jobs',
};
for (const [name, path] of Object.entries(htmlFiles)) {
  writeFileSync(join(root, 'dist', name), pageHtml(path));
}

const mockRoot = join(tmpdir(), `p3-r13-mock-${Date.now()}`);
mkdirSync(join(mockRoot, 'directions/4-dark-light/html'), { recursive: true });
mkdirSync(join(mockRoot, 'directions/_src'), { recursive: true });
mkdirSync(join(mockRoot, 'directions/fonts'), { recursive: true });
copyFileSync(join(FIXTURE, 'job-390-light.html'), join(mockRoot, 'directions/4-dark-light/html/job-390-light.html'));
copyFileSync(join(FIXTURE, 'tokens.css'), join(mockRoot, 'directions/4-dark-light/tokens.css'));
copyFileSync(join(FIXTURE, 'app.css'), join(mockRoot, 'directions/_src/app.css'));
copyFileSync(join(FIXTURE, 'direction.css'), join(mockRoot, 'directions/4-dark-light/html/direction.css'));
const geist = join(root, 'public/fonts/Geist-Variable.woff2');
if (existsSync(geist)) copyFileSync(geist, join(mockRoot, 'directions/fonts/Geist-VariableFont_wght.ttf'));

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};
const mockServer = createServer((req, res) => {
  const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '');
  const abs = join(mockRoot, rel);
  if (!abs.startsWith(mockRoot) || !existsSync(abs)) {
    res.statusCode = 404;
    res.end('not found');
    return;
  }
  res.setHeader('content-type', mime[extname(abs)] || 'application/octet-stream');
  res.end(readFileSync(abs));
});
const mockPort = await new Promise((resolve, reject) => {
  mockServer.listen(0, '127.0.0.1', () => resolve(mockServer.address().port));
  mockServer.on('error', reject);
});

const preview = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
  cwd: root,
  stdio: 'pipe',
});
const previewBase = 'http://127.0.0.1:4173';
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('vite preview did not start')), 20000);
  const onData = (buf) => {
    const text = String(buf);
    if (/Local:|4173/.test(text)) {
      clearTimeout(timer);
      preview.stdout.off('data', onData);
      resolve();
    }
  };
  preview.stdout.on('data', onData);
  preview.stderr.on('data', onData);
  preview.on('error', reject);
});

const chromeCandidates = [
  process.env.CHROME_PATH,
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome',
  '/usr/local/bin/google-chrome',
  '/usr/bin/chromium',
].filter((path) => path && existsSync(path));

const browser = await chromium.launch({
  headless: true,
  executablePath: chromeCandidates[0],
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

async function open(width, url, height = width <= 430 ? 844 : 900) {
  const context = await browser.newContext({
    viewport: { width, height },
    timezoneId: 'Australia/Brisbane',
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

async function waitReady(page, sel) {
  await page.waitForSelector(sel, { timeout: 30000, state: 'attached' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
}

async function hideFixedNav(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.shell-bottom-nav, .tabbar, .home-ind').forEach((el) => {
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('visibility', 'hidden', 'important');
    });
  });
}

async function sectionBox(page, find) {
  return page.evaluate((fnSrc) => {
    const findEl = window.eval(`(${fnSrc})`);
    const els = findEl(document).filter(Boolean);
    if (!els.length) return null;
    els[0].scrollIntoView({ block: 'start', inline: 'nearest' });
    const boxes = els.map((el) => el.getBoundingClientRect());
    const left = Math.min(...boxes.map((b) => b.left));
    const top = Math.min(...boxes.map((b) => b.top));
    const right = Math.max(...boxes.map((b) => b.right));
    const bottom = Math.max(...boxes.map((b) => b.bottom));
    return {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
      innerW: window.innerWidth,
      innerH: window.innerHeight,
    };
  }, find);
}

async function cropSection(page, find) {
  await hideFixedNav(page);
  let box = await sectionBox(page, find);
  if (!box) throw new Error(`section missing: ${find}`);
  const needH = Math.ceil(Math.max(0, box.y) + box.height + 24);
  const vp = page.viewportSize();
  if (vp && needH > vp.height) {
    await page.setViewportSize({ width: vp.width, height: needH });
    await hideFixedNav(page);
    box = await sectionBox(page, find);
    if (!box) throw new Error(`section missing after resize: ${find}`);
  }
  const innerW = box.innerW;
  const innerH = box.innerH;
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const width = Math.max(1, Math.min(innerW - x, Math.ceil(box.width)));
  const height = Math.max(1, Math.min(innerH - y, Math.ceil(box.height)));
  if (y >= innerH) throw new Error(`section still below viewport: ${find} y=${y} innerH=${innerH}`);
  return page.screenshot({
    type: 'png',
    animations: 'disabled',
    clip: { x, y, width, height },
  });
}

async function sideBySide(page, mockBuf, headBuf, name) {
  const png = await page.evaluate(async ({ mockB64, headB64 }) => {
    const load = (b64) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = `data:image/png;base64,${b64}`;
    });
    const [mock, head] = await Promise.all([load(mockB64), load(headB64)]);
    const canvas = document.createElement('canvas');
    canvas.width = mock.width + head.width;
    canvas.height = Math.max(mock.height, head.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#F5F5F7';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(mock, 0, 0);
    ctx.drawImage(head, mock.width, 0);
    return canvas.toDataURL('image/png').slice('data:image/png;base64,'.length);
  }, {
    mockB64: mockBuf.toString('base64'),
    headB64: headBuf.toString('base64'),
  });
  const buf = Buffer.from(png, 'base64');
  writeFileSync(join(ART, name), buf);
  writeFileSync(join(REPO_ART, name), buf);
}

function writeBoth(name, buf) {
  writeFileSync(join(ART, name), buf);
  writeFileSync(join(REPO_ART, name), buf);
}

const mockFind = {
  header: `function(doc) {
    return [
      doc.querySelector('.appbar'),
      doc.querySelector('.j .ref'),
      doc.querySelector('h1.h1'),
      doc.querySelector('.j .meta'),
      doc.querySelector('.cta'),
      doc.querySelector('.segc'),
      doc.querySelector('dl'),
    ];
  }`,
  bill: `function(doc) {
    return [...doc.querySelectorAll('section.sec')].filter((sec) => sec.querySelector('.bill3'));
  }`,
  notes: `function(doc) {
    return [...doc.querySelectorAll('section.sec')].filter((sec) => /Notes/.test(sec.querySelector('.h2')?.textContent || ''));
  }`,
  photos: `function(doc) {
    return [...doc.querySelectorAll('section.sec')].filter((sec) => sec.querySelector('.photos'));
  }`,
};

const headFind = {
  header: `function(doc) {
    return [
      doc.querySelector('.job-sheet-appbar'),
      doc.querySelector('.job-sheet-head'),
      doc.querySelector('.job-sheet-tabs'),
      doc.querySelector('[data-job-sheet="kv"]'),
    ];
  }`,
  bill: `function(doc) { return [doc.querySelector('[data-job-sheet="bill"]')]; }`,
  notes: `function(doc) { return [doc.querySelector('[data-job-sheet="notes"]')]; }`,
  photos: `function(doc) { return [doc.querySelector('[data-job-sheet="photos"]')]; }`,
  actions: `function(doc) {
    return [
      doc.querySelector('[data-job-sheet="actions"]'),
      doc.querySelector('[data-job-sheet="actions"] > summary'),
      doc.querySelector('[data-job-sheet="actions"] .hub-job-more-menu'),
    ];
  }`,
};

{
  const { context, page } = await open(390, `${previewBase}/p3-r13-sheet.html`, 1600);
  await waitReady(page, 'h1.hub-jobs-hero');
  const { context: mockCtx, page: mockPage } = await open(
    390,
    `http://127.0.0.1:${mockPort}/directions/4-dark-light/html/job-390-light.html`,
    1600,
  );
  await waitReady(mockPage, 'h1.h1');

  for (const key of ['header', 'bill', 'notes', 'photos']) {
    const mockBuf = await cropSection(mockPage, mockFind[key]);
    const headBuf = await cropSection(page, headFind[key]);
    await sideBySide(page, mockBuf, headBuf, `sbs-${key}.png`);
  }

  await page.click('[data-job-sheet="actions"] > summary');
  await page.waitForSelector('[data-job-action="details"]', { state: 'visible', timeout: 10000 });
  const actionsHead = await cropSection(page, headFind.actions);
  const actionsSize = await page.evaluate(() => {
    const el = document.querySelector('[data-job-sheet="actions"]');
    const menu = document.querySelector('[data-job-sheet="actions"] .hub-job-more-menu');
    const a = el?.getBoundingClientRect();
    const m = menu?.getBoundingClientRect();
    const top = Math.min(a?.top ?? 0, m?.top ?? a?.top ?? 0);
    const bottom = Math.max(a?.bottom ?? 0, m?.bottom ?? a?.bottom ?? 0);
    return { w: 390, h: Math.max(1, Math.ceil(bottom - top)) };
  });
  const left = Buffer.from(await page.evaluate(async ({ w, h }) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#F5F5F7';
    ctx.fillRect(0, 0, w, h);
    return canvas.toDataURL('image/png').slice('data:image/png;base64,'.length);
  }, actionsSize), 'base64');
  await sideBySide(page, left, actionsHead, 'sbs-actions.png');

  await mockCtx.close();
  await context.close();
}

{
  const { context, page } = await open(390, `${previewBase}/p3-r13-empty-bill.html`, 1600);
  await waitReady(page, 'h1.hub-jobs-hero');
  const buf = await cropSection(page, headFind.bill);
  writeBoth('bill-empty.png', buf);
  await context.close();
}

{
  const widths = [375, 390, 768, 1024, 1280];
  const overflow = [];
  const measure = () => {
    const vis = (el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const els = [...document.querySelectorAll('body *')].filter(vis);
    const rights = els.map((el) => el.getBoundingClientRect().right);
    return {
      innerWidth: window.innerWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      maxRight: rights.length ? Math.max(...rights) : 0,
    };
  };
  for (const width of widths) {
    const { context, page } = await open(width, `${previewBase}/p3-r13-list.html`, width <= 430 ? 844 : 900);
    await waitReady(page, '.hub-jobs-list-whisper');
    overflow.push({ width, mode: 'VIEW', surface: 'list', ...(await page.evaluate(measure)) });
    await page.click('[data-jobs-new="1"]');
    await page.waitForSelector('[data-job-form="1"]', { timeout: 15000 });
    overflow.push({ width, mode: 'EDIT', surface: 'form', ...(await page.evaluate(measure)) });
    await context.close();
    const sheet = await open(width, `${previewBase}/p3-r13-sheet.html`, width <= 430 ? 844 : 900);
    await waitReady(sheet.page, 'h1.hub-jobs-hero');
    overflow.push({ width, mode: 'VIEW', surface: 'sheet', ...(await sheet.page.evaluate(measure)) });
    await sheet.page.click('[data-job-sheet="actions"] > summary');
    await sheet.page.click('[data-job-action="details"]');
    await sheet.page.waitForSelector('[data-job-form="1"]', { timeout: 15000 });
    overflow.push({ width, mode: 'EDIT', surface: 'sheet', ...(await sheet.page.evaluate(measure)) });
    await sheet.context.close();
  }
  writeBoth('overflow.json', Buffer.from(JSON.stringify(overflow, null, 2)));
}

await browser.close();
preview.kill('SIGTERM');
mockServer.close();
rmSync(harnessJs, { force: true });
for (const name of Object.keys(htmlFiles)) rmSync(join(root, 'dist', name), { force: true });
rmSync(mockRoot, { recursive: true, force: true });
console.log(`wrote ${ART} and ${REPO_ART}`);
process.exit(0);
