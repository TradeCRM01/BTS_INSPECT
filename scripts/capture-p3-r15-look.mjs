// P3 r15 LOOK frames: job page BEFORE (r14) / AFTER (r15) at 375 and 390.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const phase = process.env.P3_R15_PHASE || 'after';
if (phase !== 'before' && phase !== 'after') throw new Error('P3_R15_PHASE must be before|after');
const ART = process.env.P3_R15_OUT || '/opt/cursor/artifacts/p3-r15';
const REPO_ART = join(root, 'artifacts/p3-r15');
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

for (const dir of [ART, REPO_ART]) mkdirSync(dir, { recursive: true });

const cssFile = readdirSync(join(root, 'dist/assets')).find((name) => name.endsWith('.css'));
if (!cssFile) throw new Error('dist CSS missing; run npm run build');

const harnessJs = join(root, 'dist/p3-r15-harness.js');
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
<script src="/p3-r15-harness.js"></script>
</body>
</html>`;
}

const htmlName = 'p3-r15-sheet.html';
writeFileSync(join(root, 'dist', htmlName), pageHtml('/jobs/p3-0036'));

const preview = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', '4174', '--strictPort'], {
  cwd: root,
  stdio: 'pipe',
});
const previewBase = 'http://127.0.0.1:4174';
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('vite preview did not start')), 20000);
  const onData = (buf) => {
    const text = String(buf);
    if (/Local:|4174/.test(text)) {
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

async function open(width, height = width <= 430 ? 844 : 1100) {
  const context = await browser.newContext({
    viewport: { width, height },
    timezoneId: 'Australia/Brisbane',
  });
  const page = await context.newPage();
  await page.goto(`${previewBase}/${htmlName}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1.hub-jobs-hero', { timeout: 30000, state: 'attached' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  return { context, page };
}

function writeBoth(name, buf) {
  writeFileSync(join(ART, name), buf);
  writeFileSync(join(REPO_ART, name), buf);
}

const measureType = () => {
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const hero = document.querySelector('h1.hub-jobs-hero');
  const label = document.querySelector('[data-job-sheet="kv-site"] .job-sheet-kv-label');
  const values = [...document.querySelectorAll('.job-sheet-kv-row > .job-sheet-kv-value')];
  const scopeH = document.querySelector('.job-sheet-scope-h');
  const notesH = document.querySelector('[data-job-sheet="notes"] h2');
  const cta = document.querySelector('[data-job-sheet="cta"]');
  const tabs = [...document.querySelectorAll('.job-sheet-tab')];
  const on = tabs.find((tab) => tab.classList.contains('is-on'));
  const off = tabs.find((tab) => !tab.classList.contains('is-on'));
  const vis = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
  const els = [...document.querySelectorAll('body *')].filter(vis);
  const rights = els.map((el) => el.getBoundingClientRect().right);
  let titleLines = 0;
  if (hero) {
    const range = document.createRange();
    range.selectNodeContents(hero);
    titleLines = new Set([...range.getClientRects()].map((box) => Math.round(box.top))).size;
  }
  return {
    titleLines,
    titleY: hero ? hero.getBoundingClientRect().top : -1,
    ctaY: cta ? cta.getBoundingClientRect().top : -1,
    tabWidths: tabs.map((tab) => tab.getBoundingClientRect().width),
    innerWidth: window.innerWidth,
    titleSize: hero ? parseFloat(cs(hero).fontSize) : -1,
    titleLh: hero ? parseFloat(cs(hero).lineHeight) : -1,
    titleWeight: hero ? cs(hero).fontWeight : '',
    kvLabelSize: label ? parseFloat(cs(label).fontSize) : -1,
    kvLabelLh: label ? parseFloat(cs(label).lineHeight) : -1,
    kvLabelWeight: label ? cs(label).fontWeight : '',
    kvValueWeights: values.map((el) => cs(el).fontWeight),
    kvValueSize: values[0] ? parseFloat(cs(values[0]).fontSize) : -1,
    kvValueLh: values[0] ? parseFloat(cs(values[0]).lineHeight) : -1,
    scopeHSize: scopeH ? parseFloat(cs(scopeH).fontSize) : -1,
    scopeHLh: scopeH ? parseFloat(cs(scopeH).lineHeight) : -1,
    scopeHWeight: scopeH ? cs(scopeH).fontWeight : '',
    notesHSize: notesH ? parseFloat(cs(notesH).fontSize) : -1,
    notesHLh: notesH ? parseFloat(cs(notesH).lineHeight) : -1,
    notesHWeight: notesH ? cs(notesH).fontWeight : '',
    ctaSize: cta ? parseFloat(cs(cta).fontSize) : -1,
    ctaLh: cta ? parseFloat(cs(cta).lineHeight) : -1,
    ctaWeight: cta ? cs(cta).fontWeight : '',
    tabOnWeight: on ? cs(on).fontWeight : '',
    tabOffWeight: off ? cs(off).fontWeight : '',
    tabOnSize: on ? parseFloat(cs(on).fontSize) : -1,
    tabOffSize: off ? parseFloat(cs(off).fontSize) : -1,
    tabOnLh: on ? parseFloat(cs(on).lineHeight) : -1,
    tabOffLh: off ? parseFloat(cs(off).lineHeight) : -1,
    tabCols: document.querySelector('.job-sheet-tabs')
      ? getComputedStyle(document.querySelector('.job-sheet-tabs')).gridTemplateColumns.split(' ').filter(Boolean).length
      : 0,
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    maxRight: rights.length ? Math.max(...rights) : 0,
  };
};

