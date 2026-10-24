/**
 * HF-LAND-1 LOOK frames. isMobile:false — WebKit 1.48 blanks isMobile:true.
 * Run on mcr.microsoft.com/playwright:v1.48.2-jammy after npm run build.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const { chromium, webkit } = await import('playwright');

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDirs = [join(root, 'docs/look')];
if (existsSync('/opt/cursor/artifacts')) outDirs.push('/opt/cursor/artifacts');
for (const dir of outDirs) mkdirSync(dir, { recursive: true });

function readDistCss() {
  const dir = join(root, 'dist/assets');
  const files = readdirSync(dir).filter((name) => name.endsWith('.css'));
  return files.map((name) => readFileSync(join(dir, name), 'utf8')).join('\n');
}

function rewriteSafeAreaEnv(css, top, bottom) {
  return css
    .replace(/env\(\s*safe-area-inset-top(?:\s*,\s*[^)]+)?\s*\)/g, `${top}px`)
    .replace(/env\(\s*safe-area-inset-bottom(?:\s*,\s*[^)]+)?\s*\)/g, `${bottom}px`);
}

async function bundle(entry) {
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
  });
  return result.outputFiles[0].text;
}

function html(js, css) {
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" /><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
}

const distCss = readDistCss();
const landingJs = await bundle(join(root, 'src/pages/hfLand1.landing.entry.tsx'));
const shots = [
  { name: 'landing-1280', width: 1280, height: 800, standalone: false, ready: 'h1.hub-marketing-display' },
  { name: 'landing-390', width: 390, height: 844, standalone: false, ready: 'h1.hub-marketing-display' },
  { name: 'landing-390-standalone47', width: 390, height: 844, standalone: true, ready: 'h1.hub-marketing-display' },
];

for (const engineName of ['chromium', 'webkit']) {
  const browser = await (engineName === 'webkit' ? webkit : chromium).launch({
    headless: true,
    ...(engineName === 'chromium' ? { args: ['--no-sandbox', '--disable-dev-shm-usage'] } : {}),
  });
  for (const shot of shots) {
    const css = shot.standalone ? rewriteSafeAreaEnv(distCss, 47, 34) : distCss;
    const file = join(tmpdir(), `hf-land-1-${engineName}-${shot.name}.html`);
    writeFileSync(file, html(landingJs, css));
    const context = await browser.newContext({
      viewport: { width: shot.width, height: shot.height },
      isMobile: false,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    if (shot.standalone) {
      await page.addInitScript(() => {
        const orig = window.matchMedia.bind(window);
        window.matchMedia = ((q) => {
          if (String(q).includes('display-mode: standalone')) {
            return {
              matches: true,
              media: q,
              onchange: null,
              addListener() {},
              removeListener() {},
              addEventListener() {},
              removeEventListener() {},
              dispatchEvent() { return false; },
            };
          }
          return orig(q);
        });
      });
    }
    await page.goto(pathToFileURL(file).href);
    await page.waitForSelector(shot.ready, { timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    const buf = await page.screenshot({ type: 'png', fullPage: false });
    for (const dir of outDirs) {
      const dest = join(dir, `hf-land-1-r3-${engineName}-${shot.name}.png`);
      writeFileSync(dest, buf);
      console.log(dest);
    }
    await context.close();
  }
  await browser.close();
}
