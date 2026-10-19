import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const THREE_LINE = 'Labour — fault find tripping RCD, 2 techs\nReplace damaged GPO double (HPM Excel)\nTest and tag on site';
const LONG = 'Replace damaged GPO double (HPM Excel) and run a new circuit back to the switchboard with labelled breakers and a written test sheet for the client.';
const LABOUR = 'Labour';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

type DescMetrics = {
  tag: string;
  scrollHeight: number;
  clientHeight: number;
  heightStyle: string;
};

type FieldMetrics = {
  sh: number;
  ch: number;
  h: number;
  natural: number;
  overflowY: string;
  value: string;
};

type RoStats = { constructors: number; disconnects: number; live: number };

const FIELD_METRICS = `(() => {
  const el = document.querySelector('textarea[aria-label="Description"]');
  if (!el) throw new Error('missing Description');
  const clone = el.cloneNode(true);
  clone.style.height = 'auto';
  clone.style.position = 'absolute';
  clone.style.visibility = 'hidden';
  clone.style.left = '-9999px';
  clone.style.width = getComputedStyle(el).width;
  el.parentNode.appendChild(clone);
  const cs = getComputedStyle(clone);
  const borderY = Number.parseFloat(cs.borderTopWidth) + Number.parseFloat(cs.borderBottomWidth);
  const natural = clone.scrollHeight + (Number.isFinite(borderY) ? borderY : 0);
  clone.remove();
  return {
    sh: el.scrollHeight,
    ch: el.clientHeight,
    h: Number.parseFloat(el.style.height) || el.getBoundingClientRect().height,
    natural,
    overflowY: getComputedStyle(el).overflowY,
    value: el.value,
  };
})()`;

async function launchBrowser() {
  const chromeCandidates = [
    process.env.CHROME_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    '/home/ubuntu/.cache/ms-playwright/chromium-1148/chrome-linux64/chrome',
    '/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter((path): path is string => !!path && existsSync(path));
  const executablePath = chromeCandidates[0];
  const errors: string[] = [];
  for (const spec of ['playwright', 'playwright-core']) {
    try {
      const mod = await import(spec);
      return await mod.chromium.launch({
        headless: true,
        executablePath,
      });
    } catch (err) {
      errors.push(`${spec}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`real Chromium is required for Description grow (${errors.join('; ')})`);
}

async function bundleHarness(): Promise<string> {
  const esbuild = require('esbuild') as typeof import('esbuild');
  const outDir = join(tmpdir(), 'grafter-desc-grow');
  mkdirSync(outDir, { recursive: true });
  const stubPath = join(outDir, 'supabase-stub.js');
  writeFileSync(stubPath, `
    export const supabase = {
      from() {
        const query = {};
        const self = () => query;
        for (const key of ['select', 'eq', 'neq', 'is', 'or', 'order', 'limit', 'maybeSingle', 'single', 'in']) {
          query[key] = self;
        }
        query.then = (onFulfilled) => Promise.resolve({ data: [], error: null }).then(onFulfilled);
        return query;
      },
      rpc() { return Promise.resolve({ data: [], error: null }); },
    };
  `);
  const authStubPath = join(outDir, 'auth-stub.js');
  writeFileSync(authStubPath, `
    export function useAuth() {
      return {
        profile: { company_id: 'co-1', id: 'user-1', name: 'QA', role: 'admin' },
        company: { id: 'co-1', name: 'QA Co', default_tax_rate: 10, default_material_markup: 20 },
        session: { access_token: 'tok' },
      };
    }
    export function AuthProvider({ children }) { return children; }
  `);
  const outfile = join(outDir, 'harness.js');
  await esbuild.build({
    entryPoints: [resolve(here, 'lineItemDescriptionGrow.harness.tsx')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    outfile,
    jsx: 'automatic',
    plugins: [{
      name: 'supabase-stub',
      setup(build) {
        build.onResolve({ filter: /[/\\]lib[/\\]supabase(?:\.ts)?$/ }, () => ({ path: stubPath }));
        build.onResolve({ filter: /[/\\]contexts[/\\]AuthContext(?:\.tsx?)?$/ }, () => ({ path: authStubPath }));
      },
    }],
    define: {
      'import.meta.env': JSON.stringify({
        DEV: false,
        PROD: true,
        MODE: 'test',
        VITE_SUPABASE_URL: 'https://example.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'test-anon-key',
      }),
      'process.env.NODE_ENV': '"test"',
    },
    logLevel: 'silent',
  });
  writeFileSync(join(outDir, 'index.html'), `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #F5F0E6; }
  #root { width: 100%; padding: 8px; }
  .form-input-sm {
    width: 100%;
    min-height: 44px;
    padding: 8px 10px;
    font-size: 14px;
    line-height: 1.25;
    font-family: Arial, sans-serif;
    border: 1px solid #ccc;
    border-radius: 6px;
    white-space: pre-wrap;
    overflow-wrap: break-word;
  }
  .overflow-hidden { overflow: hidden; }
  .resize-none { resize: none; }
  .whitespace-pre-wrap { white-space: pre-wrap; }
  .break-words { overflow-wrap: break-word; }
</style>
</head>
<body>
<div id="root"></div>
<script>
(function () {
  var Native = window.ResizeObserver;
  var live = new Set();
  var constructors = 0;
  var disconnects = 0;
  window.ResizeObserver = class extends Native {
    constructor(cb) {
      super(cb);
      constructors += 1;
      live.add(this);
    }
    disconnect() {
      if (live.has(this)) {
        disconnects += 1;
        live.delete(this);
      }
      super.disconnect();
    }
  };
  window.__roStats = function () {
    return { constructors: constructors, disconnects: disconnects, live: live.size };
  };
  window.__roReset = function () {
    constructors = 0;
    disconnects = 0;
    live.clear();
  };
})();
</script>
<script src="./harness.js"></script>
</body>
</html>`);
  return outDir;
}

function serveDir(dir: string): Promise<{ url: string; close: () => Promise<void> }> {
  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
  };
  const server: Server = createServer((req, res) => {
    const name = (req.url ?? '/').split('?')[0] === '/' ? '/index.html' : (req.url ?? '/').split('?')[0];
    const file = join(dir, name.replace(/^\/+/, ''));
    if (!file.startsWith(dir) || !existsSync(file)) {
      res.statusCode = 404;
      res.end('missing');
      return;
    }
    const ext = name.slice(name.lastIndexOf('.'));
    res.setHeader('content-type', types[ext] ?? 'application/octet-stream');
    res.end(readFileSync(file));
  });
  return new Promise((resolveListen, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('no listen address'));
        return;
      }
      resolveListen({
        url: `http://127.0.0.1:${addr.port}/`,
        close: () => new Promise((resolveClose, rejectClose) => {
          server.close(err => err ? rejectClose(err) : resolveClose());
        }),
      });
    });
  });
}

