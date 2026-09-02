import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GRAFTER_PUBLIC_ORIGIN,
  PUBLIC_SEO,
  PUBLIC_SITEMAP_PATHS,
  applyPublicDocumentHead,
  publicAbsoluteUrl,
  robotsTxt,
  sitemapXml,
} from './publicSeo';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

type FakeEl = {
  tagName: string;
  attrs: Record<string, string>;
  getAttribute: (name: string) => string | null;
  setAttribute: (name: string, value: string) => void;
};

function createFakeDocument(initialTitle = 'Grafter'): {
  doc: {
    title: string;
    querySelector: (selector: string) => FakeEl | null;
    createElement: (tag: string) => FakeEl;
    head: { appendChild: (el: FakeEl) => void };
  };
  metas: () => FakeEl[];
} {
  const nodes: FakeEl[] = [];

  const makeEl = (tagName: string, attrs: Record<string, string> = {}): FakeEl => {
    const el: FakeEl = {
      tagName,
      attrs,
      getAttribute: (name) => (name in el.attrs ? el.attrs[name] : null),
      setAttribute: (name, value) => {
        el.attrs[name] = value;
      },
    };
    return el;
  };

  const match = (selector: string, el: FakeEl): boolean => {
    const metaName = selector.match(/^meta\[name="([^"]+)"\]$/);
    if (metaName) return el.tagName === 'meta' && el.attrs.name === metaName[1];
    const metaProp = selector.match(/^meta\[property="([^"]+)"\]$/);
    if (metaProp) return el.tagName === 'meta' && el.attrs.property === metaProp[1];
    const linkRel = selector.match(/^link\[rel="([^"]+)"\]$/);
    if (linkRel) return el.tagName === 'link' && el.attrs.rel === linkRel[1];
    return false;
  };

  const doc = {
    title: initialTitle,
    querySelector: (selector: string) => nodes.find((el) => match(selector, el)) ?? null,
    createElement: (tag: string) => makeEl(tag),
    head: {
      appendChild: (el: FakeEl) => {
        nodes.push(el);
      },
    },
  };

  return { doc, metas: () => nodes };
}

describe('public SEO copy', () => {
  it('names Grafter in AU trade-job-software wording', () => {
    expect(PUBLIC_SEO.landing.title).toContain('Grafter');
    expect(PUBLIC_SEO.landing.title).toMatch(/electrical/i);
    expect(PUBLIC_SEO.landing.title).toMatch(/trade job software/i);
    expect(PUBLIC_SEO.landing.description).toMatch(/Simpro-class/i);
    expect(PUBLIC_SEO.landing.description).toMatch(/SWMS/);
    expect(PUBLIC_SEO.landing.robots).toBe('index,follow');
    expect(PUBLIC_SEO.login.title).toContain('Sign in to Grafter');
    expect(PUBLIC_SEO.login.description).toMatch(/electrical or trade crew/);
    expect(PUBLIC_SEO.signup.robots).toBe('index,follow');
    expect(PUBLIC_SEO.forgotPassword.robots).toBe('noindex,nofollow');
    expect(PUBLIC_SEO.portal.robots).toBe('noindex,nofollow');
    expect(PUBLIC_SEO.privacy.title).toBe('Privacy Policy');
    expect(PUBLIC_SEO.terms.title).toBe('Terms of Use');
    expect(PUBLIC_SEO.privacy.robots).toBe('index,follow');
    expect(PUBLIC_SEO.terms.robots).toBe('index,follow');
  });

  it('builds absolute grafter.com.au URLs for the public origin', () => {
    expect(publicAbsoluteUrl('/')).toBe(`${GRAFTER_PUBLIC_ORIGIN}/`);
    expect(publicAbsoluteUrl('/login')).toBe(`${GRAFTER_PUBLIC_ORIGIN}/login`);
  });
});

