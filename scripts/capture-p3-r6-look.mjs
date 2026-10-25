// r6 LOOK frames from the real JobDetailPage kill bundle + dist CSS.
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = process.env.P3_R6_OUT || '/opt/cursor/artifacts/p3-r6';
mkdirSync(OUT, { recursive: true });

const chromeCandidates = [
  process.env.CHROME_PATH,
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome',
  '/usr/local/bin/google-chrome',
  '/usr/bin/chromium',
].filter((path) => path && existsSync(path));

function distCss() {
  const dir = join(root, 'dist/assets');
  return readdirSync(dir).filter((n) => n.endsWith('.css'))
    .map((n) => readFileSync(join(dir, n), 'utf8')).join('\n');
}

async function bundleJobs() {
  const mocks = join(root, 'src/pages/p3Jobs.chromium.mocks.ts');
  const result = await esbuild.build({
    absWorkingDir: root,
    entryPoints: [join(root, 'src/pages/p3Jobs.chromium.entry.tsx')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    write: false,
    logLevel: 'silent',
    define: {
      'process.env.NODE_ENV': '"test"',
      'import.meta.env.MODE': '"test"',
      'import.meta.env.DEV': 'false',
      'import.meta.env.PROD': 'true',
      'import.meta.env.SSR': 'false',
      'import.meta.env.VITE_LOOK_PROOF': '"1"',
      'import.meta.env.VITE_SUPABASE_URL': '"https://example.supabase.co"',
      'import.meta.env.VITE_SUPABASE_ANON_KEY': '"test-anon-key"',
    },
    plugins: [{
      name: 'p3-jobs-mocks',
      setup(build) {
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
  return result.outputFiles[0].text;
}

function fixtureHtml(js, css, path) {
  return `<!doctype html>
<html data-theme="light" data-allow-dark="false">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<style>${css}</style></head>
<body><div id="root"></div>
<script>window.__P3__ = ${JSON.stringify({ path, empty: false, clientsError: false, extrasError: false })};</script>
<script>${js}</script>
</body></html>`;
}

function mockupHtml() {
  const raw = readFileSync('/home/ubuntu/.cursor/projects/workspace/uploads/job-390-light_b80c.html', 'utf8');
  const tokens = `<style>
:root{--fs-34:34px;--fs-20:20px;--fs-17:17px;--fs-16:16px;--fs-15:15px;--fs-14:14px;--fs-13:13px;--fs-12:12px;--ink:#111;--text-2:#5B6570;--muted:#8a8174;--line:#e6e1d8;--line-strong:#cfc8bc;--surface-2:#eeeae3;--r-control:10px}
html,body{margin:0;padding:0;background:#fff;color:#111;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif}
body{padding-bottom:120px}
.appbar{display:flex;align-items:center;gap:8px;min-height:44px;padding:4px 16px}
.appbar .back{display:inline-flex;align-items:center;gap:2px;margin-right:auto;color:#111;text-decoration:none;font-size:16px}
.icon-btn{border:none;background:none;min-width:44px;min-height:44px}
.av{width:36px;height:36px;border-radius:999px;background:#eeeae3;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:12px}
.eyebrow{font-size:13px;font-weight:500}
.pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:13px;font-weight:600}
.pill.ok{color:#0E5A2C;background:#E3F2E8}
.pill.ok::before{content:'';width:8px;height:8px;border-radius:999px;background:#3d8b4a}
.btn,.btn-primary{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:#111;color:#fff;border:none;border-radius:12px;text-decoration:none;font-weight:600}
.segc{display:grid;grid-template-columns:repeat(4,1fr);background:#eeeae3;border-radius:12px;padding:3px}
.segc a{min-height:44px;display:flex;align-items:center;justify-content:center;text-decoration:none;color:#5B6570;font-size:15px}
.segc a[aria-current]{background:#fff;color:#111;font-weight:600;border-radius:10px}
.kv{display:grid;grid-template-columns:72px 1fr auto;gap:4px 12px;padding:10px 0;border-bottom:1px solid #e6e1d8;align-items:center}
.kv dt{grid-column:1;color:#8a8174;font-size:13px}
.kv dd{grid-column:2;margin:0;font-size:16px}
.tabbar{position:fixed;bottom:0;left:0;right:0;display:flex;justify-content:space-around;background:#fff;border-top:1px solid #e6e1d8}
.tab{display:flex;flex-direction:column;align-items:center;font-size:11px;color:#5B6570;text-decoration:none;padding:8px}
</style>`;
  return raw.replace('</head>', `${tokens}</head>`);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: chromeCandidates[0],
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const css = distCss();
const js = await bundleJobs();
const tmp = join(tmpdir(), 'p3-r6.html');

async function openPath(width, path, height = width <= 430 ? 844 : 900) {
  writeFileSync(tmp, fixtureHtml(js, css, path));
  const context = await browser.newContext({
    viewport: { width, height },
    timezoneId: 'Australia/Brisbane',
  });
  const page = await context.newPage();
  await page.goto(pathToFileURL(tmp).href);
  await page.waitForSelector('#root', { timeout: 20000 });
  return { page, context };
}

async function waitSheet(page) {
  await page.waitForSelector('h1.hub-jobs-hero', { timeout: 20000 });
  await page.waitForTimeout(200);
}

async function waitList(page) {
  await page.waitForSelector('.hub-jobs-list-whisper', { timeout: 20000 });
  await page.waitForTimeout(200);
}

const sheet390 = await openPath(390, '/jobs/p3-0036');
await waitSheet(sheet390.page);
await sheet390.page.screenshot({ path: join(OUT, '390-sheet.png'), type: 'png', fullPage: true, animations: 'disabled' });
await sheet390.context.close();

const list390 = await openPath(390, '/jobs');
await waitList(list390.page);
await list390.page.screenshot({ path: join(OUT, '390-list.png'), type: 'png', fullPage: true, animations: 'disabled' });
await list390.context.close();

const sheet1280 = await openPath(1280, '/jobs/p3-0036', 900);
await waitSheet(sheet1280.page);
await sheet1280.page.screenshot({ path: join(OUT, '1280-sheet.png'), type: 'png', fullPage: true, animations: 'disabled' });
await sheet1280.context.close();

const edit390 = await openPath(390, '/jobs');
await waitList(edit390.page);
await edit390.page.click('[data-jobs-new="1"]');
await edit390.page.waitForSelector('[data-job-form="1"]', { timeout: 15000 });
await edit390.page.waitForTimeout(200);
await edit390.page.screenshot({ path: join(OUT, '390-edit.png'), type: 'png', fullPage: true, animations: 'disabled' });
await edit390.context.close();

const mockFile = join(tmpdir(), 'p3-r6-mock.html');
writeFileSync(mockFile, mockupHtml());
const mockCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Australia/Brisbane' });
const mockPage = await mockCtx.newPage();
await mockPage.goto(pathToFileURL(mockFile).href);
await mockPage.waitForTimeout(200);
await mockPage.screenshot({ path: join(OUT, '390-mockup.png'), type: 'png', fullPage: true, animations: 'disabled' });
await mockCtx.close();

const vs = await browser.newContext({ viewport: { width: 800, height: 900 } });
const vsPage = await vs.newPage();
const left = readFileSync(join(OUT, '390-mockup.png')).toString('base64');
const right = readFileSync(join(OUT, '390-sheet.png')).toString('base64');
await vsPage.setContent(`<!doctype html><html><body style="margin:0;background:#111;display:flex">
<div style="flex:1;background:#fff"><img src="data:image/png;base64,${left}" style="width:100%;display:block"/></div>
<div style="flex:1;background:#fff"><img src="data:image/png;base64,${right}" style="width:100%;display:block"/></div>
</body></html>`);
await vsPage.waitForTimeout(100);
await vsPage.screenshot({ path: join(OUT, '390-sheet-vs-mockup.png'), type: 'png', fullPage: true, animations: 'disabled' });
await vs.close();

await browser.close();
console.log(`wrote ${OUT}`);
