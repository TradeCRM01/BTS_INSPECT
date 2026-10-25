import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('assets list LOOK — Jobs/Clients page language', () => {
  it('paints Assets as a list page, not a card grid', () => {
    const page = src('src/pages/AssetsPage.tsx');
    const css = src('src/index.css');
    expect(page).toContain('hub-assets-list-doc');
    expect(page).toContain('ops-page-title">Assets');
    expect(page).toContain('New asset');
    expect(page).toContain('Search assets or clients');
    expect(page).toContain('Customer');
    expect(page).toContain('from(\'assets\')');
    expect(page).not.toContain('ViewToggle');
    expect(page).not.toContain('SummaryCard');
    expect(page).not.toContain('function AssetCard');
    expect(page).not.toMatch(/Grafter|Relovi|Littleloop/);
    expect(css).toContain('.hub-assets-list-doc');
    expect(css).toContain('font-size: 56px !important');
    expect(css).toContain('background: var(--g-inverse)');
    expect(css).not.toMatch(/\.hub-assets-list-doc[\s\S]{0,80}#F5F0E6/);
  });
});
