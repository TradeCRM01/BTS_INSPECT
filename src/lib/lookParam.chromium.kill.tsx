/**
 * @vitest-environment node
 *
 * lookParam Chromium kills over a prod-like esbuild IIFE and built dist CSS.
 * Filename omits `.test.` so the default include misses it.
 */
import { execSync } from 'node:child_process';
import { createReadStream, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LOOK_FILL_KILLS, LOOK_PAGE_KILLS, SEARCH_PARAM_ALLOWLIST } from './lookParam.chromium.catalog';

const require = createRequire(import.meta.url);
const ts = require('typescript') as typeof import('typescript');
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

function unwrapExpr(node: import('typescript').Expression): import('typescript').Expression {
  let cur = node;
  for (let i = 0; i < 6; i++) {
    if (ts.isAsExpression(cur) || ts.isParenthesizedExpression(cur)) {
      cur = cur.expression;
      continue;
    }
    if (typeof ts.isSatisfiesExpression === 'function' && ts.isSatisfiesExpression(cur)) {
      cur = cur.expression;
      continue;
    }
    break;
  }
  return cur;
}

function lookStringFromNode(
  node: import('typescript').Expression,
  consts: Map<string, string>,
): string | null {
  const cur = unwrapExpr(node);
  if (ts.isStringLiteral(cur) || ts.isNoSubstitutionTemplateLiteral(cur)) return cur.text;
  if (ts.isIdentifier(cur)) return consts.get(cur.text) ?? null;
  return null;
}

