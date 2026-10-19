import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const THREE_LINE = 'Labour — fault find tripping RCD, 2 techs\nReplace damaged GPO double (HPM Excel)\nTest and tag on site';
const LONG = 'Replace damaged GPO double (HPM Excel) and run a new circuit back to the switchboard with labelled breakers and a written test sheet for the client.';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

type DescMetrics = {
  tag: string;
  scrollHeight: number;
  clientHeight: number;
  heightStyle: string;
};

async function launchBrowser() {
  const chromeCandidates = [
    process.env.CHROME_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    '/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter((path): path is string => !!path && existsSync(path));
  const executablePath = chromeCandidates[0];
  const errors: string[] = [];
  for (const spec of ['playwright-core', 'playwright']) {
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
    const frames: Array<{ kind: string; from: number; to: number; sh: number; ch: number; overflowY: string }> = [];
    try {
      for (const kind of ['quote', 'invoice'] as const) {
        const mount = kind === 'quote' ? 'mountQuoteEditor' : 'mountInvoiceEditor';
        const editName = kind === 'quote' ? /Edit quote/i : /Edit invoice/i;
        for (const [from, to] of [[1280, 375], [1024, 390], [375, 1280]] as const) {
          await page.setViewportSize({ width: from, height: 900 });
          await page.goto(server.url, { waitUntil: 'load' });
          await page.waitForFunction(`typeof window.${mount} === "function"`);
          await page.evaluate(`window.${mount}(${JSON.stringify(LONG)})`);
          await page.waitForFunction(`[...document.querySelectorAll('button')].some(b => ${editName}.test(b.textContent || ''))`);
          await page.evaluate(`([...document.querySelectorAll('button')].find(b => ${editName}.test(b.textContent || ''))).click()`);
          await page.waitForSelector('textarea[aria-label="Description"]');
          await page.waitForTimeout(80);
          await page.setViewportSize({ width: to, height: 900 });
          await page.waitForTimeout(80);
          const metrics = await page.evaluate(`(() => {
            const el = document.querySelector('textarea[aria-label="Description"]');
            if (!el) throw new Error('missing Description');
            const cs = getComputedStyle(el);
            return { sh: el.scrollHeight, ch: el.clientHeight, overflowY: cs.overflowY };
          })()`) as { sh: number; ch: number; overflowY: string };
          frames.push({ kind, from, to, ...metrics });
          expect(metrics.overflowY, `${kind} ${from}->${to} overflow`).toBe('hidden');
          if (from > to) {
            expect(metrics.sh, `${kind} ${from}->${to} sh ${metrics.sh} ch ${metrics.ch}`).toBeLessThanOrEqual(metrics.ch);
          } else {
            expect(Math.abs(metrics.sh - metrics.ch), `${kind} ${from}->${to} shrink sh ${metrics.sh} ch ${metrics.ch}`).toBeLessThanOrEqual(2);
          }
        }
      }
    } finally {
      await browser.close();
      await server.close();
    }
    expect(frames).toHaveLength(6);
  }, 90_000);

  it('grows quote and invoice Description on a keystroke at 375', async () => {
    const outDir = await bundleHarness();
    const server = await serveDir(outDir);
    const browser = await launchBrowser();
    const page = await browser.newPage();
    try {
      for (const kind of ['quote', 'invoice'] as const) {
        const mount = kind === 'quote' ? 'mountQuoteEditor' : 'mountInvoiceEditor';
        const editName = kind === 'quote' ? /Edit quote/i : /Edit invoice/i;
        await page.setViewportSize({ width: 375, height: 900 });
        await page.goto(server.url, { waitUntil: 'load' });
        await page.waitForFunction(`typeof window.${mount} === "function"`);
        await page.evaluate(`window.${mount}("Hi")`);
        await page.waitForFunction(`[...document.querySelectorAll('button')].some(b => ${editName}.test(b.textContent || ''))`);
        await page.evaluate(`([...document.querySelectorAll('button')].find(b => ${editName}.test(b.textContent || ''))).click()`);
        const field = page.locator('textarea[aria-label="Description"]');
        await field.waitFor();
        await field.fill(LONG);
        await page.waitForTimeout(80);
        const metrics = await page.evaluate(`(() => {
          const el = document.querySelector('textarea[aria-label="Description"]');
          if (!el) throw new Error('missing Description');
          return { sh: el.scrollHeight, ch: el.clientHeight, overflowY: getComputedStyle(el).overflowY };
        })()`) as { sh: number; ch: number; overflowY: string };
        expect(metrics.overflowY, `${kind} keystroke overflow`).toBe('hidden');
        expect(metrics.sh, `${kind} keystroke sh ${metrics.sh} ch ${metrics.ch}`).toBeLessThanOrEqual(metrics.ch);
        expect(metrics.sh).toBeGreaterThan(44);
      }
    } finally {
      await browser.close();
      await server.close();
    }
  }, 60_000);
});