function editName(kind: 'quote' | 'invoice'): RegExp {
  return kind === 'quote' ? /Edit quote/i : /Edit invoice/i;
}

function mountName(kind: 'quote' | 'invoice'): string {
  return kind === 'quote' ? 'mountQuoteEditor' : 'mountInvoiceEditor';
}

async function openDoc(page: { evaluate: (s: string) => Promise<unknown>; waitForFunction: (s: string) => Promise<unknown>; waitForSelector: (s: string) => Promise<unknown>; waitForTimeout: (n: number) => Promise<void> }, kind: 'quote' | 'invoice', texts: string | string[]) {
  const mount = mountName(kind);
  const name = editName(kind);
  await page.waitForFunction(`typeof window.${mount} === "function"`);
  await page.evaluate(`window.${mount}(${JSON.stringify(texts)})`);
  await page.waitForFunction(`[...document.querySelectorAll('button')].some(b => ${name}.test(b.textContent || ''))`);
  await page.evaluate(`([...document.querySelectorAll('button')].find(b => ${name}.test(b.textContent || ''))).click()`);
  await page.waitForSelector('textarea[aria-label="Description"]');
  await page.waitForTimeout(80);
}

function assertFits(label: string, metrics: FieldMetrics) {
  expect(metrics.overflowY, `${label} overflow`).toBe('hidden');
  expect(metrics.sh, `${label} sh ${metrics.sh} ch ${metrics.ch}`).toBeLessThanOrEqual(metrics.ch);
  expect(Math.abs(metrics.h - metrics.natural), `${label} h ${metrics.h} natural ${metrics.natural}`).toBeLessThanOrEqual(2);
}

