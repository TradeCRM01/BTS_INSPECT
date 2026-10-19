import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (html: string) => {
    window: {
      document: { documentElement: Element };
      getComputedStyle: (el: Element) => { getPropertyValue: (n: string) => string };
    };
  };
};

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function firstDecl(css: string, property: string): string {
  const re = new RegExp(`${property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*([^;]+);`);
  const match = css.match(re);
  if (!match) throw new Error(`missing ${property}`);
  return match[1].trim();
}

function computedRoot(htmlAttr = ''): { getPropertyValue: (n: string) => string } {
  const tokens = src('src/styles/tokens.css');
  const indexCss = src('src/index.css');
  const mapping = [
    `--ops-navy: ${firstDecl(indexCss, '--ops-navy')};`,
    `--ops-cream: ${firstDecl(indexCss, '--ops-cream')};`,
  ].join('\n');
  const html = `<!doctype html><html${htmlAttr}><head><style>${tokens}\n:root { ${mapping} }</style></head><body></body></html>`;
  const dom = new JSDOM(html);
  return dom.window.getComputedStyle(dom.window.document.documentElement);
}

describe('computed --g-* tokens and re-points', () => {
  it('kills M4 dropped Light token: computed --g-bg is cream', () => {
    const style = computedRoot();
    expect(style.getPropertyValue('--g-bg').trim()).toBe('#F5F0E6');
    expect(style.getPropertyValue('--g-ink').trim()).toBe('#0A2540');
    expect(style.getPropertyValue('--g-accent').trim()).toBe('#2E75B6');
  });

  it('kills hand-set data-theme=dark while allowDark=false: Light computed style is unchanged', () => {
    const light = computedRoot();
    const forced = computedRoot(' data-theme="dark"');
    const keys = ['--g-bg', '--g-ink', '--g-accent', '--g-font-sans', '--g-font-ui', '--g-font-title', '--g-font-mono'];
    const lightMap = Object.fromEntries(keys.map((k) => [k, light.getPropertyValue(k).trim()]));
    const forcedMap = Object.fromEntries(keys.map((k) => [k, forced.getPropertyValue(k).trim()]));
    expect(forcedMap).toEqual(lightMap);
    expect(lightMap['--g-bg']).toBe('#F5F0E6');
    expect(lightMap['--g-ink']).toBe('#0A2540');
    expect(lightMap['--g-font-sans']).toContain('Geist');
    expect(src('src/styles/tokens.css')).not.toMatch(/(?:^|\n)\s*\[data-theme="dark"\]\s*\{/);
    expect(src('src/styles/tokens.css')).toContain('html[data-allow-dark="true"][data-theme="dark"]');
  });

  it('kills a mutant that drops the allowDark gate: forced dark then paints #0A0A0B', () => {
    const tokens = src('src/styles/tokens.css');
    const mutant = tokens.replace(
      'html[data-allow-dark="true"][data-theme="dark"]',
      '[data-theme="dark"]',
    );
    expect(mutant).not.toBe(tokens);
    const indexCss = src('src/index.css');
    const mapping = [
      `--ops-navy: ${firstDecl(indexCss, '--ops-navy')};`,
      `--ops-cream: ${firstDecl(indexCss, '--ops-cream')};`,
    ].join('\n');
    const html = `<!doctype html><html data-theme="dark"><head><style>${mutant}\n:root { ${mapping} }</style></head><body></body></html>`;
    const dom = new JSDOM(html);
    const style = dom.window.getComputedStyle(dom.window.document.documentElement);
    expect(style.getPropertyValue('--g-bg').trim()).toBe('#0A0A0B');
    expect(style.getPropertyValue('--g-ink').trim()).toBe('#FAFAFA');
    expect(computedRoot(' data-theme="dark"').getPropertyValue('--g-bg').trim()).toBe('#F5F0E6');
  });

  it('applies Dark tokens only when allowDark is true', () => {
    const style = computedRoot(' data-allow-dark="true" data-theme="dark"');
    expect(style.getPropertyValue('--g-bg').trim()).toBe('#0A0A0B');
    expect(style.getPropertyValue('--g-ink').trim()).toBe('#FAFAFA');
    expect(style.getPropertyValue('--g-font-sans').trim()).toContain('Geist');
  });

  it('kills M7 hand-edited re-point: computed --ops-navy is var(--g-ink)', () => {
    const style = computedRoot();
    expect(style.getPropertyValue('--ops-navy').trim()).toBe('var(--g-ink)');
    expect(style.getPropertyValue('--ops-cream').trim()).toBe('var(--g-bg)');
    expect(style.getPropertyValue('--g-ink').trim()).toBe('#0A2540');
  });
});
