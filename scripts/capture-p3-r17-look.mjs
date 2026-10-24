// P3 r17 LOOK frames. isMobile:false for every context (Coach).
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = process.env.P3_R17_OUT || '/opt/cursor/artifacts/p3-r17';
const REPO_ART = join(root, 'artifacts/p3-r17');
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

for (const dir of [ART, REPO_ART]) mkdirSync(dir, { recursive: true });

const cssFile = readdirSync(join(root, 'dist/assets')).find((name) => name.endsWith('.css'));
if (!cssFile) throw new Error('dist CSS missing; run npm run build');

const harnessJs = join(root, 'dist/p3-r17-harness.js');
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
<script src="/p3-r17-harness.js"></script>
</body>
</html>`;
}

writeFileSync(join(root, 'dist', 'p3-r17-sheet.html'), pageHtml('/jobs/p3-0036'));
writeFileSync(join(root, 'dist', 'p3-r17-list.html'), pageHtml('/jobs'));

const preview = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', '4176', '--strictPort'], {
  cwd: root,
  stdio: 'pipe',
});
const previewBase = 'http://127.0.0.1:4176';
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('vite preview did not start')), 20000);
  const onData = (buf) => {
    const text = String(buf);
    if (/Local:|4176/.test(text)) {
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

async function open(html, width, height) {
  const context = await browser.newContext({
    viewport: { width, height },
    timezoneId: 'Australia/Brisbane',
    isMobile: false,
    hasTouch: false,
  });
  const page = await context.newPage();
  await page.goto(`${previewBase}/${html}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#root', { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  return { context, page };
}

function writeBoth(name, buf) {
  writeFileSync(join(ART, name), buf);
  writeFileSync(join(REPO_ART, name), buf);
}

async function waitSheet(page) {
  await page.waitForSelector('h1.hub-jobs-hero', { timeout: 30000, state: 'attached' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function waitList(page) {
  await page.waitForSelector('.hub-jobs-list-whisper', { timeout: 30000, state: 'attached' });
  await page.evaluate(async () => {
    for (let i = 0; i < 80; i += 1) {
      const whisper = (document.querySelector('.hub-jobs-list-whisper')?.textContent || '').trim();
      const rows = document.querySelector('[data-jobs-phone-list]');
      const empty = /No jobs yet/.test(document.body.textContent || '');
      if ((whisper && (rows || empty)) || empty) return;
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
  });
}

const frames = [];

{
  const { context, page } = await open('p3-r17-sheet.html', 1280, 1100);
  await waitSheet(page);
  const buf = await page.screenshot({ type: 'png', animations: 'disabled', fullPage: false });
  writeBoth('r17-sheet-laptop-1280.png', buf);
  frames.push('r17-sheet-laptop-1280.png');
  await context.close();
}

{
  const { context, page } = await open('p3-r17-sheet.html', 390, 844);
  await waitSheet(page);
  const buf = await page.screenshot({ type: 'png', animations: 'disabled', fullPage: false });
  writeBoth('r17-sheet-phone-390.png', buf);
  frames.push('r17-sheet-phone-390.png');
  await context.close();
}

{
  const { context, page } = await open('p3-r17-list.html', 1280, 1100);
  await waitList(page);
  const buf = await page.screenshot({ type: 'png', animations: 'disabled', fullPage: false });
  writeBoth('r17-jobs-laptop-1280.png', buf);
  frames.push('r17-jobs-laptop-1280.png');
  await context.close();
}

{
  const { context, page } = await open('p3-r17-list.html', 390, 844);
  await waitList(page);
  const buf = await page.screenshot({ type: 'png', animations: 'disabled', fullPage: false });
  writeBoth('r17-jobs-phone-390.png', buf);
  frames.push('r17-jobs-phone-390.png');
  await context.close();
}

await browser.close();
preview.kill('SIGTERM');
rmSync(harnessJs, { force: true });
rmSync(join(root, 'dist', 'p3-r17-sheet.html'), { force: true });
rmSync(join(root, 'dist', 'p3-r17-list.html'), { force: true });
console.log(`wrote r17 frames (isMobile:false) to ${ART} and ${REPO_ART}`);
console.log(frames.join('\n'));