const typeByWidth = {};
for (const width of [375, 390, 1024, 1280]) {
  const { context, page } = await open(width, width <= 430 ? 1600 : 1100);
  typeByWidth[width] = await page.evaluate(measureType);
  if (width === 375 || width === 390) {
    const full = await page.screenshot({ type: 'png', animations: 'disabled', fullPage: true });
    writeBoth(`${phase}-${width}-full.png`, full);
    const head = await page.evaluate(() => {
      const els = [
        document.querySelector('.job-sheet-appbar'),
        document.querySelector('.job-sheet-head'),
        document.querySelector('.job-sheet-tabs'),
        document.querySelector('[data-job-sheet="kv"]'),
      ].filter(Boolean);
      const boxes = els.map((el) => el.getBoundingClientRect());
      return {
        x: Math.max(0, Math.floor(Math.min(...boxes.map((b) => b.left)))),
        y: Math.max(0, Math.floor(Math.min(...boxes.map((b) => b.top)))),
        right: Math.ceil(Math.max(...boxes.map((b) => b.right))),
        bottom: Math.ceil(Math.max(...boxes.map((b) => b.bottom))),
        innerW: window.innerWidth,
        innerH: window.innerHeight,
      };
    });
    const clip = {
      x: head.x,
      y: head.y,
      width: Math.max(1, Math.min(head.innerW - head.x, head.right - head.x)),
      height: Math.max(1, Math.min(head.innerH - head.y, head.bottom - head.y)),
    };
    const crop = await page.screenshot({ type: 'png', animations: 'disabled', clip });
    writeBoth(`${phase}-${width}-header.png`, crop);
  }
  if (width === 1024 || width === 1280) {
    const full = await page.screenshot({ type: 'png', animations: 'disabled', fullPage: true });
    writeBoth(`${phase}-${width}-full.png`, full);
  }
  await context.close();
}

writeBoth(`${phase}-type.json`, Buffer.from(JSON.stringify(typeByWidth, null, 2)));

await browser.close();
preview.kill('SIGTERM');
rmSync(harnessJs, { force: true });
rmSync(join(root, 'dist', htmlName), { force: true });
console.log(`wrote ${phase} frames to ${ART} and ${REPO_ART}`);
console.log(JSON.stringify(typeByWidth, null, 2));
process.exit(0);
