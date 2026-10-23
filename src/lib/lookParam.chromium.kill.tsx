/**
 * @vitest-environment node
 *
 * lookParam Chromium kills over a prod-like esbuild IIFE and built dist CSS.
 * Filename omits `.test.` so the default include misses it.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LOOK_PAGE_KILLS, LOOK_PROOF_SCAN_KEYS } from './lookParam.chromium.catalog';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild') as {
  build: (opts: Record<string, unknown>) => Promise<{ outputFiles?: Array<{ text: string }> }>;
};

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = process.cwd();
const WIDTHS = [375, 390, 768, 1024, 1280] as const;
const MAIN_SHA = '30cb09d9';
function ungateSource(src: string): string {
  return src
    .replace(/lookWindowParam\(\s*(?:'([^']+)'|"([^"]+)")?\s*\)/g, (_m, a, b) => (
      `new URLSearchParams(window.location.search).get('${a || b || 'look'}')`
    ))
    .replace(/lookParam\(\s*([A-Za-z_][\w.]*)\s*(?:,\s*'([^']+)')?\s*\)/g, (_m, search, key) => (
      `${search}.get('${key || 'look'}')`
    ));
}

function forceOffSource(src: string): string {
  return src
    .replace(/lookWindowParam\(\s*(?:'([^']+)'|"([^"]+)")?\s*\)/g, 'null')
    .replace(/lookParam\(\s*[A-Za-z_][\w.]*\s*(?:,\s*'[^']+')?\s*\)/g, 'null');
}

type KillPage = {
  goto: (url: string) => Promise<unknown>;
  evaluate: <T>(fn: (() => T | Promise<T>) | ((arg: never) => T | Promise<T>), arg?: unknown) => Promise<T>;
  waitForSelector: (sel: string, opts?: { timeout?: number }) => Promise<unknown>;
  setViewportSize: (size: { width: number; height: number }) => Promise<void>;
  screenshot: (opts?: { type?: 'png'; animations?: 'disabled' | 'allow' }) => Promise<Buffer>;
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
  const dir = join(ROOT, 'dist/assets');
  if (!existsSync(dir)) throw new Error('dist/assets missing; run npm run build');
  const files = readdirSync(dir).filter((name) => name.endsWith('.css'));
  if (!files.length) throw new Error('no dist CSS');
  return files.map((name) => readFileSync(join(dir, name), 'utf8')).join('\n');
}

function lookReadsOutsideHelper(): Array<{ file: string; line: number; text: string }> {
  const keys = LOOK_PROOF_SCAN_KEYS.join('|');
  const re = new RegExp(String.raw`\.get\(\s*['"](?:${keys})['"]\s*\)`);
  const skip = /lookParam\.ts$|lookParam\.chromium\.|\.test\.|\.chromium\.kill\./;
  const hits: Array<{ file: string; line: number; text: string }> = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, name.name);
      if (name.isDirectory()) {
        if (name.name === 'node_modules' || name.name === 'dist') continue;
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(name.name)) continue;
      const rel = relative(ROOT, full).replace(/\\/g, '/');
      if (skip.test(rel)) continue;
      const lines = readFileSync(full, 'utf8').split('\n');
      lines.forEach((text, i) => {
        if (re.test(text)) hits.push({ file: rel, line: i + 1, text: text.trim() });
      });
    }
  };
  walk(join(ROOT, 'src'));
  return hits;
}

async function bundleLook(opts: {
  lookProof: boolean;
  entry?: string;
  keepAiKey?: boolean;
}): Promise<string> {
  const mocks = join(ROOT, 'src/components/layout/s2Shell.chromium.mocks.ts');
  const aiMocks = join(here, 'lookParam.chromium.ai-settings.ts');
  const result = await esbuild.build({
    absWorkingDir: ROOT,
    entryPoints: [opts.entry || join(here, 'lookParam.chromium.entry.tsx')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    write: false,
    logLevel: 'silent',
    nodePaths: [join(ROOT, 'node_modules')],
    define: {
      'process.env.NODE_ENV': '"test"',
      'import.meta.env.MODE': '"test"',
      'import.meta.env.DEV': 'false',
      'import.meta.env.PROD': 'true',
      'import.meta.env.SSR': 'false',
      'import.meta.env.VITE_LOOK_PROOF': opts.lookProof ? '"1"' : 'undefined',
      'import.meta.env.VITE_SUPABASE_URL': '"https://example.supabase.co"',
      'import.meta.env.VITE_SUPABASE_ANON_KEY': '"test-anon-key"',
    },
    plugins: [{
      name: 'look-param-mocks',
      setup(build: {
        onResolve: (
          filter: { filter: RegExp },
          cb: (args: { path: string }) => { path: string; namespace: string } | null,
        ) => void;
      }) {
        build.onResolve({ filter: /(?:AuthContext|useCompanyAiKey|DevConsole|aiSettingsClient|(?:^|[./])supabase)$/ }, (args) => {
          const spec = args.path.replace(/\\/g, '/');
          if (/AuthContext$/.test(spec)) return { path: mocks, namespace: 'file' };
          if (!opts.keepAiKey && /useCompanyAiKey$/.test(spec)) return { path: mocks, namespace: 'file' };
          if (/DevConsole$/.test(spec)) return { path: mocks, namespace: 'file' };
          if (/aiSettingsClient$/.test(spec)) return { path: aiMocks, namespace: 'file' };
          if (/(?:^|[./])supabase$/.test(spec)) return { path: mocks, namespace: 'file' };
          return null;
        });
      },
    }],
  });
  const file = result.outputFiles?.[0];
  if (!file) throw new Error('esbuild produced no look bundle');
  return file.text;
}

function fixtureHtml(args: { js: string; css: string; path: string }): string {
  const geist = pathToFileURL(join(ROOT, 'public/fonts/Geist-Variable.woff2')).href;
  return `<!doctype html>
<html data-theme="light">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>@font-face{font-family:'Geist';src:url('${geist}') format('woff2');font-weight:100 900;font-style:normal;font-display:block}</style>
<style>${args.css}</style>
</head>
<body>
<div id="root"></div>
<script>window.__LOOK__ = ${JSON.stringify({ path: args.path })};</script>
<script>${args.js}</script>
</body>
</html>`;
}

let browser: Awaited<ReturnType<typeof launchBrowser>>;
let distCss = '';
let proofJs = '';
let liveJs = '';
const temps: string[] = [];

beforeAll(async () => {
  distCss = readDistCss();
  proofJs = await bundleLook({ lookProof: true });
  liveJs = await bundleLook({ lookProof: false });
  browser = await launchBrowser();
}, 180000);

afterAll(async () => {
  await browser?.close();
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

async function openLook(args: {
  path: string;
  js: string;
  width?: number;
  wait?: string;
}): Promise<KillPage> {
  const html = fixtureHtml({ js: args.js, css: distCss, path: args.path });
  const dir = mkdtempSync(join(tmpdir(), 'look-kill-'));
  temps.push(dir);
  const file = join(dir, 't.html');
  writeFileSync(file, html);
  const width = args.width ?? 1280;
  const page = await browser.newPage({
    viewport: { width, height: width <= 430 ? 844 : 900 },
  });
  const href = `${pathToFileURL(file).href}${args.path.includes('?') ? args.path.slice(args.path.indexOf('?')) : ''}`;
  await page.goto(href);
  try {
    await page.waitForSelector(args.wait || '.shell-header', { timeout: 20000 });
  } catch (err) {
    const dumped = await page.evaluate(() => (
      `${document.body?.innerText || ''}\n${document.documentElement.innerHTML.slice(0, 2500)}`
    ));
    throw new Error(`${err instanceof Error ? err.message : String(err)}\nPAINTED:${dumped}`);
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
  return page;
}

async function waitForAnyText(page: KillPage, texts: string[], timeoutMs = 12000): Promise<string> {
  const started = Date.now();
  let painted = await pageText(page);
  while (Date.now() - started < timeoutMs) {
    if (texts.some((text) => painted.includes(text))) return painted;
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 120)));
    painted = await pageText(page);
  }
  return painted;
}

async function pageText(page: KillPage): Promise<string> {
  return page.evaluate(() => {
    const root = document.getElementById('root') || document.body;
    return `${root.textContent || ''}\n${root.innerHTML}`;
  });
}

function lookHref(path: string, look: string, extra = ''): string {
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}look=${look}${extra}`;
}

function withMutatedFile(file: string, rewrite: (src: string) => string, fn: () => Promise<void>): Promise<void> {
  const orig = readFileSync(file, 'utf8');
  writeFileSync(file, rewrite(orig));
  return fn().finally(() => writeFileSync(file, orig));
}

describe('lookParam chromium kills', () => {
  it('inventory: no src file reads a proof param outside lookParam.ts', () => {
    expect(lookReadsOutsideHelper(), 'raw proof-param reads').toEqual([]);
  }, 30000);

  it('inventory mutant: one raw look read goes red', () => {
    const target = join(ROOT, 'src/pages/ClientsPage.tsx');
    const orig = readFileSync(target, 'utf8');
    try {
      writeFileSync(target, `${orig}\nvoid new URLSearchParams('look=x').get('look');\n`);
      expect(lookReadsOutsideHelper().some((hit) => hit.file.endsWith('ClientsPage.tsx'))).toBe(true);
    } finally {
      writeFileSync(target, orig);
    }
  }, 30000);

  for (const page of LOOK_PAGE_KILLS) {
    it(`prod no-flag ${page.id}: each look stays on live or mocked-live data`, async () => {
      for (const look of page.looks) {
        const href = lookHref(page.path, look.value, look.search ? `&${look.search}` : '');
        const tab = await openLook({ path: href, js: liveJs, wait: page.wait });
        const painted = await pageText(tab);
        await tab.close();
        for (const fixture of look.fixtures) {
          expect(painted.includes(fixture), `${page.id} ?look=${look.value} leaked ${fixture}`).toBe(false);
        }
        for (const live of page.live ?? []) {
          expect(painted.includes(live), `${page.id} live ${live}`).toBe(true);
        }
      }
    }, 180000);

    it(`flag-on ${page.id}: each look still paints its fixture`, async () => {
      for (const look of page.looks) {
        const href = lookHref(page.path, look.value, look.search ? `&${look.search}` : '');
        const tab = await openLook({ path: href, js: proofJs, wait: page.wait });
        const painted = await waitForAnyText(tab, look.fixtures);
        await tab.close();
        const hit = look.fixtures.some((fixture) => painted.includes(fixture));
        expect(hit, `${page.id} ?look=${look.value} missing ${look.fixtures.join(' | ')}`).toBe(true);
      }
    }, 180000);

    it(`mutant un-gate ${page.id}: prod no-flag kill goes red`, async () => {
      await withMutatedFile(join(ROOT, page.file), ungateSource, async () => {
        const js = await bundleLook({ lookProof: false });
        const look = page.looks[0];
        const href = lookHref(page.path, look.value, look.search ? `&${look.search}` : '');
        const tab = await openLook({ path: href, js, wait: page.wait });
        const painted = await waitForAnyText(tab, look.fixtures);
        await tab.close();
        const hit = look.fixtures.some((fixture) => painted.includes(fixture));
        expect(hit, `${page.id} un-gate must leak ${look.fixtures.join(' | ')}`).toBe(true);
      });
    }, 180000);

    it(`mutant force-off ${page.id}: flag-on kill goes red`, async () => {
      await withMutatedFile(join(ROOT, page.file), forceOffSource, async () => {
        const js = await bundleLook({ lookProof: true });
        const look = page.looks[0];
        const href = lookHref(page.path, look.value, look.search ? `&${look.search}` : '');
        const tab = await openLook({ path: href, js, wait: page.wait });
        const painted = await pageText(tab);
        await tab.close();
        for (const fixture of look.fixtures) {
          expect(painted.includes(fixture), `${page.id} force-off still painted ${fixture}`).toBe(false);
        }
      });
    }, 180000);
  }

  it('useCompanyAiKey prod no-flag: expense1-empty + expenseNoAi keeps Scan receipt', async () => {
    const js = await bundleLook({
      lookProof: false,
      keepAiKey: true,
      entry: join(here, 'lookParam.chromium.ai-entry.tsx'),
    });
    const path = '/expenses?look=expense1-empty&expenseNoAi=1';
    const page = await openLook({ path, js, wait: '.hub-expenses, .shell-header' });
    const painted = await pageText(page);
    await page.close();
    expect(painted.includes('Scan receipt'), 'prod no-flag must keep Scan receipt').toBe(true);
  }, 120000);

  it('useCompanyAiKey flag-on: expense1-empty + expenseNoAi hides Scan receipt', async () => {
    const js = await bundleLook({
      lookProof: true,
      keepAiKey: true,
      entry: join(here, 'lookParam.chromium.ai-entry.tsx'),
    });
    const path = '/expenses?look=expense1-empty&expenseNoAi=1';
    const page = await openLook({ path, js, wait: '.hub-expenses, .shell-header' });
    const painted = await pageText(page);
    await page.close();
    expect(painted.includes('Scan receipt'), 'flag-on expenseNoAi must hide Scan receipt').toBe(false);
  }, 120000);

  it('useCompanyAiKey mutant: un-gating the hook hides Scan receipt on the no-flag kill', async () => {
    const file = join(ROOT, 'src/lib/useCompanyAiKey.ts');
    await withMutatedFile(file, ungateSource, async () => {
      const js = await bundleLook({
        lookProof: false,
        keepAiKey: true,
        entry: join(here, 'lookParam.chromium.ai-entry.tsx'),
      });
      const path = '/expenses?look=expense1-empty&expenseNoAi=1';
      const page = await openLook({ path, js, wait: '.hub-expenses, .shell-header' });
      const painted = await pageText(page);
      await page.close();
      expect(painted.includes('Scan receipt'), 'un-gated expenseNoAi must hide Scan receipt').toBe(false);
    });
  }, 120000);

  it('pixel: 0px vs main 30cb09d9 at 375/390/768/1024/1280 on live touched pages', async () => {
    const wt = join(tmpdir(), 'look-main-30cb09d9');
    if (!existsSync(join(wt, 'package.json'))) {
      execSync(`git worktree add --detach ${wt} ${MAIN_SHA}`, { cwd: ROOT, stdio: 'pipe' });
      execSync(`ln -sfn ${join(ROOT, 'node_modules')} ${join(wt, 'node_modules')}`);
    }
    const pages = LOOK_PAGE_KILLS;
    const headJs = await bundleLook({ lookProof: false });
    const mainEntry = join(wt, 'src/lib/lookParam.chromium.entry.tsx');
    writeFileSync(mainEntry, readFileSync(join(here, 'lookParam.chromium.entry.tsx'), 'utf8'));
    const mainJs = await bundleLook({ lookProof: false, entry: mainEntry });
    for (const spec of pages) {
      for (const width of WIDTHS) {
        const head = await openLook({ path: spec.path, js: headJs, width, wait: spec.wait });
        if (spec.live?.length) await waitForAnyText(head, spec.live);
        const headShot = await head.screenshot({ type: 'png', animations: 'disabled' });
        await head.close();
        const main = await openLook({ path: spec.path, js: mainJs, width, wait: spec.wait });
        if (spec.live?.length) await waitForAnyText(main, spec.live);
        const mainShot = await main.screenshot({ type: 'png', animations: 'disabled' });
        await main.close();
        expect(headShot.equals(mainShot), `0px ${spec.id} at ${width}`).toBe(true);
      }
    }
  }, 600000);
});
