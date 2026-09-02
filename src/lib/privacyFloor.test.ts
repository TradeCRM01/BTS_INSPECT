import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PUBLIC_SITEMAP_PATHS, PUBLIC_SEO } from './publicSeo';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('Grafter privacy / legal floor', () => {
  it('renders Legal markdown on cream public Privacy and Terms pages', () => {
    const privacyPage = src('src/pages/PrivacyPage.tsx');
    const termsPage = src('src/pages/TermsPage.tsx');
    const privacy = src('src/content/privacy.md');
    const terms = src('src/content/terms.md');
    const shell = src('src/components/legal/LegalShell.tsx');

    expect(privacyPage).toContain("from '../content/privacy.md?raw'");
    expect(privacyPage).toContain('renderLegalMarkdown');
    expect(privacyPage).toContain('title="Privacy Policy"');
    expect(privacyPage).not.toContain('BTS Inspect');
    expect(termsPage).toContain("from '../content/terms.md?raw'");
    expect(termsPage).toContain('renderLegalMarkdown');
    expect(termsPage).toContain('title="Terms of Use"');
    expect(termsPage).not.toContain('BTS Inspect');

    expect(privacy).toContain('# Privacy Policy');
    expect(privacy).toContain('Effective 2 September 2026');
    expect(privacy).toContain('Building Technology Solutions Pty Ltd');
    expect(privacy).toContain('ABN 94 698 924 186');
    expect(privacy).toContain('privacy@grafter.com.au');
    expect(privacy).toContain('0486 011 187');
    expect(privacy).toContain('Grafter');
    expect(privacy).not.toContain('BTS Inspect');

    expect(terms).toContain('# Terms of Use');
    expect(terms).toContain('Effective 2 September 2026');
    expect(terms).toContain('Building Technology Solutions Pty Ltd');
    expect(terms).toContain('ABN 94 698 924 186');
    expect(terms).toContain('privacy@grafter.com.au');
    expect(terms).toContain('Grafter');
    expect(terms).not.toContain('BTS Inspect');

    expect(shell).toContain('hub-legal');
    expect(shell).toContain('Australian-built. grafter.com.au');
    expect(PUBLIC_SEO.privacy.title).toBe('Privacy Policy');
    expect(PUBLIC_SEO.privacy.path).toBe('/privacy');
    expect(PUBLIC_SEO.privacy.robots).toBe('index,follow');
    expect(PUBLIC_SEO.terms.title).toBe('Terms of Use');
    expect(PUBLIC_SEO.terms.path).toBe('/terms');
    expect(PUBLIC_SEO.terms.robots).toBe('index,follow');
  });

  it('links Privacy and Terms from auth chrome and the landing footer, with no signup checkbox', () => {
    const signup = src('src/pages/SignupPage.tsx');
    expect(signup).toContain('to="/terms"');
    expect(signup).toContain('to="/privacy"');
    expect(signup).toContain('By creating a workspace you agree to our');
    expect(signup).toContain('We don’t send a confirmation email at signup — you can sign in straight away.');
    expect(signup).toContain('Password reset and team invites do use email.');
    expect(signup).not.toContain('type="checkbox"');
    expect(signup).not.toContain('I agree to the');
    expect(src('src/components/auth/AuthShell.tsx')).toContain('PublicLegalLinks');
    expect(src('src/pages/LoginPage.tsx')).toContain('AuthShell');
    expect(src('src/pages/LoginPage.tsx')).not.toContain('to="/privacy"');
    expect(src('src/pages/LoginPage.tsx')).not.toContain('to="/terms"');
    expect(src('src/pages/ForgotPasswordPage.tsx')).toContain('AuthShell');
    expect(src('src/pages/ResetPasswordPage.tsx')).toContain('PublicLegalLinks');
    expect(src('src/pages/AuthConfirmPage.tsx')).toContain('PublicLegalLinks');
    expect(src('src/pages/MarketingPage.tsx')).toContain('PublicLegalLinks');
    expect(src('src/pages/MarketingPage.tsx')).toContain('Australian-built. grafter.com.au');
    expect(src('src/App.tsx')).toContain('path="/privacy"');
    expect(src('src/App.tsx')).toContain('path="/terms"');
    expect(src('src/App.tsx')).not.toContain('path="/documents"');
    expect([...PUBLIC_SITEMAP_PATHS]).toEqual(['/', '/login', '/signup', '/privacy', '/terms']);
  });

  it('keeps public signup auto-confirm and still emails forgot-password / invites', () => {
    const signup = src('supabase/functions/signup-user/index.ts');
    expect(signup).toContain('email_confirm: true');
    expect(signup).toContain('perPage: 200');
    expect(src('src/pages/SignupPage.tsx')).toContain('signup-user');
    expect(src('src/pages/ForgotPasswordPage.tsx')).toContain('forgot-password');
    expect(src('supabase/functions/forgot-password/index.ts')).toContain('generateLink');
    expect(src('supabase/functions/invite-user/index.ts')).toContain('inviteUserByEmail');
    expect(src('supabase/functions/invite-user/index.ts')).toContain('https://grafter.com.au');
    expect(src('supabase/functions/invite-user/index.ts')).not.toContain('bts-inspect.pages.dev');
    expect(src('supabase/functions/invite-user/index.ts')).not.toContain('Building Technology Solutions');
  });
});

describe('tenant isolation and storage policies', () => {
  it('locks company_id hops and scopes storage to the caller company', () => {
    const sql = src('supabase/migrations/20260902120000_069_tenant_privacy_floor.sql');
    expect(sql).toContain('prevent_profile_tenant_hop');
    expect(sql).toContain("DROP POLICY IF EXISTS \"Users can insert own profile\"");
    expect(sql).toContain("DROP POLICY IF EXISTS \"Allow company insert during signup\"");
    expect(sql).toContain('Company members can view photos');
    expect(sql).toContain('storage_reports_in_my_company');
    expect(sql).toContain("invoices");
    expect(sql).toContain('jha-swms');
    expect(sql).toContain('my_company_id');
    expect(sql).toContain('security_invoker = true');
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.cleanup_old_photos');
    expect(src('supabase/functions/cleanup-old-photos/index.ts')).toContain('Unauthorized');
    expect(src('supabase/functions/cleanup-old-photos/index.ts')).toContain('Company mismatch');
    expect(src('src/components/admin/StorageAnalytics.tsx')).toContain('getSession');
    expect(src('src/components/admin/StorageAnalytics.tsx')).not.toContain(
      "Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`",
    );
  });

  it('ships clickjacking / MIME / referrer headers on the public host', () => {
    const headers = src('public/_headers');
    expect(headers).toContain('X-Frame-Options: DENY');
    expect(headers).toContain('X-Content-Type-Options: nosniff');
    expect(headers).toContain('Referrer-Policy: strict-origin-when-cross-origin');
    expect(src('netlify.toml')).toContain('X-Frame-Options');
    expect(src('src/lib/supabase.ts')).toContain("'x-client-info': 'grafter'");
    expect(src('src/lib/supabase.ts')).not.toContain('bts-inspect');
  });
});
