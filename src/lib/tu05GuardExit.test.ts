import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const passHtml = readFileSync(resolve(process.cwd(), 'scripts/tu05-fixtures/pass.html'), 'utf8');
const failHtml = readFileSync(resolve(process.cwd(), 'scripts/tu05-fixtures/fail.html'), 'utf8');

function serve(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const html = req.url?.includes('fail') ? failHtml : passHtml;
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

function runGuard(url: string): Promise<{ code: number; out: string }> {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, ['scripts/measure-tu05-topbar.mjs'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        LOOK_BASE_URL: url,
        TU05_WIDTHS: '800',
        TU05_SKIP_CLICK: '1',
      },
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
  it('exits 0 on a passing header (G2 kill)', async () => {
    const { code, out } = await runGuard(`${server.url}/pass`);
    expect(out, out).toMatch(/TU05 guard passed/);
    expect(code, out).toBe(0);
  }, 30000);

  it('exits 1 on an overflowing header (G1 kill)', async () => {
    const { code, out } = await runGuard(`${server.url}/fail`);
    expect(out, out).toMatch(/TU05 guard failed/);
    expect(code, out).toBe(1);
  }, 30000);
});
