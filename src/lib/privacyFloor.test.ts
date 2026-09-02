import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PUBLIC_SITEMAP_PATHS, PUBLIC_SEO } from './publicSeo';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('Grafter privacy / legal floor', () => {
  it('names Grafter on public Privacy and Terms pages and covers APPs topics', () => {
    const privacy = src('src/pages/PrivacyPage.tsx');
    const terms = src('src/pages/TermsPage.tsx');
    expect(privacy).toContain('Privacy Policy');
    expect(privacy).toContain('Grafter');
    expect(privacy).not.toContain('BTS Inspect');
    expect(privacy).toContain('What we store');
    expect(privacy).toContain('Why we store it');
    expect(privacy).toContain('Who it is shared with');
    expect(privacy).toContain('Retention');
    expect(privacy).toContain('Access, correction, and deletion');
    expect(privacy).toContain('Overseas processing');
    expect(privacy).toContain('Supabase');
    expect(privacy).toContain('Cookies and local storage');
    expect(privacy).toContain('Australian Privacy Principles');
    expect(privacy).toContain('oaic.gov.au');
    expect(terms).toContain('Terms of Use');
    expect(terms).toContain('Grafter');
    expect(terms).not.toContain('BTS Inspect');
    expect(terms).toContain('Western Australia');
    expect(PUBLIC_SEO.privacy.path).toBe('/privacy');
    expect(PUBLIC_SEO.terms.path).toBe('/terms');
  });

  it('links Privacy and Terms from signup, login chrome, and the landing footer', () => {
    expect(src('src/pages/SignupPage.tsx')).toContain('to="/terms"');
    expect(src('src/pages/SignupPage.tsx')).toContain('to="/privacy"');
    expect(src('src/components/auth/AuthShell.tsx')).toContain('PublicLegalLinks');
    expect(src('src/pages/LoginPage.tsx')).toContain('AuthShell');
    expect(src('src/pages/ForgotPasswordPage.tsx')).toContain('AuthShell');
    expect(src('src/pages/ResetPasswordPage.tsx')).toContain('PublicLegalLinks');
    expect(src('src/pages/AuthConfirmPage.tsx')).toContain('PublicLegalLinks');
    expect(src('src/pages/MarketingPage.tsx')).toContain('PublicLegalLinks');
    expect(src('src/App.tsx')).toContain('path="/privacy"');
    expect(src('src/App.tsx')).toContain('path="/terms"');
    expect(src('src/App.tsx')).not.toContain('DocumentsPage');
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