function collectStringConsts(source: import('typescript').SourceFile): Map<string, string> {
  const consts = new Map<string, string>();
  const visit = (node: import('typescript').Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const value = lookStringFromNode(node.initializer, consts);
      if (value != null) consts.set(node.name.text, value);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return consts;
}

function isUrlSearchParamsCtor(node: import('typescript').NewExpression): boolean {
  return ts.isIdentifier(node.expression) && node.expression.text === 'URLSearchParams';
}

function typeLooksLikeSearchParams(type: import('typescript').TypeNode | undefined): boolean {
  return Boolean(type && /\bURLSearchParams\b/.test(type.getText()));
}

function calleeName(expr: import('typescript').Expression): string {
  const cur = unwrapExpr(expr);
  if (ts.isIdentifier(cur)) return cur.text;
  if (ts.isPropertyAccessExpression(cur)) return cur.name.text;
  return '';
}

function collectSearchParamNames(source: import('typescript').SourceFile): Set<string> {
  const names = new Set<string>();
  const visit = (node: import('typescript').Node) => {
    if (ts.isParameter(node) && ts.isIdentifier(node.name) && typeLooksLikeSearchParams(node.type)) {
      names.add(node.name.text);
    }
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const init = unwrapExpr(node.initializer);
      if (ts.isCallExpression(init) && calleeName(init.expression) === 'useSearchParams') {
        if (ts.isArrayBindingPattern(node.name)) {
          const first = node.name.elements[0];
          if (first && !ts.isOmittedExpression(first) && ts.isIdentifier(first.name)) {
            names.add(first.name.text);
          }
        } else if (ts.isIdentifier(node.name)) {
          names.add(node.name.text);
        }
      }
      if (ts.isNewExpression(init) && isUrlSearchParamsCtor(init) && ts.isIdentifier(node.name)) {
        names.add(node.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
}

function isSearchReceiver(
  expr: import('typescript').Expression,
  names: Set<string>,
): boolean {
  const cur = unwrapExpr(expr);
  if (ts.isIdentifier(cur) && names.has(cur.text)) return true;
  if (ts.isNewExpression(cur) && isUrlSearchParamsCtor(cur)) return true;
  if (ts.isPropertyAccessExpression(cur) && cur.name.text === 'searchParams') return true;
  return false;
}

function pushHit(
  hits: Array<{ file: string; line: number; text: string }>,
  source: import('typescript').SourceFile,
  text: string,
  node: import('typescript').Node,
  rel: string,
): void {
  const { line } = source.getLineAndCharacterOfPosition(node.getStart());
  hits.push({ file: rel, line: line + 1, text: text.split('\n')[line]?.trim() ?? '' });
}

function searchParamAllowlistHits(): Array<{ file: string; line: number; text: string }> {
  const allow = new Set<string>(SEARCH_PARAM_ALLOWLIST);
  const skip = /lookParam\.ts$|lookParam\.chromium\.|lookParam\.dist\.|\.test\.|\.chromium\.kill\./;
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
      const text = readFileSync(full, 'utf8');
      const kind = name.name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
      const source = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind);
      const consts = collectStringConsts(source);
      const names = collectSearchParamNames(source);
      const visit = (node: import('typescript').Node) => {
        if (ts.isSpreadElement(node) && isSearchReceiver(node.expression, names)) {
          pushHit(hits, source, text, node, rel);
        }
        if (ts.isForOfStatement(node) && isSearchReceiver(node.expression, names)) {
          pushHit(hits, source, text, node, rel);
        }
        if (ts.isCallExpression(node)) {
          const callee = unwrapExpr(node.expression);
          if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'fromEntries') {
            const root = unwrapExpr(callee.expression);
            if (ts.isIdentifier(root) && root.text === 'Object' && node.arguments[0] && isSearchReceiver(node.arguments[0], names)) {
              pushHit(hits, source, text, node, rel);
            }
          }
          if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'from') {
            const root = unwrapExpr(callee.expression);
            if (ts.isIdentifier(root) && root.text === 'Array' && node.arguments[0] && isSearchReceiver(node.arguments[0], names)) {
              pushHit(hits, source, text, node, rel);
            }
          }
          if (ts.isPropertyAccessExpression(callee) && isSearchReceiver(callee.expression, names)) {
            const method = callee.name.text;
            if (method === 'entries' || method === 'keys' || method === 'values' || method === 'forEach') {
              pushHit(hits, source, text, node, rel);
            }
            if (method === 'get' || method === 'has' || method === 'getAll') {
              const key = node.arguments[0] ? lookStringFromNode(node.arguments[0], consts) : null;
              if (key == null || !allow.has(key)) pushHit(hits, source, text, node, rel);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
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
let fillProofJs = '';
let fillLiveJs = '';
const temps: string[] = [];
const fillEntry = join(here, 'lookParam.chromium.fill-entry.tsx');

beforeAll(async () => {
  distCss = readDistCss();
  proofJs = await bundleLook({ lookProof: true });
  liveJs = await bundleLook({ lookProof: false });
  fillProofJs = await bundleLook({ lookProof: true, entry: fillEntry });
  fillLiveJs = await bundleLook({ lookProof: false, entry: fillEntry });
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

const DIST_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.map': 'application/json',
};

function viteLookDist(lookProof: boolean, outDir: string): void {
  const env: NodeJS.ProcessEnv = { ...process.env, LOOK_DIST_OUT: outDir };
  if (lookProof) env.VITE_LOOK_PROOF = '1';
  else delete env.VITE_LOOK_PROOF;
  execSync('npx vite build --config lookParam.dist.vite.config.ts', {
    cwd: ROOT,
    env,
    stdio: 'pipe',
  });
}

function findDistHtml(dir: string): string {
  const index = join(dir, 'index.html');
  if (existsSync(index)) return index;
  const nested = join(dir, 'src/lib/lookParam.dist.html');
  if (existsSync(nested)) return nested;
  throw new Error(`look dist html missing in ${dir}`);
}

function serveDist(dir: string): Promise<{ origin: string; close: () => Promise<void> }> {
  const indexHtml = findDistHtml(dir);
  const root = resolve(dir);
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const rel = decodeURIComponent(url.pathname);
    const file = resolve(root, `.${rel === '/' ? '/index.html' : rel}`);
    const allowed = file === root || file.startsWith(`${root}/`);
    const target = allowed && existsSync(file) && statSync(file).isFile() ? file : indexHtml;
    res.setHeader('content-type', DIST_MIME[extname(target)] || 'application/octet-stream');
    createReadStream(target).pipe(res);
  });
  return new Promise((resolveListen, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('look dist listen failed'));
        return;
      }
      resolveListen({
        origin: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

async function openDistClients(origin: string): Promise<KillPage> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${origin}/clients?look=clients-list`);
  try {
    await page.waitForSelector('.hub-clients, .shell-header', { timeout: 20000 });
  } catch (err) {
    const dumped = await page.evaluate(() => (
      `${document.body?.innerText || ''}\n${document.documentElement.innerHTML.slice(0, 2500)}`
    ));
    await page.close();
    throw new Error(`${err instanceof Error ? err.message : String(err)}\nDIST:${dumped}`);
  }
  return page;
}

describe('lookParam chromium kills', () => {
  it('inventory: search-param reads outside lookParam.ts are allowlisted literals', () => {
    expect(searchParamAllowlistHits(), 'non-allowlisted search-param reads').toEqual([]);
  }, 30000);

  it('inventory mutant i1: concatenated .get(\'lo\'+\'ok\') goes red', () => {
    const target = join(ROOT, 'src/pages/JhaFillPage.tsx');
    const orig = readFileSync(target, 'utf8');
    try {
      writeFileSync(target, `${orig}\nvoid new URLSearchParams(location.search).get('lo' + 'ok');\n`);
      expect(searchParamAllowlistHits().some((hit) => hit.file.endsWith('JhaFillPage.tsx'))).toBe(true);
    } finally {
      writeFileSync(target, orig);
    }
  }, 30000);

  it('inventory mutant i3: Object.fromEntries(searchParams).look goes red', () => {
    const target = join(ROOT, 'src/pages/JobDetailPage.tsx');
    const orig = readFileSync(target, 'utf8');
    try {
      writeFileSync(target, `${orig}\nvoid Object.fromEntries(new URLSearchParams(location.search)).look;\n`);
      expect(searchParamAllowlistHits().some((hit) => hit.file.endsWith('JobDetailPage.tsx'))).toBe(true);
    } finally {
      writeFileSync(target, orig);
    }
  }, 30000);

  it('inventory mutant: .get(variable) goes red', () => {
    const target = join(ROOT, 'src/pages/ClientDetailPage.tsx');
    const orig = readFileSync(target, 'utf8');
    try {
      writeFileSync(target, `${orig}\nvoid new URLSearchParams(location.search).get(window.name);\n`);
      expect(searchParamAllowlistHits().some((hit) => hit.file.endsWith('ClientDetailPage.tsx'))).toBe(true);
    } finally {
      writeFileSync(target, orig);
    }
  }, 30000);

  it('inventory mutant: non-allowlisted literal .get(\'sneaky\') goes red', () => {
    const target = join(ROOT, 'src/pages/ClientsPage.tsx');
    const orig = readFileSync(target, 'utf8');
    try {
      writeFileSync(target, `${orig}\nvoid new URLSearchParams(location.search).get('sneaky');\n`);
      expect(searchParamAllowlistHits().some((hit) => hit.file.endsWith('ClientsPage.tsx'))).toBe(true);
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

  for (const page of LOOK_FILL_KILLS) {
    it(`prod no-flag ${page.id}: look fixture stays off`, async () => {
      const tab = await openLook({ path: page.path, js: fillLiveJs, wait: page.wait });
      const painted = await pageText(tab);
      await tab.close();
      for (const fixture of page.fixtures) {
        expect(painted.includes(fixture), `${page.id} leaked ${fixture}`).toBe(false);
      }
    }, 180000);

    it(`flag-on ${page.id}: look fixture paints`, async () => {
      const tab = await openLook({ path: page.path, js: fillProofJs, wait: page.wait });
      const painted = await waitForAnyText(tab, page.fixtures);
      await tab.close();
      const hit = page.fixtures.some((fixture) => painted.includes(fixture));
      expect(hit, `${page.id} missing ${page.fixtures.join(' | ')}`).toBe(true);
    }, 180000);

    it(`mutant un-gate ${page.id}: prod no-flag kill goes red`, async () => {
      await withMutatedFile(join(ROOT, page.file), ungateSource, async () => {
        const js = await bundleLook({ lookProof: false, entry: fillEntry });
        const tab = await openLook({ path: page.path, js, wait: page.wait });
        const painted = await waitForAnyText(tab, page.fixtures);
        await tab.close();
        const hit = page.fixtures.some((fixture) => painted.includes(fixture));
        expect(hit, `${page.id} un-gate must leak ${page.fixtures.join(' | ')}`).toBe(true);
      });
    }, 180000);

    it(`mutant force-off ${page.id}: flag-on kill goes red`, async () => {
      await withMutatedFile(join(ROOT, page.file), forceOffSource, async () => {
        const js = await bundleLook({ lookProof: true, entry: fillEntry });
        const tab = await openLook({ path: page.path, js, wait: page.wait });
        const painted = await pageText(tab);
        await tab.close();
        for (const fixture of page.fixtures) {
          expect(painted.includes(fixture), `${page.id} force-off still painted ${fixture}`).toBe(false);
        }
      });
    }, 180000);
  }

  it('dist vite build: unset hides ?look= fixture; VITE_LOOK_PROOF=1 paints it', async () => {
    const offDir = mkdtempSync(join(tmpdir(), 'look-dist-off-'));
    const onDir = mkdtempSync(join(tmpdir(), 'look-dist-on-'));
    temps.push(offDir, onDir);
    viteLookDist(false, offDir);
    viteLookDist(true, onDir);
    const off = await serveDist(offDir);
    try {
      const page = await openDistClients(off.origin);
      const painted = await pageText(page);
      await page.close();
      expect(painted.includes('Northside Electrical'), 'unset dist leaked clients-list fixture').toBe(false);
    } finally {
      await off.close();
    }
    const on = await serveDist(onDir);
    try {
      const page = await openDistClients(on.origin);
      const painted = await waitForAnyText(page, ['Northside Electrical']);
      await page.close();
      expect(painted.includes('Northside Electrical'), 'flag dist missing clients-list fixture').toBe(true);
    } finally {
      await on.close();
    }
  }, 300000);

  it('dist mutant un-gate: unset vite build paints the ?look= fixture', async () => {
    await withMutatedFile(join(ROOT, 'src/pages/ClientsPage.tsx'), ungateSource, async () => {
      const dir = mkdtempSync(join(tmpdir(), 'look-dist-ungate-'));
      temps.push(dir);
      viteLookDist(false, dir);
      const served = await serveDist(dir);
      try {
        const page = await openDistClients(served.origin);
        const painted = await waitForAnyText(page, ['Northside Electrical']);
        await page.close();
        expect(painted.includes('Northside Electrical'), 'un-gate unset dist must leak fixture').toBe(true);
      } finally {
        await served.close();
      }
    });
  }, 180000);

  it('dist mutant force-off: VITE_LOOK_PROOF=1 vite build hides the ?look= fixture', async () => {
    await withMutatedFile(join(ROOT, 'src/pages/ClientsPage.tsx'), forceOffSource, async () => {
      const dir = mkdtempSync(join(tmpdir(), 'look-dist-forceoff-'));
      temps.push(dir);
      viteLookDist(true, dir);
      const served = await serveDist(dir);
      try {
        const page = await openDistClients(served.origin);
        const painted = await pageText(page);
        await page.close();
        expect(painted.includes('Northside Electrical'), 'force-off flag dist still painted fixture').toBe(false);
      } finally {
        await served.close();
      }
    });
  }, 180000);

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
