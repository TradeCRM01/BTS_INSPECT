import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

export function parseTokenBlocks(tokensCss: string): { light: Map<string, string>; dark: Map<string, string> } {
  const stripped = tokensCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const light = new Map<string, string>();
  const dark = new Map<string, string>();
  const blockRe = /([^{]+)\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(stripped))) {
    const sel = m[1].replace(/\s+/g, ' ').trim();
    const dest = sel.includes('[data-theme="dark"]') ? dark : light;
    const declRe = /(--g-[a-z0-9-]+)\s*:\s*([^;]+);/g;
    let d: RegExpExecArray | null;
    while ((d = declRe.exec(m[2]))) {
      dest.set(d[1], d[2].trim());
    }
  }
  return { light, dark };
}

const TOKEN_NAMES = [
  '--g-bg', '--g-surface', '--g-surface-2', '--g-ink', '--g-ink-muted', '--g-ink-subtle',
  '--g-line', '--g-input-line', '--g-accent', '--g-accent-ink', '--g-focus', '--g-inverse',
  '--g-inverse-ink', '--g-inverse-hover', '--g-danger', '--g-danger-ink', '--g-ok', '--g-ok-bg',
  '--g-warn', '--g-warn-bg', '--g-bad', '--g-bad-bg', '--g-sent', '--g-sent-bg', '--g-draft',
  '--g-draft-bg', '--g-scrim', '--g-nav-bg', '--g-nav-ink', '--g-sh-1', '--g-sh-2',
  '--g-crew-1', '--g-crew-2', '--g-crew-3', '--g-crew-4', '--g-crew-5', '--g-crew-6',
  '--g-chart-1', '--g-chart-2', '--g-chart-3', '--g-chart-4',
  '--g-radius-sm', '--g-radius-md', '--g-radius-lg', '--g-radius-pill',
  '--g-font-sans', '--g-font-ui', '--g-font-title', '--g-font-mono',
  '--g-fs-caption', '--g-fs-small', '--g-fs-meta', '--g-fs-body', '--g-fs-input',
  '--g-fs-title', '--g-fs-h3', '--g-fs-h2', '--g-fs-h1', '--g-fs-display',
] as const;

describe('semantic --g-* tokens', () => {
  it('ships all 59 Light tokens plus the dark block', () => {
    expect(TOKEN_NAMES).toHaveLength(59);
    const css = src('src/styles/tokens.css');
    const { light, dark } = parseTokenBlocks(css);
    for (const name of TOKEN_NAMES) {
      expect(light.has(name), name).toBe(true);
    }
    expect(light.size).toBe(59);
    expect(css).toContain('[data-theme="dark"]');
    expect(dark.has('--g-bg')).toBe(true);
    expect(dark.has('--g-ink')).toBe(true);
    expect(dark.has('--g-crew-2')).toBe(false);
    expect(dark.has('--g-chart-3')).toBe(false);
    expect(dark.has('--g-chart-4')).toBe(false);
    expect(light.get('--g-bg')).toBe('#F5F0E6');
    expect(light.get('--g-surface')).toBe('#FFFDF8');
    expect(light.get('--g-ink')).toBe('#0A2540');
    expect(light.get('--g-accent')).toBe('#2E75B6');
    expect(src('src/index.css').startsWith("@import './styles/tokens.css';")).toBe(true);
  });

  it('map.json from-literals equal each token Light value', () => {
    const map = JSON.parse(src('scripts/a0-repoint/map.json')) as {
      repoints: { property: string; from: string; token: string }[];
    };
    const { light } = parseTokenBlocks(src('src/styles/tokens.css'));
    for (const entry of map.repoints) {
      expect(light.get(entry.token), `${entry.property} -> ${entry.token}`).toBe(entry.from);
    }
  });
});

describe('tokens kill table', () => {
  it('kills a dropped token at src/styles/tokens.test.ts TOKEN_NAMES', () => {
    const css = src('src/styles/tokens.css');
    const { light } = parseTokenBlocks(css);
    expect(light.has('--g-bg')).toBe(true);
    const mutant = css.replace('--g-bg:', '--g-page-dropped:');
    const dropped = parseTokenBlocks(mutant).light;
    expect(dropped.has('--g-bg')).toBe(false);
    expect(TOKEN_NAMES.every((name) => dropped.has(name))).toBe(false);
  });

  it('kills a dropped dark block at src/styles/tokens.css [data-theme=dark]', () => {
    const css = src('src/styles/tokens.css');
    expect(css).toContain('[data-theme="dark"]');
    const mutant = css.replace('[data-theme="dark"]', '[data-theme="night"]');
    const { dark } = parseTokenBlocks(mutant);
    expect(dark.has('--g-bg')).toBe(false);
    expect(parseTokenBlocks(css).dark.has('--g-bg')).toBe(true);
    const dir = mkdtempSync(join(tmpdir(), 'a0-tokens-'));
    writeFileSync(join(dir, 'tokens.css'), mutant);
    expect(readFileSync(join(dir, 'tokens.css'), 'utf8')).not.toContain('[data-theme="dark"]');
  });
});
