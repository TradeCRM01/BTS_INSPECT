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
    expect(page).toContain('Every job, from quote');
    expect(page).toContain('to payment.');
    expect(page).not.toContain('from the ute');
    expect(page).toContain('Create a workspace');
    expect(page).toContain('/signup');
    expect(page).toContain('/login');
    expect(page).toContain('grafter.com.au');
    expect(page).not.toContain('brushless');
    expect(page).not.toContain('Fraunces');
    expect(page).not.toContain('Geist');
    expect(css).toContain('background: var(--ops-cream)');
    expect(css.slice(css.indexOf('.hub-marketing {')))
      .toContain('font-family: Newsreader, Georgia, serif');
  });
});
