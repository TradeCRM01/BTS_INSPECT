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

  it('kills M4b dropped dark block: computed [data-theme=dark] --g-bg is #0A0A0B', () => {
    const style = computedRoot(' data-theme="dark"');
    expect(style.getPropertyValue('--g-bg').trim()).toBe('#0A0A0B');
    expect(style.getPropertyValue('--g-ink').trim()).toBe('#FAFAFA');
  });

  it('kills M7 hand-edited re-point: computed --ops-navy is var(--g-ink)', () => {
    const style = computedRoot();
    expect(style.getPropertyValue('--ops-navy').trim()).toBe('var(--g-ink)');
    expect(style.getPropertyValue('--ops-cream').trim()).toBe('var(--g-bg)');
    expect(style.getPropertyValue('--g-ink').trim()).toBe('#0A2540');
  });
});
