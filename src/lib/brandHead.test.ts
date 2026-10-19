import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRAND_DOMAIN, BRAND_NAME, BRAND_SUPPORT_EMAIL, BRAND_TAGLINE } from './brand';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('S1 head, manifest, and self-hosted Geist', () => {
  it('feeds title, og, twitter, and apple title from BRAND_NAME', () => {
    const html = src('index.html');
    expect(html).toContain('<title>%BRAND_NAME% — Trade job software for Australian crews</title>');
    expect(html).toContain('content="%BRAND_NAME%"');
    expect(html).toContain('content="%BRAND_NAME% — Trade job software for Australian crews"');
    expect(html).not.toMatch(/\bGrafter\b/);
    expect(src('vite.config.ts')).toContain('brandHtmlPlugin');
    expect(src('src/lib/brandVite.ts')).toContain('return applyBrandHtml(html)');
    expect(src('src/lib/brand.ts')).toContain("html.split('%BRAND_NAME%').join(name)");
    expect(src('vite.config.ts')).not.toMatch(/\bGrafter\b/);
    expect(BRAND_NAME).toBe('Grafter');
    expect(BRAND_DOMAIN).toBe('grafter.com.au');
    expect(BRAND_SUPPORT_EMAIL).toBe('support@grafter.com.au');
    expect(BRAND_TAGLINE).toBe('Trade job software for Australian crews');
  });

  it('ships two theme-color tags and keeps signature script families', () => {
    const html = src('index.html');
    expect(html).toContain('media="(prefers-color-scheme: light)" content="#F5F5F7"');
    expect(html).toContain('media="(prefers-color-scheme: dark)" content="#0A0A0B"');
    expect(html).toContain('rel="preload" href="/fonts/Geist-Variable.woff2"');
    expect(html).toContain('family=Allura');
    expect(html).toContain('family=Dancing+Script');
    expect(html).toContain('family=Great+Vibes');
    expect(html).toContain('family=Pacifico');
    expect(html).toContain('family=Satisfy');
    expect(html).not.toContain('family=Inter');
    expect(html).not.toContain('family=Newsreader');
    expect(html).not.toContain('family=Rajdhani');
    expect(html).not.toContain('family=JetBrains');
    expect(html).not.toContain('family=Source+Sans');
  });

  it('self-hosts Geist woff2 with OFL and a metric-matched fallback', () => {
    expect(existsSync(resolve(process.cwd(), 'public/fonts/Geist-Variable.woff2'))).toBe(true);
    expect(existsSync(resolve(process.cwd(), 'public/fonts/OFL.txt'))).toBe(true);
    const ofl = src('public/fonts/OFL.txt');
    expect(ofl).toContain('SIL Open Font License, Version 1.1');
    expect(ofl).toContain('Vercel');
    const tokens = src('src/styles/tokens.css');
    expect(tokens).toContain('font-display: optional');
    expect(tokens).toContain('size-adjust: 102.01%');
    expect(tokens).toContain('ascent-override: 98.52%');
    expect(tokens).toContain('descent-override: 28.92%');
    expect(tokens).toContain("local('Arial')");
    expect(tokens).not.toMatch(/https:\/\/fonts\.(googleapis|gstatic)\.com/);
  });
});