describe('LineItemEditor Description grows in a real browser', () => {
  it('keeps scrollHeight <= clientHeight at 375 and 390 in view and edit', async () => {
    const outDir = await bundleHarness();
    const server = await serveDir(outDir);
    const browser = await launchBrowser();
    const page = await browser.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', (err: Error) => pageErrors.push(err.message));
    const rows: Array<DescMetrics & { width: number; mode: string; kind: string }> = [];
    try {
      for (const width of [375, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(server.url, { waitUntil: 'load' });
        if (pageErrors.length) throw new Error(pageErrors.join('\n'));
        await page.waitForFunction('typeof window.mountLineEditor === "function"');
        for (const mode of ['edit', 'view'] as const) {
          for (const [kind, text] of [['three-line', THREE_LINE], ['long', LONG]] as const) {
            await page.evaluate(`window.mountLineEditor(${JSON.stringify(mode)}, ${JSON.stringify(text)})`);
            await page.waitForSelector('[aria-label="Description"]');
            await page.waitForTimeout(50);
            const metrics = await page.evaluate(`(() => {
              const el = document.querySelector('[aria-label="Description"]');
              if (!el) throw new Error('missing Description');
              return {
                tag: el.tagName,
                scrollHeight: el.scrollHeight,
                clientHeight: el.clientHeight,
                heightStyle: el.style.height,
              };
            })()`) as DescMetrics;
            rows.push({ ...metrics, width, mode, kind });
            expect(metrics.scrollHeight, `${mode} ${kind} @${width} sh ${metrics.scrollHeight} ch ${metrics.clientHeight}`).toBeLessThanOrEqual(metrics.clientHeight);
            expect(metrics.scrollHeight).toBeGreaterThan(44);
            if (mode === 'edit') {
              expect(metrics.tag).toBe('TEXTAREA');
              expect(metrics.heightStyle).toMatch(/px$/);
            } else {
              expect(metrics.tag).toBe('P');
            }
          }
        }
      }
    } finally {
      await browser.close();
      await server.close();
    }
    if (pageErrors.length) throw new Error(pageErrors.join('\n'));
    expect(rows).toHaveLength(8);
  }, 60_000);

  it('fits quote and invoice Description after a width change with no keystroke', async () => {
    const outDir = await bundleHarness();
    const server = await serveDir(outDir);
    const browser = await launchBrowser();
    const page = await browser.newPage();
    const frames: Array<{ kind: string; from: number; to: number } & FieldMetrics> = [];
    const fresh1280: Record<string, FieldMetrics> = {};
    try {
      for (const kind of ['quote', 'invoice'] as const) {
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto(server.url, { waitUntil: 'load' });
        await openDoc(page, kind, LONG);
        fresh1280[kind] = await page.evaluate(FIELD_METRICS) as FieldMetrics;
        for (const [from, to] of [[1280, 375], [1024, 390], [375, 1280], [390, 1024]] as const) {
          await page.setViewportSize({ width: from, height: 900 });
          await page.goto(server.url, { waitUntil: 'load' });
          await openDoc(page, kind, LONG);
          await page.setViewportSize({ width: to, height: 900 });
          await page.waitForTimeout(80);
          const metrics = await page.evaluate(FIELD_METRICS) as FieldMetrics;
          frames.push({ kind, from, to, ...metrics });
          assertFits(`${kind} ${from}->${to}`, metrics);
          if (from < to) {
            expect(
              Math.abs(metrics.h - fresh1280[kind].h),
              `${kind} ${from}->${to} h ${metrics.h} fresh1280 ${fresh1280[kind].h}`,
            ).toBeLessThanOrEqual(2);
          }
        }
      }
    } finally {
      await browser.close();
      await server.close();
    }
    expect(frames).toHaveLength(8);
  }, 120_000);

  it('fits quote and invoice Description after a no-keystroke width round trip', async () => {
    const outDir = await bundleHarness();
    const server = await serveDir(outDir);
    const browser = await launchBrowser();
    const page = await browser.newPage();
    const frames: Array<{ kind: string; seq: string; width: number } & FieldMetrics> = [];
    try {
      for (const kind of ['quote', 'invoice'] as const) {
        for (const seq of [[375, 1280, 375], [1280, 375, 1280]] as const) {
          await page.setViewportSize({ width: seq[0], height: 900 });
          await page.goto(server.url, { waitUntil: 'load' });
          await openDoc(page, kind, LONG);
          for (const width of seq) {
            await page.setViewportSize({ width, height: 900 });
            await page.waitForTimeout(80);
            const metrics = await page.evaluate(FIELD_METRICS) as FieldMetrics;
            frames.push({ kind, seq: seq.join('->'), width, ...metrics });
            assertFits(`${kind} ${seq.join('->')} @${width}`, metrics);
          }
        }
      }
    } finally {
      await browser.close();
      await server.close();
    }
    expect(frames).toHaveLength(12);
  }, 120_000);

  it('grows quote and invoice Description on a keystroke at 375', async () => {
    const outDir = await bundleHarness();
    const server = await serveDir(outDir);
    const browser = await launchBrowser();
    const page = await browser.newPage();
    try {
      for (const kind of ['quote', 'invoice'] as const) {
        await page.setViewportSize({ width: 375, height: 900 });
        await page.goto(server.url, { waitUntil: 'load' });
        await openDoc(page, kind, 'Hi');
        const field = page.locator('textarea[aria-label="Description"]');
        await field.waitFor();
        await field.fill(LONG);
        await page.waitForTimeout(80);
        const grown = await page.evaluate(FIELD_METRICS) as FieldMetrics;
        assertFits(`${kind} keystroke LONG`, grown);
        expect(grown.sh).toBeGreaterThan(44);
        await field.fill(LABOUR);
        await page.waitForTimeout(80);
        const shrunk = await page.evaluate(FIELD_METRICS) as FieldMetrics;
        assertFits(`${kind} keystroke Labour`, shrunk);
        expect(shrunk.h, `${kind} Labour h ${shrunk.h}`).toBeLessThanOrEqual(46);
      }
    } finally {
      await browser.close();
      await server.close();
    }
  }, 60_000);

  it('fits the remaining Description after removing the first line at 375', async () => {
    const outDir = await bundleHarness();
    const server = await serveDir(outDir);
    const browser = await launchBrowser();
    const page = await browser.newPage();
    const rows: Array<{ kind: string } & FieldMetrics> = [];
    try {
      for (const kind of ['quote', 'invoice'] as const) {
        await page.setViewportSize({ width: 375, height: 900 });
        await page.goto(server.url, { waitUntil: 'load' });
        await openDoc(page, kind, [LABOUR, LONG]);
        await page.waitForFunction('document.querySelectorAll(\'button[aria-label="Remove line"]\').length >= 2');
        await page.evaluate(`document.querySelectorAll('button[aria-label="Remove line"]')[0].click()`);
        await page.waitForFunction('document.querySelectorAll(\'textarea[aria-label="Description"]\').length === 1');
        await page.waitForTimeout(80);
        const metrics = await page.evaluate(FIELD_METRICS) as FieldMetrics;
        rows.push({ kind, ...metrics });
        expect(metrics.value).toBe(LONG);
        assertFits(`${kind} remove-first`, metrics);
      }
    } finally {
      await browser.close();
      await server.close();
    }
    expect(rows).toHaveLength(2);
  }, 60_000);

  it('grows Description after a cost-model pick sets a long name at 375', async () => {
    const outDir = await bundleHarness();
    const server = await serveDir(outDir);
    const browser = await launchBrowser();
    const page = await browser.newPage();
    const rows: Array<{ kind: string } & FieldMetrics> = [];
    try {
      for (const kind of ['quote', 'invoice'] as const) {
        await page.setViewportSize({ width: 375, height: 900 });
        await page.goto(server.url, { waitUntil: 'load' });
        await openDoc(page, kind, '');
        await page.waitForSelector('.hub-line-editor-cost select option[value="cm-long"]', { state: 'attached' });
        await page.locator('.hub-line-editor-cost select').first().selectOption('cm-long');
        await page.waitForFunction(`document.querySelector('textarea[aria-label="Description"]')?.value.length > 40`);
        await page.waitForTimeout(80);
        const metrics = await page.evaluate(FIELD_METRICS) as FieldMetrics;
        rows.push({ kind, ...metrics });
        expect(metrics.value).toBe(LONG);
        assertFits(`${kind} cost-model pick`, metrics);
        expect(metrics.sh).toBeGreaterThan(44);
      }
    } finally {
      await browser.close();
      await server.close();
    }
    expect(rows).toHaveLength(2);
  }, 60_000);

  it('disconnects description observers on unmount and line remove', async () => {
    const outDir = await bundleHarness();
    const server = await serveDir(outDir);
    const browser = await launchBrowser();
    const page = await browser.newPage();
    try {
      await page.setViewportSize({ width: 375, height: 900 });
      await page.goto(server.url, { waitUntil: 'load' });
      await page.waitForFunction('typeof window.unmountEditor === "function"');
      await page.evaluate('window.__roReset()');
      for (let i = 0; i < 5; i += 1) {
        await openDoc(page, 'quote', LONG);
        await page.evaluate('window.unmountEditor()');
        await page.waitForTimeout(40);
      }
      const afterCycles = await page.evaluate('window.__roStats()') as RoStats;
      expect(afterCycles.disconnects, `cycles ctor ${afterCycles.constructors} disc ${afterCycles.disconnects} live ${afterCycles.live}`).toBe(afterCycles.constructors);
      expect(afterCycles.live).toBe(0);

      await page.evaluate('window.__roReset()');
      await openDoc(page, 'invoice', [LABOUR, LONG]);
      await page.waitForFunction('document.querySelectorAll(\'textarea[aria-label="Description"]\').length === 2');
      const beforeRemove = await page.evaluate('window.__roStats()') as RoStats;
      await page.evaluate(`document.querySelectorAll('button[aria-label="Remove line"]')[0].click()`);
      await page.waitForFunction('document.querySelectorAll(\'textarea[aria-label="Description"]\').length === 1');
      await page.waitForTimeout(40);
      const afterRemove = await page.evaluate('window.__roStats()') as RoStats;
      expect(beforeRemove.live).toBeGreaterThanOrEqual(2);
      expect(afterRemove.live, `remove live ${afterRemove.live} before ${beforeRemove.live}`).toBe(beforeRemove.live - 1);
    } finally {
      await browser.close();
      await server.close();
    }
  }, 90_000);
});
