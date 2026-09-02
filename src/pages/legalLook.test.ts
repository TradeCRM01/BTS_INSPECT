import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('public legal paper look', () => {
  it('paints Privacy and Terms as cream paper documents, not a CMS', () => {
    const shell = src('src/components/legal/LegalShell.tsx');
    const privacy = src('src/pages/PrivacyPage.tsx');
    const terms = src('src/pages/TermsPage.tsx');
    const css = src('src/index.css');
    const lookStart = css.indexOf('/* Public legal paper + auth/marketing legal-link chrome only.');
    const lookEnd = css.indexOf('/* Public /p portal only:', lookStart);
    const lookCss = css.slice(lookStart, lookEnd);

    expect(privacy).toContain('title="Privacy Policy"');
    expect(terms).toContain('title="Terms of Use"');
    expect(shell).toContain('hub-legal-article');
    expect(shell).toContain('hub-legal-title');
    expect(shell).not.toContain('hub-marketing-kicker');
    expect(shell).not.toContain('BTS Inspect');
    expect(privacy).not.toContain('BTS Inspect');
    expect(terms).not.toContain('BTS Inspect');
    expect(shell).not.toMatch(/Relovi|Littleloop/);

    expect(lookCss).toContain('.hub-legal {');
    expect(lookCss).toContain('.hub-legal-article');
    expect(lookCss).toContain('.hub-legal-title');
    expect(lookCss).toContain('--legal-page: #F5F0E6');
    expect(lookCss).toContain('--legal-sheet: #FFFDF8');
    expect(lookCss).toContain('--legal-ink: #0A2540');
    expect(lookCss).toContain('--legal-muted: #5B6B7C');
    expect(lookCss).toContain('--legal-line: #E2D9CC');
    expect(lookCss).toContain('#2E75B6');
    expect(lookCss).toContain('border-radius: 16px');
    expect(lookCss).toContain('inset 0 1px 0 #fff');
    expect(lookCss).toContain('0 10px 28px rgba(10, 37, 64, 0.08)');
    expect(lookCss).toContain("font-family: Rajdhani, sans-serif");
    expect(lookCss).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(lookCss).toContain('font-weight: 700');
    expect(lookCss).not.toContain('hub-marketing-kicker');
    expect(lookCss).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(lookCss).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow|lacquer|gloss|glow/);
    expect(lookCss).not.toMatch(/#16A34A|#15803D|#1B7F3A|#111|#000\b/);
  });

  it('keeps auth/marketing legal links as whisper chrome and one signup primary', () => {
    const auth = src('src/components/auth/AuthShell.tsx');
    const signup = src('src/pages/SignupPage.tsx');
    const marketing = src('src/pages/MarketingPage.tsx');
    const css = src('src/index.css');
    const lookStart = css.indexOf('/* Public legal paper + auth/marketing legal-link chrome only.');
    const lookEnd = css.indexOf('/* Public /p portal only:', lookStart);
    const lookCss = css.slice(lookStart, lookEnd);

    expect(auth).toContain('PublicLegalLinks');
    expect(auth).toContain('hub-auth-legal');
    expect(signup).toContain('hub-auth-agree');
    expect(signup).toContain('By creating a workspace you agree to our');
    expect(signup).toContain('hub-auth-submit');
    expect(signup).not.toContain('type="checkbox"');
    expect(marketing).toContain('PublicLegalLinks');
    expect(marketing).toContain('Australian-built. grafter.com.au');

    expect(lookCss).toContain('.hub-legal-links');
    expect(lookCss).toContain('.hub-auth-legal');
    expect(lookCss).toContain('.hub-auth-agree');
    expect(lookCss).toContain('.hub-auth-submit');
    expect(lookCss).toContain('.hub-marketing-footer .hub-legal-links');
    expect(lookCss).toContain('min-height: 44px');
    expect(lookCss).toContain('background: #2E75B6');
    expect(lookCss).toContain('color: #5B6B7C');
  });

  it('does not restyle quotes, invoices, job sheet, or tenant SQL', () => {
    expect(src('src/pages/QuotesPage.tsx')).not.toContain('hub-legal-article');
    expect(src('src/pages/InvoicesPage.tsx')).not.toContain('hub-legal-article');
    expect(src('src/pages/JobDetailPage.tsx')).not.toContain('hub-legal-article');
    expect(src('src/pages/JobsPage.tsx')).not.toContain('hub-legal');
    expect(src('src/components/layout/AppShell.tsx')).not.toContain('hub-legal');
    expect(src('supabase/migrations/20260902120000_069_tenant_privacy_floor.sql')).not.toContain('hub-legal');
    expect(src('src/content/privacy.md')).toContain('# Privacy Policy');
    expect(src('src/content/terms.md')).toContain('# Terms of Use');
  });
});

describe('public legal look frames', () => {
  it('covers Privacy desktop, Terms phone, and signup legal links phone', () => {
    for (const rel of [
      'docs/look/privacy-desktop.png',
      'docs/look/terms-phone.png',
      'docs/look/signup-legal-links-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
