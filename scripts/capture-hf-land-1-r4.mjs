/**
 * HF-LAND-1 r4 LOOK frames. isMobile:false. Jammy Playwright 1.48.2.
 * Landing + Today at 390, inset 0 and standalone 47, Chromium + WebKit.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const { chromium, webkit } = await import('playwright');

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDirs = [join(root, 'artifacts/hf-land-1-r4')];
if (existsSync('/opt/cursor/artifacts')) outDirs.push('/opt/cursor/artifacts/hf-land-1-r4');
for (const dir of outDirs) mkdirSync(dir, { recursive: true });

function readDistCss() {
  const dir = join(root, 'dist/assets');
  return readdirSync(dir).filter((n) => n.endsWith('.css')).map((n) => readFileSync(join(dir, n), 'utf8')).join('\n');
}
function rewrite(css, top, bottom) {
  return css
    .replace(/env\(\s*safe-area-inset-top(?:\s*,\s*[^)]+)?\s*\)/g, `${top}px`)
    .replace(/env\(\s*safe-area-inset-bottom(?:\s*,\s*[^)]+)?\s*\)/g, `${bottom}px`);
}
async function bundle(entry, mocks) {
  const result = await esbuild.build({
    absWorkingDir: root,
    entryPoints: [entry],
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
      'import.meta.env.VITE_SUPABASE_URL': '"https://example.supabase.co"',
      'import.meta.env.VITE_SUPABASE_ANON_KEY': '"test-anon-key"',
    },
    plugins: mocks ? [{
      name: 'm',
      setup(build) {
        build.onResolve({ filter: /(?:AuthContext|useCompanyAiKey|DevConsole|\/lib\/supabase)$/ }, (args) => {
          const spec = args.path.replace(/\\/g, '/');
          if (/AuthContext$/.test(spec) || /useCompanyAiKey$/.test(spec) || /DevConsole$/.test(spec) || /\/lib\/supabase$/.test(spec)) {
            return { path: mocks, namespace: 'file' };
          }
          return null;
        });
      },
    }] : [],
  });
  return result.outputFiles[0].text;
}

const distCss = readDistCss();
const landingJs = await bundle(join(root, 'src/pages/hfLand1.landing.entry.tsx'));
const shellJs = await bundle(
  join(root, 'src/pages/hfLand1.shell.entry.tsx'),
  join(root, 'src/components/layout/s2Shell.chromium.mocks.ts'),
);
const geistSrc = join(root, 'public/fonts/Geist-Variable.woff2');
const serveRoot = mkdtempSync(join(tmpdir(), 'hf-r4-srv-'));
copyFileSync(geistSrc, join(serveRoot, 'Geist-Variable.woff2'));
const origin = await new Promise((resolve, reject) => {
  const server = createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname).replace(/^\/+/, '');
    const file = rel.endsWith('Geist-Variable.woff2') ? geistSrc : join(serveRoot, rel);
    if ((!rel.endsWith('Geist-Variable.woff2') && !file.startsWith(serveRoot)) || !existsSync(file) || !statSync(file).isFile()) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader('Content-Type', file.endsWith('.woff2') ? 'font/woff2' : 'text/html; charset=utf-8');
    res.end(readFileSync(file));
  });
  server.listen(0, '127.0.0.1', () => {
    const addr = server.address();
    resolve(`http://127.0.0.1:${addr.port}`);
  });
  server.on('error', reject);
});

const shots = [
  { name: 'landing-390-inset0', kind: 'landing', standalone: false },
  { name: 'landing-390-standalone47', kind: 'landing', standalone: true },
  { name: 'today-390-inset0', kind: 'today', standalone: false },
  { name: 'today-390-standalone47', kind: 'today', standalone: true },
];

for (const engineName of ['chromium', 'webkit']) {
  const browser = await (engineName === 'webkit' ? webkit : chromium).launch({
    headless: true,
    ...(engineName === 'chromium' ? { args: ['--no-sandbox', '--disable-dev-shm-usage'] } : {}),
  });
  for (const shot of shots) {
    const css = shot.standalone ? rewrite(distCss, 47, 34) : distCss;
    const id = `${engineName}-${shot.name}`;
    const dir = join(serveRoot, id);
    mkdirSync(dir, { recursive: true });
    const js = shot.kind === 'today' ? shellJs : landingJs;
    const ready = shot.kind === 'today' ? '.shell-header' : 'h1.hub-marketing-display';
    writeFileSync(join(dir, 't.html'), `<!doctype html><html lang="en-AU"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" /><style>@font-face{font-family:'Geist';src:url('/fonts/Geist-Variable.woff2') format('woff2');font-weight:100 900;font-style:normal;font-display:block}html,body{font-family:'Geist',sans-serif}</style><style>${css}</style></head><body><div id="root"></div><script>window.__S2_SHELL__={reportTheme:null,companyName:'Northside Plumbing & Gas Maintenance Services Pty Ltd'};</script><script>${js}</script></body></html>`);
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: false,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    if (shot.standalone) {
      await page.addInitScript(() => {
        const orig = window.matchMedia.bind(window);
        window.matchMedia = ((q) => {
          if (String(q).includes('display-mode: standalone')) {
            return { matches: true, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } };
          }
          return orig(q);
        });
      });
    }
    await page.goto(`${origin}/${id}/t.html`);
    await page.waitForSelector(ready, { timeout: 15000 });
    if (shot.kind === 'today') {
      await page.click('[data-phone-tab="today"]');
    }
    const geistOk = await page.evaluate(async () => {
      await document.fonts.ready;
      await document.fonts.load('16px Geist');
      return document.fonts.check('16px Geist');
    });
    if (!geistOk) throw new Error(`Geist failed to load for ${engineName} ${shot.name}`);
    const buf = await page.screenshot({ type: 'png', fullPage: false });
    for (const out of outDirs) {
      const dest = join(out, `${engineName}-${shot.name}.png`);
      writeFileSync(dest, buf);
      console.log(dest);
    }
    await context.close();
  }
  await browser.close();
}
process.exit(0);
