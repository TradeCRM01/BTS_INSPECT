import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const COMPETITOR_NAMES = /SafetyCulture|Simpro|iAuditor/i;

function marketingLookCss(): string {
  const css = src('src/index.css');
  const lookStart = css.indexOf('/* Public landing look only.');
  const lookEnd = css.indexOf('/* Public legal paper + auth/marketing legal-link chrome only.');
  return css.slice(lookStart, lookEnd);
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
    expect(page).toContain(
      'Build your own test reports and inspections. Send the client a document that looks like your company. Custom templates are included — then JHA, Take 5, attach SWMS, and compliance, all filed on the same job.',
    );
    expect(page).toContain('#0042, and #0042.01 when a cost code is on the stage.');
    expect(page).toContain(
      '3 months free. Then seats only — same Grafter on every plan. AUD, GST included.',
    );
    expect(page).toContain('Do I need a separate templates app?');
    expect(page).toContain(
      'No. Custom inspection and test-report templates, JHA, Take 5, attach SWMS, and compliance live on the job.',
    );
    expect(page).toContain('Is this only for electricians?');
    expect(page).toContain('Does the client get a proper report?');
    expect(page).toContain('How is GST handled?');
    expect(page).toContain('What’s the difference between the plans?');
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
    expect(page).toContain('1–5 seats');
    expect(page).toContain('6–15 seats');
    expect(page).toContain('16–40 seats');
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
    expect(page).toContain('Workshop fit-out');
    expect(page).toContain('Northside Plumbing');
    expect(page).toContain('/signup');
    expect(page).toContain('/login');
    expect(page).toContain('Australian-built. grafter.com.au');
    expect(page).not.toContain('brushless');
    expect(page).not.toContain('Fraunces');
    expect(page).not.toContain('Geist');
    expect(css).toContain('background: var(--ops-cream)');
    const look = marketingLookCss();
    expect(look).toContain("font-family: Rajdhani, sans-serif");
    expect(look).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(look).toContain('--mkt-page: #F5F0E6');
    expect(look).toContain('--mkt-sheet: #FFFDF8');
    expect(look).toContain('--mkt-ink: #0A2540');
    expect(look).toContain('--mkt-muted: #5B6B7C');
    expect(look).toContain('--mkt-line: #E2D9CC');
    expect(look).toContain('background: #2E75B6');
    expect(look).toContain('height: 44px');
    expect(look).toContain('border-radius: 16px');
    expect(look).toContain('inset 0 1px 0 #fff');
    expect(look).toContain('0 10px 28px rgba(10, 37, 64, 0.08)');
    expect(look).toContain('font-variant-numeric: tabular-nums');
    expect(look).toContain('#pricing.hub-marketing-band');
    expect(look).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex|Fraunces|Geist/);
    expect(look).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow|lacquer|gloss|glow/);
    expect(look).not.toMatch(/#16A34A|#15803D|#1B7F3A/);
  });

  it('fails the build if competitor names return on the public home', () => {
    const page = src('src/pages/MarketingPage.tsx');
    const look = marketingLookCss();
    const seo = src('src/lib/publicSeo.ts');
    const html = src('index.html');
    expect(page).not.toMatch(COMPETITOR_NAMES);
    expect(look).not.toMatch(COMPETITOR_NAMES);
    expect(seo).not.toMatch(COMPETITOR_NAMES);
    expect(html).not.toMatch(COMPETITOR_NAMES);
  });
});

describe('public landing product frames', () => {
  it('keeps JobFrame and ScheduleFrame as large product proof, not a caption', () => {
    const page = src('src/pages/MarketingPage.tsx');
    const look = marketingLookCss();

    expect(page).toContain('function JobFrame()');
    expect(page).toContain('function ScheduleFrame()');
    expect(page).toContain('<JobFrame />');
    expect(page).toContain('<ScheduleFrame />');
    expect(page).toContain('hub-marketing-job');
    expect(page).toContain('hub-marketing-stamp');
    expect(page).toContain('#0042 | 12 Workshop Rd, Perth');
    expect(page).toContain('#0042.01 Fit-out labour');
    expect(page).toContain('Scheduled');
    expect(page).toContain('Open job');
    expect(page).toContain('hub-marketing-board');
    expect(page).toContain('hub-marketing-board-head');
    expect(page).toContain('7 AM');
    expect(page).toContain('Field Audit');
    expect(page).toContain('#0042 · 07:30–16:00');
    expect(page).toContain('#0042.01 · 09:00–11:00');

    expect(look).toContain('.hub-marketing-frame');
    expect(look).toContain('min-height: 280px');
    expect(look).toContain('height: 168px');
    expect(look).toContain('linear-gradient(180deg, rgba(10, 37, 64, 0.08), rgba(10, 37, 64, 0.55))');
    expect(look).toContain('repeating-linear-gradient(-18deg, #153558 0 12px, #0A2540 12px 24px)');
    expect(look).toContain('background: var(--mkt-ink)');
    expect(look).toContain('grid-template-columns: 104px repeat(5, minmax(0, 1fr))');
    expect(look).toContain('repeating-linear-gradient(');
    expect(look).not.toContain('display: none');
  });
});

describe('public landing look frames', () => {
  it('covers desktop hero, phone hero, and desktop pricing near the bottom', () => {
    for (const rel of [
      'docs/look/landing-hero-desktop.png',
      'docs/look/landing-hero-phone.png',
      'docs/look/landing-pricing-desktop.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
    }
  });
});
