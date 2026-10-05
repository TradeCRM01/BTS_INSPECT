import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { onRequest, rejectHtmlAsset } from '../../functions/assets/[[path]]';

describe('rejectHtmlAsset', () => {
  it('returns 404 text/plain no-store when ASSETS serves HTML', async () => {
    const assets = {
      fetch: async () =>
        new Response('<!doctype html><html></html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    };
    const res = await rejectHtmlAsset(new Request('https://example.test/assets/missing-r2.js'), assets);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/text\/plain/);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toBe('Not found');
  });

  it('passes JS through unchanged', async () => {
    const assets = {
      fetch: async () =>
        new Response('export default 1', {
          status: 200,
          headers: {
            'content-type': 'application/javascript',
            'cache-control': 'public, max-age=31536000, immutable',
          },
        }),
    };
    const res = await rejectHtmlAsset(new Request('https://example.test/assets/ok-r2.js'), assets);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/javascript');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(await res.text()).toBe('export default 1');
  });

  it('onRequest uses env.ASSETS.fetch', async () => {
    const res = await onRequest({
      request: new Request('https://example.test/assets/x.js'),
      env: {
        ASSETS: {
          fetch: async () =>
            new Response('<html></html>', { headers: { 'content-type': 'text/html' } }),
        },
      },
    });
    expect(res.status).toBe(404);
  });
});

describe('Pages Function routing and -r2 hashes', () => {
  function src(rel: string): string {
    return readFileSync(resolve(process.cwd(), rel), 'utf8');
  }

  it('invokes Functions only on /assets/* and deploys functions from repo root', () => {
    const routes = JSON.parse(src('public/_routes.json')) as {
      version: number;
      include: string[];
      exclude: string[];
    };
    expect(routes).toEqual({ version: 1, include: ['/assets/*'], exclude: [] });
    const workflow = src('.github/workflows/deploy-pages.yml');
    expect(workflow).toContain('pages deploy dist');
    expect(workflow).toContain('functions/assets/');
    expect(workflow).toContain('dist/_routes.json');
    expect(src('wrangler.toml')).toContain('pages_build_output_dir = "dist"');
    expect(src('functions/assets/[[path]].ts')).toContain('env.ASSETS.fetch');
    expect(src('vite.config.ts')).toContain("chunkFileNames: 'assets/[name]-[hash]-r2.js'");
    expect(src('vite.config.ts')).toContain("entryFileNames: 'assets/[name]-[hash]-r2.js'");
    expect(src('vite.config.ts')).toContain("assetFileNames: 'assets/[name]-[hash]-r2[extname]'");
    expect(src('src/main.tsx')).not.toMatch(/VITE_BUILD_ID\s*=/);
  });
});