describe('applyPublicDocumentHead', () => {
  it('writes title, description, robots, canonical, and Open Graph tags', () => {
    const { doc } = createFakeDocument();
    applyPublicDocumentHead(doc, 'landing');

    expect(doc.title).toBe(PUBLIC_SEO.landing.title);
    expect(doc.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      PUBLIC_SEO.landing.description,
    );
    expect(doc.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('index,follow');
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${GRAFTER_PUBLIC_ORIGIN}/`,
    );
    expect(doc.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(
      PUBLIC_SEO.landing.title,
    );
    expect(doc.querySelector('meta[property="og:description"]')?.getAttribute('content')).toBe(
      PUBLIC_SEO.landing.description,
    );
    expect(doc.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(
      `${GRAFTER_PUBLIC_ORIGIN}/`,
    );
    expect(doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content')).toBe('Grafter');
    expect(doc.querySelector('meta[property="og:locale"]')?.getAttribute('content')).toBe('en_AU');
    expect(doc.querySelector('meta[property="og:type"]')?.getAttribute('content')).toBe('website');
    expect(doc.querySelector('meta[name="twitter:card"]')?.getAttribute('content')).toBe('summary');
  });

  it('switches login to its own title and canonical, then restores', () => {
    const { doc } = createFakeDocument('Grafter');
    const restore = applyPublicDocumentHead(doc, 'login');
    expect(doc.title).toBe(PUBLIC_SEO.login.title);
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${GRAFTER_PUBLIC_ORIGIN}/login`,
    );
    expect(doc.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('index,follow');
    restore();
    expect(doc.title).toBe('Grafter');
  });

  it('marks the token portal noindex', () => {
    const { doc } = createFakeDocument();
    applyPublicDocumentHead(doc, 'portal');
    expect(doc.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex,nofollow');
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${GRAFTER_PUBLIC_ORIGIN}/p`,
    );
  });
});

describe('public robots and sitemap files', () => {
  it('lists only the existing public marketing/auth URLs in the sitemap', () => {
    expect([...PUBLIC_SITEMAP_PATHS]).toEqual(['/', '/login', '/signup', '/privacy', '/terms']);
    const xml = sitemapXml();
    expect(xml).toContain(`${GRAFTER_PUBLIC_ORIGIN}/</loc>`);
    expect(xml).toContain(`${GRAFTER_PUBLIC_ORIGIN}/login</loc>`);
    expect(xml).toContain(`${GRAFTER_PUBLIC_ORIGIN}/signup</loc>`);
    expect(xml).toContain(`${GRAFTER_PUBLIC_ORIGIN}/privacy</loc>`);
    expect(xml).toContain(`${GRAFTER_PUBLIC_ORIGIN}/terms</loc>`);
    expect(xml).not.toContain('/jobs');
    expect(xml).not.toContain('/schedule');
    expect(src('public/sitemap.xml')).toBe(xml);
  });

  it('ships robots.txt that allows those URLs and blocks the CRM', () => {
    const txt = robotsTxt();
    expect(txt).toContain('Allow: /');
    expect(txt).toContain('Allow: /login');
    expect(txt).toContain('Allow: /signup');
    expect(txt).toContain('Allow: /privacy');
    expect(txt).toContain('Allow: /terms');
    expect(txt).toContain('Disallow: /jobs');
    expect(txt).toContain('Disallow: /schedule');
    expect(txt).toContain('Disallow: /p$');
    expect(txt).toContain(`Sitemap: ${GRAFTER_PUBLIC_ORIGIN}/sitemap.xml`);
    expect(src('public/robots.txt')).toBe(txt);
  });
});

describe('public document head wiring', () => {
  it('puts landing SEO in index.html for the first paint and crawlers', () => {
    const html = src('index.html');
    expect(html).toContain(`<html lang="en-AU">`);
    expect(html).toContain(`<title>${PUBLIC_SEO.landing.title}</title>`);
    expect(html).toContain(`content="${PUBLIC_SEO.landing.description}"`);
    expect(html).toContain('property="og:title"');
    expect(html).toContain('property="og:description"');
    expect(html).toContain('property="og:url"');
    expect(html).toContain(`href="${GRAFTER_PUBLIC_ORIGIN}/"`);
    expect(html).toContain('name="robots"');
    expect(html).toContain('en_AU');
  });

  it('applies the helper on the existing public shells only', () => {
    expect(src('src/pages/MarketingPage.tsx')).toContain("usePublicDocumentHead('landing')");
    expect(src('src/pages/LoginPage.tsx')).toContain('seoKey="login"');
    expect(src('src/pages/SignupPage.tsx')).toContain('seoKey="signup"');
    expect(src('src/pages/ForgotPasswordPage.tsx')).toContain('seoKey="forgotPassword"');
    expect(src('src/pages/ResetPasswordPage.tsx')).toContain("usePublicDocumentHead('resetPassword')");
    expect(src('src/pages/AuthConfirmPage.tsx')).toContain("usePublicDocumentHead('authConfirm')");
    expect(src('src/pages/ClientPortalPublicPage.tsx')).toContain("usePublicDocumentHead('portal')");
    expect(src('src/pages/PrivacyPage.tsx')).toContain('seoKey="privacy"');
    expect(src('src/pages/TermsPage.tsx')).toContain('seoKey="terms"');
    expect(src('src/components/auth/AuthShell.tsx')).toContain('usePublicDocumentHead(seoKey)');
    expect(src('src/App.tsx')).not.toContain('path="/help"');
  });

  it('keeps landing headings in AU trade-CRM wording', () => {
    const page = src('src/pages/MarketingPage.tsx');
    expect(page).toContain('<h1 className="hub-marketing-display">');
    expect(page).toContain('Trade job software, from quote');
    expect(page).toContain('Australian electrical and trade job software');
    expect(page).toContain('<h2 className="hub-marketing-subhead">');
    expect(src('src/components/auth/AuthShell.tsx')).toContain('<h1 className="hub-auth-title">');
    expect(src('src/pages/LoginPage.tsx')).toContain('Sign in to Grafter');
  });
});
