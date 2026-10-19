import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveConfig, type IndexHtmlTransformContext, type Plugin } from 'vite';

function flattenPlugins(plugins: readonly Plugin[]): Plugin[] {
  return plugins.filter((plugin): plugin is Plugin => Boolean(plugin));
}

async function applyIndexHtmlTransforms(plugins: readonly Plugin[], html: string): Promise<string> {
  const ctx = {
    path: '/index.html',
    filename: resolve(process.cwd(), 'index.html'),
    originalUrl: '/',
  } as IndexHtmlTransformContext;
  let out = html;
  for (const plugin of plugins) {
    const hook = plugin.transformIndexHtml;
    if (!hook) continue;
    const handler = typeof hook === 'function'
      ? hook
      : 'handler' in hook
        ? hook.handler
        : hook.transform;
    if (typeof handler !== 'function') continue;
    const result = await (handler as (
      html: string,
      ctx: IndexHtmlTransformContext,
    ) => string | { html?: string } | Promise<string | { html?: string } | void> | void)(out, ctx);
    if (typeof result === 'string') out = result;
    else if (result && typeof result === 'object' && 'html' in result && typeof result.html === 'string') {
      out = result.html;
    }
  }
  return out;
}

describe('resolved vite.config.ts brands the page and PWA manifest', () => {
  afterEach(() => {
    delete process.env.BRAND_NAME;
  });

  it('loads the real config with BRAND_NAME=Acmeco and leaves 0 placeholders', async () => {
    process.env.BRAND_NAME = 'Acmeco';
    const resolved = await resolveConfig(
      { configFile: resolve(process.cwd(), 'vite.config.ts'), mode: 'production' },
      'build',
      'production',
    );
    const plugins = flattenPlugins(resolved.plugins as Plugin[]);
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const out = await applyIndexHtmlTransforms(plugins, html);

    expect(out.includes('%BRAND_NAME%')).toBe(false);
    expect(out).toContain('<title>Acmeco — Trade job software for Australian crews</title>');
    expect(out).toContain('property="og:site_name" content="Acmeco"');
    expect(out).not.toMatch(/\bGrafter\b/);

    const pwa = plugins.find((plugin) => plugin.name === 'vite-plugin-pwa' && plugin.api);
    expect(pwa?.api).toBeTruthy();
    const bundle: Record<string, { source?: string }> = {};
    pwa!.api.generateBundle(bundle);
    const manifestSource = bundle['manifest.webmanifest']?.source;
    expect(typeof manifestSource).toBe('string');
    const manifest = JSON.parse(manifestSource as string) as { name: string; short_name: string };
    expect(manifest.name).toBe('Acmeco');
    expect(manifest.short_name).toBe('Acmeco');
    expect(JSON.stringify(manifest)).not.toMatch(/\bGrafter\b/);
  }, 30000);

  it('uses the brand.ts constant when BRAND_NAME is unset', async () => {
    delete process.env.BRAND_NAME;
    const dir = mkdtempSync(join(tmpdir(), 'k9g-'));
    mkdirSync(join(dir, 'src/lib'), { recursive: true });
    writeFileSync(join(dir, 'vite.config.ts'), readFileSync(resolve(process.cwd(), 'vite.config.ts')));
    writeFileSync(join(dir, 'index.html'), readFileSync(resolve(process.cwd(), 'index.html')));
    writeFileSync(join(dir, 'src/lib/brandVite.ts'), readFileSync(resolve(process.cwd(), 'src/lib/brandVite.ts')));
    writeFileSync(
      join(dir, 'src/lib/brand.ts'),
      readFileSync(resolve(process.cwd(), 'src/lib/brand.ts'), 'utf8').replace(
        "export const BRAND_NAME = 'Grafter' as const",
        "export const BRAND_NAME = 'Acmeco' as const",
      ),
    );
    symlinkSync(resolve(process.cwd(), 'node_modules'), join(dir, 'node_modules'));

    const resolved = await resolveConfig(
      { configFile: join(dir, 'vite.config.ts'), root: dir, mode: 'production' },
      'build',
      'production',
    );
    const plugins = flattenPlugins(resolved.plugins as Plugin[]);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    const out = await applyIndexHtmlTransforms(plugins, html);

    expect(out.includes('%BRAND_NAME%')).toBe(false);
    expect(out).toContain('<title>Acmeco — Trade job software for Australian crews</title>');
    expect(out).toContain('property="og:site_name" content="Acmeco"');
    expect(out).not.toMatch(/\bGrafter\b/);

    const pwa = plugins.find((plugin) => plugin.name === 'vite-plugin-pwa' && plugin.api);
    expect(pwa?.api).toBeTruthy();
    const bundle: Record<string, { source?: string }> = {};
    pwa!.api.generateBundle(bundle);
    const manifestSource = bundle['manifest.webmanifest']?.source;
    expect(typeof manifestSource).toBe('string');
    const manifest = JSON.parse(manifestSource as string) as { name: string; short_name: string };
    expect(manifest.name).toBe('Acmeco');
    expect(manifest.short_name).toBe('Acmeco');
    expect(JSON.stringify(manifest)).not.toMatch(/\bGrafter\b/);
  }, 30000);
});

