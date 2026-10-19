import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const FIXTURE_NAME = 'Fixture Co';
const fixtureDir = resolve(process.cwd(), 'scripts/tu05-fixtures');

function load(name: string): string {
  return readFileSync(resolve(fixtureDir, name), 'utf8');
}

const pages: Record<string, string> = {
  pass: load('pass.html'),
  fail: load('fail.html'),
  'overflow-1px': load('overflow-1px.html'),
  'button-overflow': load('button-overflow.html'),
  'field-tall': load('field-tall.html'),
  overlap: load('overlap.html'),
  'unnamed-search': load('unnamed-search.html'),
  'search-covered': load('search-covered.html'),
  'doc-overflow': load('doc-overflow.html'),
  'search-label': load('search-label.html'),
  'search-wide': load('search-wide.html'),
  'search-wide-empty': load('search-wide-empty.html'),
};

function serve(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const key = (req.url || '/pass').split('?')[0].replace(/^\//, '') || 'pass';
    const html = pages[key] || pages.pass;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  return new Promise((resolveStart) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('no port');
      resolveStart({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

function runGuard(url: string, opts?: { skipClick?: boolean }): Promise<{ code: number; out: string }> {
  return new Promise((resolveRun) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      LOOK_BASE_URL: url,
      TU05_WIDTHS: '800',
      TU05_NAMES: FIXTURE_NAME,
    };
    if (opts?.skipClick !== false) env.TU05_SKIP_CLICK = '1';
    else delete env.TU05_SKIP_CLICK;
    const child = spawn(process.execPath, ['scripts/measure-tu05-topbar.mjs'], {
      cwd: process.cwd(),
      env,
    });
    let out = '';
    child.stdout.on('data', (d) => { out += String(d); });
    child.stderr.on('data', (d) => { out += String(d); });
    child.on('close', (code) => resolveRun({ code: code ?? 1, out }));
  });
}

let server: { url: string; close: () => Promise<void> };

beforeAll(async () => {
  server = await serve();
});

afterAll(async () => {
  await server.close();
});

describe('TU05 guard exit codes', () => {
  it('exits 0 on a passing header', async () => {
    const { code, out } = await runGuard(`${server.url}/pass`);
    expect(out, out).toMatch(/TU05 guard passed/);
    expect(code, out).toBe(0);
  }, 30000);

  it('never writes title or aria-label onto the switcher (A4)', () => {
    const src = readFileSync(resolve(process.cwd(), 'scripts/measure-tu05-topbar.mjs'), 'utf8');
    expect(src).toContain('auditName');
    expect(src).not.toMatch(/setAttribute\(\s*['"]title['"]/);
    expect(src).not.toMatch(/setAttribute\(\s*['"]aria-label['"]/);
    expect(src).not.toMatch(/\.title\s*=/);
    expect(src).not.toMatch(/textContent\s*=/);
  });

  it('exits 1 when the header overflows by 1px (G1)', async () => {
    const { code, out } = await runGuard(`${server.url}/overflow-1px`);
    expect(out, out).toMatch(/TU05 guard failed/);
    expect(code, out).toBe(1);
  }, 30000);

  it('exits 1 when a button scrollWidth exceeds clientWidth (G2)', async () => {
    const { code, out } = await runGuard(`${server.url}/button-overflow`);
    expect(out, out).toMatch(/TU05 guard failed/);
    expect(code, out).toBe(1);
  }, 30000);

  it('exits 1 when the Field Work button is 60px tall (G5)', async () => {
    const { code, out } = await runGuard(`${server.url}/field-tall`);
    expect(out, out).toMatch(/TU05 guard failed/);
    expect(code, out).toBe(1);
  }, 30000);

  it('exits 1 when two leaf buttons overlap (G6)', async () => {
    const { code, out } = await runGuard(`${server.url}/overlap`);
    expect(out, out).toMatch(/TU05 guard failed/);
    expect(code, out).toBe(1);
  }, 30000);

  it('exits 1 when Search has no accessible name at 800 (G7)', async () => {
    const { code, out } = await runGuard(`${server.url}/unnamed-search`);
    expect(out, out).toMatch(/TU05 guard failed/);
    expect(code, out).toBe(1);
  }, 30000);

  it('exits 1 when Search is covered and click is enabled (G8)', async () => {
    const { code, out } = await runGuard(`${server.url}/search-covered`, { skipClick: false });
    expect(out, out).toMatch(/TU05 guard failed/);
    expect(code, out).toBe(1);
  }, 30000);

  it('exits 1 when document scrollWidth exceeds innerWidth (G9)', async () => {
    const { code, out } = await runGuard(`${server.url}/doc-overflow`);
    expect(out, out).toMatch(/TU05 guard failed/);
    expect(code, out).toBe(1);
  }, 30000);

  it('exits 1 when Search shows a label at 800 (S1)', async () => {
    const { code, out } = await runGuard(`${server.url}/search-label`);
    expect(out, out).toMatch(/TU05 guard failed/);
    expect(code, out).toBe(1);
  }, 30000);

  it('exits 1 when Search is a 192px labelled pill at 800 (S2)', async () => {
    const { code, out } = await runGuard(`${server.url}/search-wide`);
    expect(out, out).toMatch(/TU05 guard failed/);
    expect(code, out).toBe(1);
  }, 30000);

  it('exits 1 when Search is a 192px empty pill at 800 (S3)', async () => {
    const { code, out } = await runGuard(`${server.url}/search-wide-empty`);
    expect(out, out).toMatch(/TU05 guard failed/);
    expect(code, out).toBe(1);
  }, 30000);
});
