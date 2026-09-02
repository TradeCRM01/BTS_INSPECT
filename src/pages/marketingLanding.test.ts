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

  it('locks conversion copy on the existing public home, not the old brochure', () => {
    const page = src('src/pages/MarketingPage.tsx');
    const css = src('src/index.css');
    expect(page).toContain('One job. Quote to paid.');
    expect(page).toContain('Everything lives on the job.');
    expect(page).toContain('Custom templates');
    expect(page).toContain('SafetyCulture');
    expect(page).toContain('data-price-slot');
    expect(page).toContain('$59');
    expect(page).toContain('$119');
    expect(page).toContain('$199');
    expect(page).not.toContain('$79');
    expect(page).not.toContain('$149');
    expect(page).not.toContain('$249');
    expect(page).toContain('3 months free');
    expect(page).toContain('Crew');
    expect(page).toContain('Company');
    expect(page).toContain('Plant');
    expect(page).toContain('GST included');
    expect(page).not.toContain('$\u2014');
    expect(page).not.toContain('TBA');
    expect(page).not.toContain('SUPERNINTENDO_PRICE_FILL');
    expect(page).toContain('Create a workspace');
    expect(page).toContain('PublicLegalLinks');
    expect(page).toContain('Australian trade job software');
    expect(page).not.toContain('electrical and trade');
    expect(page).not.toContain('Northside Electrical');
    expect(page).not.toContain('Switchboard upgrade');
    expect(page).not.toContain('from the ute');
    expect(page).toContain('/signup');
    expect(page).toContain('/login');
    expect(page).toContain('Australian-built. grafter.com.au');
    expect(page).not.toContain('brushless');
    expect(page).not.toContain('Fraunces');
    expect(page).not.toContain('Geist');
    expect(css).toContain('background: var(--ops-cream)');
    expect(css.slice(css.indexOf('.hub-marketing {')))
      .toContain('font-family: Newsreader, Georgia, serif');
  });
});
