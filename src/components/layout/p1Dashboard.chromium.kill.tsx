/**
 * @vitest-environment node
 *
 * P1 Dashboard/Today Chromium kills over the built dist CSS and a real
 * AppShell + DashboardPage client mount. Filename omits `.test.` so the
 * default include misses it. gates.sh runs this after build + vitest.
 *
 * Painted values only. Reading a CSS variable never counts as a pass.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NAV_WORDS } from '../../lib/brand';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild') as {
  build: (opts: Record<string, unknown>) => Promise<{ outputFiles?: Array<{ text: string }> }>;
};

const here = dirname(fileURLToPath(import.meta.url));
const CREAM = /rgb\(\s*245,\s*240,\s*230\s*\)|#f5f0e6/i;
const WIDTHS = [375, 390, 768, 1024, 1280] as const;
const NAV_WIDTHS = [375, 390, 768, 800, 1023, 1024, 1280] as const;
const SHARED = [
  NAV_WORDS.today,
  NAV_WORDS.jobs,
  NAV_WORDS.field,
  NAV_WORDS.money,
  NAV_WORDS.stock,
  NAV_WORDS.schedule,
  NAV_WORDS.more,
];

type KillPage = {
  goto: (url: string) => Promise<unknown>;
  evaluate: <T>(fn: (() => T | Promise<T>) | ((arg: never) => T | Promise<T>), arg?: unknown) => Promise<T>;
  emulateMedia: (opts: { colorScheme?: 'dark' | 'light' | 'no-preference' }) => Promise<void>;
  waitForSelector: (sel: string, opts?: { timeout?: number }) => Promise<unknown>;
  setViewportSize: (size: { width: number; height: number }) => Promise<void>;
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

async function bundleDashboard(): Promise<string> {
  const mocks = join(here, 's2Shell.chromium.mocks.ts');
  const result = await esbuild.build({
    absWorkingDir: process.cwd(),
    entryPoints: [join(here, 'p1Dashboard.chromium.entry.tsx')],
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
      name: 'p1-dashboard-mocks',
      setup(build: {
        onResolve: (
          opts: { filter: RegExp },
          cb: (args: { path: string }) => { path: string; namespace: string } | null,
        ) => void;
      }) {
        build.onResolve({ filter: /(?:AuthContext|useCompanyAiKey|DevConsole|\/lib\/supabase)$/ }, (args) => {
          const spec = args.path.replace(/\\/g, '/');
          if (/AuthContext$/.test(spec)) return { path: mocks, namespace: 'file' };
          if (/useCompanyAiKey$/.test(spec)) return { path: mocks, namespace: 'file' };
          if (/DevConsole$/.test(spec)) return { path: mocks, namespace: 'file' };
          if (/\/lib\/supabase$/.test(spec)) return { path: mocks, namespace: 'file' };
          return null;
        });
      },
    }],
  });
  const file = result.outputFiles?.[0];
  if (!file) throw new Error('esbuild produced no dashboard bundle');
  return file.text;
}

function fixtureHtml(args: {
  js: string;
  css: string;
  theme: 'light' | 'dark';
  allowDark: boolean;
  path: string;
}): string {
  const allow = args.allowDark ? 'true' : 'false';
  const cfg = JSON.stringify({ path: args.path });
  return `<!doctype html>
<html data-theme="${args.theme}" data-allow-dark="${allow}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>${args.css}</style>
</head>
<body>
<div id="root"></div>
<script>window.__P1__ = ${cfg};</script>
<script>${args.js}</script>
</body>
</html>`;
}

let browser: Awaited<ReturnType<typeof launchBrowser>>;
let distCss = '';
let dashJs = '';
const temps: string[] = [];

beforeAll(async () => {
  distCss = readDistCss();
  dashJs = await bundleDashboard();
  browser = await launchBrowser();
}, 180000);

afterAll(async () => {
  await browser?.close();
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

async function openPage(args: {
  width: number;
  theme?: 'light' | 'dark';
  allowDark?: boolean;
  path?: string;
}): Promise<KillPage> {
  const html = fixtureHtml({
    js: dashJs,
    css: distCss,
    theme: args.theme ?? 'light',
    allowDark: args.allowDark ?? false,
    path: args.path ?? '/?look=dashboard',
  });
  const dir = mkdtempSync(join(tmpdir(), 'p1-dash-'));
  temps.push(dir);
  const file = join(dir, 't.html');
  writeFileSync(file, html);
  const phone = args.width <= 430;
  const page = await browser.newPage({
    viewport: { width: args.width, height: phone ? 844 : 900 },
  });
  await page.goto(pathToFileURL(file).href);
  await page.waitForSelector('.shell-header', { timeout: 20000 });
  return page;
}

function contrastScript() {
  const parse = (c: string) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = (c: { r: number; g: number; b: number }) => {
    const f = (v: number) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const blend = (
    top: { r: number; g: number; b: number; a: number },
    bot: { r: number; g: number; b: number },
  ) => ({
    r: top.r * top.a + bot.r * (1 - top.a),
    g: top.g * top.a + bot.g * (1 - top.a),
    b: top.b * top.a + bot.b * (1 - top.a),
  });
  const usedBg = (el: HTMLElement) => {
    let node: HTMLElement | null = el;
    const stack: Array<{ r: number; g: number; b: number; a: number }> = [];
    while (node) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0) {
        stack.push(c);
        if (c.a >= 1) break;
      }
      node = node.parentElement;
    }
    let out = { r: 255, g: 255, b: 255 };
    while (stack.length) out = blend(stack.pop()!, out);
    return out;
  };
  const ratio = (el: HTMLElement | null) => {
    if (!el) return 0;
    const fg = parse(getComputedStyle(el).color);
    if (!fg) return 0;
    const bg = usedBg(el);
    const fgb = fg.a < 1 ? blend(fg, bg) : fg;
    const x = lum(fgb);
    const y = lum(bg);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const token = (prop: string) => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = `var(${prop})`;
    document.body.appendChild(probe);
    const bg = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return bg;
  };
  const pageEl = document.querySelector('.dashboard-home.ops-page') as HTMLElement | null;
  const cardEl = document.querySelector('[data-dashboard-home="1"]') as HTMLElement | null;
  const secondary = document.querySelector('.dashboard-home.ops-page .dashboard-home-whisper, .dashboard-home.ops-page .dashboard-home-label') as HTMLElement | null;
  const cta = document.querySelector('.dashboard-home.ops-page .dashboard-home-primary') as HTMLElement | null;
  const pill = document.querySelector('.dashboard-home.ops-page .dashboard-home-pill-ok, [data-p1-probe] .dashboard-home-pill-ok') as HTMLElement | null;
  return {
    pageBg: pageEl ? getComputedStyle(pageEl).backgroundColor : '',
    cardBg: cardEl ? getComputedStyle(cardEl).backgroundColor : '',
    tokenBg: token('--g-bg'),
    tokenSurface: token('--g-surface'),
    tokenOk: token('--g-ok'),
    tokenOkBg: token('--g-ok-bg'),
    secondary: ratio(secondary),
    cta: ratio(cta),
    pillFg: pill ? getComputedStyle(pill).color : '',
    pillBg: pill ? getComputedStyle(pill).backgroundColor : '',
  };
}

function overflowScript() {
  const vis = (el: Element) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
  const rights = [...document.querySelectorAll('body *')].filter(vis).map((el) => el.getBoundingClientRect().right);
  return {
    innerWidth: window.innerWidth,
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    maxRight: rights.length ? Math.max(...rights) : 0,
  };
}

function navLabelsScript() {
  const vis = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el as HTMLElement);
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
  const shorts = [...document.querySelectorAll('.shell-nav-label-short')].filter(vis).map((el) => (el.textContent || '').trim());
  const fulls = [...document.querySelectorAll('.shell-nav-label-full')].filter(vis).map((el) => (el.textContent || '').trim());
  const tabs = [...document.querySelectorAll('.shell-bottom-nav [data-phone-tab]')].filter(vis).map((el) => (el.textContent || '').trim());
  const arias = [...document.querySelectorAll('[data-shell-nav-group]')].map((el) => el.getAttribute('aria-label') || '');
  return { shorts, fulls, tabs, arias };
}

describe('P1 dashboard chromium kills (built dist CSS, painted values only)', () => {
  it('P1-schedule: phone Schedule tab reaches /schedule in 1 tap at 375 and 390', async () => {
    for (const width of [375, 390] as const) {
      const page = await openPage({ width });
      await page.waitForSelector('[data-phone-tab="schedule"]', { timeout: 15000 });
      const href = await page.evaluate(() =>
        (document.querySelector('[data-phone-tab="schedule"]') as HTMLAnchorElement | null)?.getAttribute('href') || '',
      );
      expect(href, `Schedule tab href at ${width}`).toBe('/schedule');
      const path = await page.evaluate(async () => {
        (document.querySelector('[data-phone-tab="schedule"]') as HTMLAnchorElement | null)?.click();
        for (let i = 0; i < 40; i += 1) {
          const now = document.querySelector('[data-p1-path]')?.getAttribute('data-p1-path') || '';
          if (now === '/schedule') return now;
          await new Promise((resolve) => window.setTimeout(resolve, 50));
        }
        return document.querySelector('[data-p1-path]')?.getAttribute('data-p1-path') || '';
      });
      expect(path, `Schedule tab path at ${width}`).toBe('/schedule');
      await page.close();
    }
  }, 60000);

  it('P1-nav: every visible nav label at every width equals the one shared words source', async () => {
    for (const width of NAV_WIDTHS) {
      const page = await openPage({ width });
      const labels = await page.evaluate(navLabelsScript);
      const painted = [
        ...labels.shorts,
        ...labels.fulls,
        ...labels.tabs,
        ...labels.arias,
      ].filter(Boolean);
      expect(painted.length, `nav labels present at ${width}`).toBeGreaterThan(0);
      for (const word of painted) {
        expect(SHARED, `nav word "${word}" at ${width}`).toContain(word);
      }
      if (width >= 768) {
        const shown = width >= 1024 ? labels.fulls : labels.shorts;
        expect(shown, `group words at ${width}`).toEqual([
          NAV_WORDS.today,
          NAV_WORDS.jobs,
          NAV_WORDS.field,
          NAV_WORDS.money,
          NAV_WORDS.stock,
        ]);
        expect(labels.arias, `aria labels at ${width}`).toEqual(shown);
      } else {
        expect(labels.tabs, `phone tabs at ${width}`).toEqual([
          NAV_WORDS.today,
          NAV_WORDS.schedule,
          NAV_WORDS.jobs,
          NAV_WORDS.more,
        ]);
      }
      await page.close();
    }
  }, 90000);

  it('P1-paint: page bg and card bg match tokens, with no cream', async () => {
    const page = await openPage({ width: 1280 });
    await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
    const paint = await page.evaluate(contrastScript);
    expect(paint.pageBg, 'page bg matches --g-bg').toBe(paint.tokenBg);
    expect(paint.cardBg, 'card bg matches --g-surface').toBe(paint.tokenSurface);
    expect(CREAM.test(paint.pageBg), 'page bg is not cream').toBe(false);
    expect(CREAM.test(paint.cardBg), 'card bg is not cream').toBe(false);
    await page.close();
  }, 60000);

  it('P1-contrast: secondary-text ≥7:1, CTA ≥4.5:1, pill colours match ok tokens', async () => {
    const page = await openPage({ width: 1280 });
    await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
    const paint = await page.evaluate(contrastScript);
    expect(paint.secondary, 'secondary-text contrast').toBeGreaterThanOrEqual(7);
    expect(paint.cta, 'CTA contrast').toBeGreaterThanOrEqual(4.5);
    expect(paint.pillFg, 'pill ink is --g-ok').toBe(paint.tokenOk);
    expect(paint.pillBg, 'pill fill is --g-ok-bg').toBe(paint.tokenOkBg);
    await page.close();
  }, 60000);

  it('P1-dark: forced dark with allowDark false gives 0px on page and card', async () => {
    const light = await openPage({ width: 390, theme: 'light', allowDark: false });
    await light.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
    const lightPaint = await light.evaluate(contrastScript);
    await light.close();

    const forced = await openPage({ width: 390, theme: 'dark', allowDark: false });
    await forced.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
    const forcedPaint = await forced.evaluate(contrastScript);
    expect(forcedPaint.pageBg, 'forced-dark page bg').toBe(lightPaint.pageBg);
    expect(forcedPaint.cardBg, 'forced-dark card bg').toBe(lightPaint.cardBg);
    await forced.close();
  }, 60000);

  it('P1-overflow: scrollWidth plus max rect.right is 0 overflow at 375/390/768/1024/1280, including header', async () => {
    for (const width of WIDTHS) {
      const page = await openPage({ width });
      await page.waitForSelector('.shell-header', { timeout: 20000 });
      const box = await page.evaluate(overflowScript);
      expect(box.scrollWidth, `scrollWidth at ${width}`).toBeLessThanOrEqual(width);
      expect(box.maxRight, `max rect.right at ${width}`).toBeLessThanOrEqual(width + 0.5);
      await page.close();
    }
  }, 90000);
});
