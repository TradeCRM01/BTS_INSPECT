/**
 * @vitest-environment node
 *
 * Chromium kills over the built dist CSS and a real AppShell client mount.
 * gates.sh runs this file after build + vitest. Filename omits `.test.` so the default include misses it.
 *
 * Painted values only: computed background-color on the header, tab bar, and avatar.
 * Reading a CSS variable never counts.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild') as {
  build: (opts: Record<string, unknown>) => Promise<{ outputFiles?: Array<{ text: string }> }>;
};

const here = dirname(fileURLToPath(import.meta.url));
const N53 = 'Northside Plumbing & Gas Maintenance Services Pty Ltd';
const SHORT = 'Acme';
const LOUD = { navy: '#FF0000', accent: '#00FF00', accentLight: '#00FF00', navyLight: '#FF0000' };
const SHORTS = ['Today', 'Jobs', 'Field', 'Money', 'Stock'];

type KillPage = {
  goto: (url: string) => Promise<unknown>;
  evaluate: <T>(fn: () => T) => Promise<T>;
  emulateMedia: (opts: { colorScheme?: 'dark' | 'light' | 'no-preference' }) => Promise<void>;
  waitForSelector: (sel: string, opts?: { timeout?: number }) => Promise<unknown>;
  close: () => Promise<void>;
};

async function launchBrowser() {
  const chromeCandidates = [
    process.env.CHROME_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    '/usr/bin/google-chrome',
    '/usr/local/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter((path): path is string => !!path && existsSync(path));
  const executablePath = chromeCandidates[0];
  const errors: string[] = [];
  for (const spec of ['playwright', 'playwright-core']) {
    try {
      const mod = await import(spec) as {
        chromium: {
          launch: (opts: { headless: boolean; executablePath?: string; args?: string[] }) => Promise<{
            newPage: (opts?: { viewport?: { width: number; height: number } }) => Promise<KillPage>;
            close: () => Promise<void>;
          }>;
        };
      };
      return await mod.chromium.launch({
        headless: true,
        executablePath,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });
    } catch (err) {
      errors.push(`${spec}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`chromium launch failed: ${errors.join('; ')}`);
}

function readDistCss(): string {
  const dir = join(process.cwd(), 'dist/assets');
  if (!existsSync(dir)) throw new Error('dist/assets missing; run npm run build');
  const files = readdirSync(dir).filter((name) => name.endsWith('.css'));
  if (!files.length) throw new Error('no dist CSS; run npm run build');
  return files.map((name) => readFileSync(join(dir, name), 'utf8')).join('\n');
}

async function bundleShell(): Promise<string> {
  const mocks = join(here, 's2Shell.chromium.mocks.ts');
  const result = await esbuild.build({
    absWorkingDir: process.cwd(),
    entryPoints: [join(here, 's2Shell.chromium.entry.tsx')],
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
    plugins: [{
      name: 's2-shell-mocks',
      setup(build: {
        onResolve: (
          opts: { filter: RegExp },
          cb: (args: { path: string }) => { path: string; namespace: string } | null,
        ) => void;
      }) {
        build.onResolve({ filter: /(?:AuthContext|useCompanyAiKey|DevConsole|GlobalSearch|\/lib\/supabase)$/ }, (args) => {
          const spec = args.path.replace(/\\/g, '/');
          if (/AuthContext$/.test(spec)) return { path: mocks, namespace: 'file' };
          if (/useCompanyAiKey$/.test(spec)) return { path: mocks, namespace: 'file' };
          if (/DevConsole$/.test(spec)) return { path: mocks, namespace: 'file' };
          if (/GlobalSearch$/.test(spec)) return { path: mocks, namespace: 'file' };
          if (/\/lib\/supabase$/.test(spec)) return { path: mocks, namespace: 'file' };
          return null;
        });
      },
    }],
  });
  const file = result.outputFiles?.[0];
  if (!file) throw new Error('esbuild produced no shell bundle');
  return file.text;
}

function fixtureHtml(args: {
  js: string;
  css: string;
  theme: 'light' | 'dark';
  allowDark: boolean;
  reportTheme: Record<string, string> | null;
  companyName: string;
}): string {
  const allow = args.allowDark ? 'true' : 'false';
  const cfg = JSON.stringify({
    reportTheme: args.reportTheme,
    companyName: args.companyName,
  });
  return `<!doctype html>
<html data-theme="${args.theme}" data-allow-dark="${allow}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>${args.css}</style>
</head>
<body>
<div id="root"></div>
<script>window.__S2_SHELL__ = ${cfg};</script>
<script>${args.js}</script>
</body>
</html>`;
}

function isLoud(c: string): boolean {
  return /rgb\(\s*255,\s*0,\s*0\s*\)/.test(c)
    || /rgb\(\s*0,\s*255,\s*0\s*\)/.test(c)
    || /#ff0000/i.test(c)
    || /#00ff00/i.test(c);
}

type Paint = {
  headerBg: string;
  tabBg: string;
  avatarBg: string;
  bodyBg: string;
};

function paintScript(): Paint {
  const bg = (el: Element | null) => (el ? getComputedStyle(el as HTMLElement).backgroundColor : '');
  return {
    headerBg: bg(document.querySelector('.shell-header')),
    tabBg: bg(document.querySelector('.shell-bottom-nav')),
    avatarBg: bg(document.querySelector('[data-shell-switcher-avatar]')),
    bodyBg: bg(document.querySelector('.shell-root')) || getComputedStyle(document.body).backgroundColor,
  };
}

let browser: Awaited<ReturnType<typeof launchBrowser>>;
let distCss = '';
let shellJs = '';
const temps: string[] = [];

beforeAll(async () => {
  distCss = readDistCss();
  shellJs = await bundleShell();
  browser = await launchBrowser();
}, 120000);

afterAll(async () => {
  await browser?.close();
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

async function openPage(args: {
  reportTheme: Record<string, string> | null;
  width: number;
  theme?: 'light' | 'dark';
  allowDark?: boolean;
  colorScheme?: 'dark' | 'light' | 'no-preference';
  companyName?: string;
}): Promise<{ page: KillPage; paint: Paint }> {
  const html = fixtureHtml({
    js: shellJs,
    css: distCss,
    theme: args.theme ?? 'light',
    allowDark: args.allowDark ?? false,
    reportTheme: args.reportTheme,
    companyName: args.companyName ?? N53,
  });
  const dir = mkdtempSync(join(tmpdir(), 's2-shell-'));
  temps.push(dir);
  const file = join(dir, 't.html');
  writeFileSync(file, html);
  const page = await browser.newPage({ viewport: { width: args.width, height: 844 } });
  if (args.colorScheme) await page.emulateMedia({ colorScheme: args.colorScheme });
  await page.goto(pathToFileURL(file).href);
  await page.waitForSelector('.shell-header', { timeout: 15000 });
  const paint = await page.evaluate(paintScript);
  return { page, paint };
}

describe('S2 shell chromium kills (built dist CSS, painted values only)', () => {
  it('B1: header, tab bar (390) and avatar background-color stay identical for loud report_theme vs null', async () => {
    const plain390 = await openPage({ reportTheme: null, width: 390 });
    const loud390 = await openPage({ reportTheme: LOUD, width: 390 });
    expect(loud390.paint.headerBg).toBe(plain390.paint.headerBg);
    expect(loud390.paint.tabBg).toBe(plain390.paint.tabBg);
    expect(isLoud(loud390.paint.headerBg)).toBe(false);
    expect(isLoud(loud390.paint.tabBg)).toBe(false);
    await plain390.page.close();
    await loud390.page.close();

    const plain1280 = await openPage({ reportTheme: null, width: 1280 });
    const loud1280 = await openPage({ reportTheme: LOUD, width: 1280 });
    expect(loud1280.paint.headerBg).toBe(plain1280.paint.headerBg);
    expect(loud1280.paint.avatarBg).toBe(plain1280.paint.avatarBg);
    expect(isLoud(loud1280.paint.headerBg)).toBe(false);
    expect(isLoud(loud1280.paint.avatarBg)).toBe(false);
    await plain1280.page.close();
    await loud1280.page.close();
  }, 60000);

  it('S1: data-theme=dark with allowDark false changes 0px on header, tab bar and body', async () => {
    const light = await openPage({ reportTheme: null, width: 390, theme: 'light', allowDark: false });
    const forced = await openPage({ reportTheme: null, width: 390, theme: 'dark', allowDark: false });
    expect(forced.paint.headerBg).toBe(light.paint.headerBg);
    expect(forced.paint.tabBg).toBe(light.paint.tabBg);
    expect(forced.paint.bodyBg).toBe(light.paint.bodyBg);
    await light.page.close();
    await forced.page.close();

    const lightDesk = await openPage({ reportTheme: null, width: 1280, theme: 'light', allowDark: false });
    const forcedDesk = await openPage({ reportTheme: null, width: 1280, theme: 'dark', allowDark: false });
    expect(forcedDesk.paint.headerBg).toBe(lightDesk.paint.headerBg);
    expect(forcedDesk.paint.bodyBg).toBe(lightDesk.paint.bodyBg);
    await lightDesk.page.close();
    await forcedDesk.page.close();
  }, 60000);

  it('S2: prefers-color-scheme dark with allowDark and followSystem false changes 0px', async () => {
    const light = await openPage({ reportTheme: null, width: 390, colorScheme: 'light' });
    const darkMq = await openPage({ reportTheme: null, width: 390, colorScheme: 'dark' });
    expect(darkMq.paint.headerBg).toBe(light.paint.headerBg);
    expect(darkMq.paint.tabBg).toBe(light.paint.tabBg);
    expect(darkMq.paint.bodyBg).toBe(light.paint.bodyBg);
    await light.page.close();
    await darkMq.page.close();
  }, 60000);

  it('S3: short labels are visible and full labels hidden at 768, 900 and 1023', async () => {
    for (const width of [768, 900, 1023]) {
      const { page } = await openPage({ reportTheme: null, width });
      const labels = await page.evaluate(() => {
        const vis = (el: Element) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el as HTMLElement);
          return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
        };
        const shorts = [...document.querySelectorAll('.shell-nav-label-short')].filter(vis).map((el) => (el.textContent || '').trim());
        const fulls = [...document.querySelectorAll('.shell-nav-label-full')].filter(vis).map((el) => (el.textContent || '').trim());
        const nav = document.querySelector('.shell-header nav');
        const nr = nav ? nav.getBoundingClientRect() : null;
        return {
          shorts,
          fulls,
          navVisible: !!(nr && nr.width > 0 && nr.height > 0),
        };
      });
      expect(labels.navVisible, `nav visible at ${width}`).toBe(true);
      expect(labels.shorts, `shorts at ${width}`).toEqual(SHORTS);
      expect(labels.fulls, `fulls hidden at ${width}`).toEqual([]);
      await page.close();
    }
  }, 60000);

  it('S4: 53-char name to chevron gap is 8px at 768 and 1280', async () => {
    for (const width of [768, 1280]) {
      const longPage = await openPage({ reportTheme: null, width, companyName: N53 });
      const longBox = await longPage.page.evaluate(() => {
        const name = document.querySelector('[data-shell-switcher-name]') as HTMLElement | null;
        const chev = document.querySelector('[data-shell-switcher-chevron]') as HTMLElement | null;
        if (!name || !chev) return null;
        const nr = name.getBoundingClientRect();
        const cr = chev.getBoundingClientRect();
        return {
          gap: +(cr.left - nr.right).toFixed(2),
          nameW: +nr.width.toFixed(2),
        };
      });
      expect(longBox, `switcher at ${width}`).not.toBeNull();
      expect(Math.abs(longBox!.gap - 8), `gap at ${width}`).toBeLessThanOrEqual(1);
      await longPage.page.close();

      const shortPage = await openPage({ reportTheme: null, width, companyName: SHORT });
      const shortBox = await shortPage.page.evaluate(() => {
        const name = document.querySelector('[data-shell-switcher-name]') as HTMLElement | null;
        if (!name) return null;
        return { nameW: +name.getBoundingClientRect().width.toFixed(2) };
      });
      expect(shortBox, `short name at ${width}`).not.toBeNull();
      expect(shortBox!.nameW, `w-fit short name at ${width}`).toBeLessThan(80);
      expect(shortBox!.nameW, `short name has a box at ${width}`).toBeGreaterThan(8);
      await shortPage.page.close();
    }
  }, 60000);
});
