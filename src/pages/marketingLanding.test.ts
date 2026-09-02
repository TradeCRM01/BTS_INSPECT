import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('public Grafter landing', () => {
  it('shows visitors a marketing page and keeps the dashboard for a signed-in session', () => {
    const root = src('src/pages/RootPage.tsx');
    expect(root).toContain('if (!user) return <MarketingPage />');
    expect(root).toContain('DashboardPage');
    expect(src('src/App.tsx')).toContain('path="/" element={<RootPage />}');
  });

  it('uses Grafter navy/cream craft, not a Looplet clone', () => {
    const page = src('src/pages/MarketingPage.tsx');
    const css = src('src/index.css');
    expect(page).toContain('Trade job software, from quote');
    expect(page).toContain('to payment.');
    expect(page).toContain('Australian electrical and trade job software');
    expect(page).not.toContain('from the ute');
    expect(page).toContain('Create a workspace');
    expect(page).toContain('/signup');
    expect(page).toContain('/login');
    expect(page).toContain('grafter.com.au');
    expect(page).not.toContain('brushless');
    expect(page).not.toContain('Fraunces');
    expect(page).not.toContain('Geist');
    expect(page).not.toContain('Simpro');
    expect(page).not.toContain('Relovi');
    expect(page).not.toContain('hub-marketing-kicker');
    expect(css).toContain('--public-page: #F5F0E6');
    const marketing = css.slice(css.indexOf('.hub-marketing {'), css.indexOf('.hub-auth {'));
    expect(marketing).toContain('--public-sheet: #FFFDF8');
    expect(marketing).toContain('--public-ink: #0A2540');
    expect(marketing).toContain('--public-line: #E2D9CC');
    expect(marketing).toContain('--public-action: #2E75B6');
    expect(marketing).toContain("font-family: Rajdhani, sans-serif");
    expect(marketing).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(marketing).toContain('inset 0 1px 0 #fff');
    expect(marketing).toContain('0 10px 28px rgba(10, 37, 64, 0.08)');
    expect(marketing).not.toContain('Newsreader');
    expect(marketing).not.toContain('background: var(--ops-navy)');
  });
});
