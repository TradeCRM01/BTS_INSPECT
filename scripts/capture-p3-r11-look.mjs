// P3 r11 LOOK frames: mock left vs head right at 390, plus empty bill and Actions.
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
const ART = process.env.P3_R11_OUT || '/opt/cursor/artifacts/p3-r11';
const FIXTURE = join(root, 'docs/look/p3/fixtures');
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

mkdirSync(ART, { recursive: true });

const cssFile = readdirSync(join(root, 'dist/assets')).find((name) => name.endsWith('.css'));
if (!cssFile) throw new Error('dist CSS missing; run npm run build');

const harnessJs = join(root, 'dist/p3-r11-harness.js');
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
<script src="/p3-r11-harness.js"></script>
</body>
</html>`;
}

const htmlFiles = {
  'p3-r11-sheet.html': '/jobs/p3-0036',
  'p3-r11-empty-bill.html': '/jobs/p3-need-crew',
  'p3-r11-list.html': '/jobs',
};
for (const [name, path] of Object.entries(htmlFiles)) {
  writeFileSync(join(root, 'dist', name), pageHtml(path));
}

const mockRoot = join(tmpdir(), `p3-r11-mock-${Date.now()}`);
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

async function compositeSlices(page, mockPng, headPng, sliceH) {
  return page.evaluate(async ({ mockB64, headB64, sliceH: h }) => {
    const load = (b64) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = `data:image/png;base64,${b64}`;
    });
    const [mock, head] = await Promise.all([load(mockB64), load(headB64)]);
    const maxH = Math.max(mock.height, head.height);
    const slice = Math.max(1, h);
    const names = ['vp-01', 'vp-02', 'vp-03'];
    const out = {};
    names.forEach((name, i) => {
      const y = Math.min(i * slice, Math.max(0, maxH - slice));
      const canvas = document.createElement('canvas');
      canvas.width = mock.width + head.width;
      canvas.height = slice;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#F5F5F7';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(mock, 0, -y);
      ctx.drawImage(head, mock.width, -y);
      out[name] = canvas.toDataURL('image/png').slice('data:image/png;base64,'.length);
    });
    return out;
  }, {
    mockB64: mockPng.toString('base64'),
    headB64: headPng.toString('base64'),
    sliceH,
  });
}

{
  const { context, page } = await open(390, `${previewBase}/p3-r11-sheet.html`);
  await waitReady(page, 'h1.hub-jobs-hero');
  await page.screenshot({ path: join(ART, '390-sheet.png'), type: 'png', fullPage: true, animations: 'disabled' });
  const { context: mockCtx, page: mockPage } = await open(
    390,
    `http://127.0.0.1:${mockPort}/directions/4-dark-light/html/job-390-light.html`,
  );
  await waitReady(mockPage, 'h1.h1');
  await mockPage.screenshot({ path: join(ART, '390-mockup.png'), type: 'png', fullPage: true, animations: 'disabled' });
  const slices = await compositeSlices(
    page,
    readFileSync(join(ART, '390-mockup.png')),
    readFileSync(join(ART, '390-sheet.png')),
    844,
  );
  writeFileSync(join(ART, 'vp-01.png'), Buffer.from(slices['vp-01'], 'base64'));
  writeFileSync(join(ART, 'vp-02.png'), Buffer.from(slices['vp-02'], 'base64'));
  writeFileSync(join(ART, 'vp-03.png'), Buffer.from(slices['vp-03'], 'base64'));
  await mockCtx.close();
  await context.close();
}

{
  const { context, page } = await open(390, `${previewBase}/p3-r11-empty-bill.html`);
  await waitReady(page, 'h1.hub-jobs-hero');
  await page.evaluate(() => {
    document.querySelector('[data-job-sheet="bill"]')?.scrollIntoView({ block: 'start' });
  });
  await page.screenshot({ path: join(ART, 'bill-empty.png'), type: 'png', animations: 'disabled' });
  await context.close();
}

{
  const { context, page } = await open(390, `${previewBase}/p3-r11-sheet.html`);
  await waitReady(page, 'h1.hub-jobs-hero');
  await page.click('[data-job-sheet="actions"] > summary');
  await page.waitForSelector('[data-job-action="details"]', { state: 'visible', timeout: 10000 });
  await page.evaluate(() => {
    document.querySelector('[data-job-sheet="actions"]')?.scrollIntoView({ block: 'center' });
  });
  await page.screenshot({ path: join(ART, 'actions.png'), type: 'png', animations: 'disabled' });
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
    const { context, page } = await open(width, `${previewBase}/p3-r11-list.html`, width <= 430 ? 844 : 900);
    await waitReady(page, '.hub-jobs-list-whisper');
    overflow.push({ width, mode: 'VIEW', surface: 'list', ...(await page.evaluate(measure)) });
    await page.click('[data-jobs-new="1"]');
    await page.waitForSelector('[data-job-form="1"]', { timeout: 15000 });
    overflow.push({ width, mode: 'EDIT', surface: 'form', ...(await page.evaluate(measure)) });
    await context.close();
    const sheet = await open(width, `${previewBase}/p3-r11-sheet.html`, width <= 430 ? 844 : 900);
    await waitReady(sheet.page, 'h1.hub-jobs-hero');
    overflow.push({ width, mode: 'VIEW', surface: 'sheet', ...(await sheet.page.evaluate(measure)) });
    await sheet.page.click('[data-job-sheet="actions"] > summary');
    await sheet.page.click('[data-job-action="details"]');
    await sheet.page.waitForSelector('[data-job-form="1"]', { timeout: 15000 });
    overflow.push({ width, mode: 'EDIT', surface: 'sheet', ...(await sheet.page.evaluate(measure)) });
    await sheet.context.close();
  }
  writeFileSync(join(ART, 'overflow.json'), JSON.stringify(overflow, null, 2));
}

await browser.close();
preview.kill('SIGTERM');
mockServer.close();
rmSync(harnessJs, { force: true });
for (const name of Object.keys(htmlFiles)) rmSync(join(root, 'dist', name), { force: true });
rmSync(mockRoot, { recursive: true, force: true });
console.log(`wrote ${ART}`);
process.exit(0);
