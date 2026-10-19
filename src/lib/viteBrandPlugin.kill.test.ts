import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./brand', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./brand')>();
  return {
    ...actual,
    BRAND_NAME: 'Acmeco',
    applyBrandHtml: (html: string, name = 'Acmeco') => actual.applyBrandHtml(html, name),
    brandManifestFields: (name = 'Acmeco') => actual.brandManifestFields(name),
  };
});

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('vite brand plugin wiring with BRAND_NAME=Acmeco', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('runs transformIndexHtml and brandPwaManifest as Acmeco, and both mutants die', async () => {
    expect(src('vite.config.ts')).toContain('brandHtmlPlugin');
    expect(src('vite.config.ts')).toContain('...brandPwaManifest()');
    expect(src('vite.config.ts')).not.toMatch(/name:\s*'Grafter'/);
    expect(src('src/lib/brandVite.ts')).toContain('return applyBrandHtml(html)');
    expect(src('src/lib/brandVite.ts')).toContain('return brandManifestFields()');

    const { brandHtmlPlugin, brandPwaManifest } = await import('./brandVite');
    const html = src('index.html');
    const out = brandHtmlPlugin.transformIndexHtml(html);
    expect(out).toContain('<title>Acmeco — Trade job software for Australian crews</title>');
    expect(out).toContain('content="Acmeco"');
    expect(out).not.toContain('%BRAND_NAME%');
    expect(out).not.toMatch(/\bGrafter\b/);
    expect(brandPwaManifest()).toEqual({ name: 'Acmeco', short_name: 'Acmeco' });

    const identityMutant = { transformIndexHtml: (page: string) => page };
    const identityOut = identityMutant.transformIndexHtml(html);
    expect(identityOut).toContain('%BRAND_NAME%');
    expect(identityOut).not.toContain('<title>Acmeco');
    expect(out).not.toEqual(identityOut);

    const literalManifest = { name: 'Grafter', short_name: 'Grafter' };
    expect(literalManifest).not.toEqual(brandPwaManifest());
    expect(literalManifest.name).toBe('Grafter');
    expect(brandPwaManifest().name).toBe('Acmeco');
  });
});
