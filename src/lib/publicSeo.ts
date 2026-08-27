import { useEffect } from 'react';

/** Public origin already named on the landing footer. Not a DNS change. */
export const GRAFTER_PUBLIC_ORIGIN = 'https://grafter.com.au';

export type PublicSeoKey =
  | 'landing'
  | 'login'
  | 'signup'
  | 'forgotPassword'
  | 'resetPassword'
  | 'authConfirm'
  | 'portal';

export type PublicSeoEntry = {
  title: string;
  description: string;
  path: string;
  robots: 'index,follow' | 'noindex,nofollow';
};

export const PUBLIC_SEO: Record<PublicSeoKey, PublicSeoEntry> = {
  landing: {
    title: 'Grafter — Electrical and trade job software for Australian crews',
    description:
      'Australian trade job software for electrical and field crews. Quote, schedule, invoice, and keep SWMS on the job — Simpro-class work without the extra product.',
    path: '/',
    robots: 'index,follow',
  },
  login: {
    title: 'Sign in to Grafter — Trade job software',
    description:
      'Sign in to Grafter to run jobs, quotes, invoices, and field paperwork for your Australian electrical or trade crew.',
    path: '/login',
    robots: 'index,follow',
  },
  signup: {
    title: 'Create a Grafter workspace — Trade job software',
    description:
      'Open a Grafter workspace for your electrical or trade crew. Jobs, quotes, invoices, and SWMS in one Australian trade CRM.',
    path: '/signup',
    robots: 'index,follow',
  },
  forgotPassword: {
    title: 'Reset your Grafter password',
    description: 'Request a password reset for your Grafter trade workspace.',
    path: '/forgot-password',
    robots: 'noindex,nofollow',
  },
  resetPassword: {
    title: 'Set your Grafter password',
    description: 'Choose a password for your Grafter trade workspace.',
    path: '/reset-password',
    robots: 'noindex,nofollow',
  },
  authConfirm: {
    title: 'Accept your Grafter invitation',
    description: 'Accept an invitation to a Grafter trade workspace.',
    path: '/auth/confirm',
    robots: 'noindex,nofollow',
  },
  portal: {
    title: 'Grafter client portal',
    description: 'Open the secure link you were sent to view quotes, invoices, and reports.',
    path: '/p',
    robots: 'noindex,nofollow',
  },
};

/** Indexable public URLs only. No help route exists yet. */
export const PUBLIC_SITEMAP_PATHS = ['/', '/login', '/signup'] as const;

/** Prefixes Google should not crawl. `/p` is handled as `/p$` + `/p?` so /price-books stays its own rule. */
export const ROBOTS_DISALLOW_PREFIXES = [
  '/jobs',
  '/quotes',
  '/invoices',
  '/schedule',
  '/clients',
  '/inspections',
  '/templates',
  '/drive',
  '/reports',
  '/settings',
  '/operator',
  '/stock',
  '/suppliers',
  '/purchase-orders',
  '/expenses',
  '/assets',
  '/contracts',
  '/price-books',
  '/timesheets',
  '/reports-advanced',
  '/portal',
  '/barcode',
  '/compliance',
  '/assistant',
  '/ai-console',
  '/jha',
  '/uploaded-pdfs',
  '/forgot-password',
  '/reset-password',
  '/auth/',
  '/__field-audit',
  '/p$',
  '/p?',
] as const;

export type HeadElementLike = {
  getAttribute: (name: string) => string | null;
  setAttribute: (name: string, value: string) => void;
};

export type DocumentHeadLike = {
  title: string;
  querySelector: (selector: string) => HeadElementLike | null;
  createElement: (tag: string) => HeadElementLike;
  head: { appendChild: (el: HeadElementLike) => void };
};

export function publicAbsoluteUrl(path: string): string {
  if (path === '/') return `${GRAFTER_PUBLIC_ORIGIN}/`;
  return `${GRAFTER_PUBLIC_ORIGIN}${path}`;
}

export function sitemapXml(): string {
  const urls = PUBLIC_SITEMAP_PATHS.map((path) => {
    const priority = path === '/' ? '1.0' : '0.7';
    return [
      '  <url>',
      `    <loc>${publicAbsoluteUrl(path)}</loc>`,
      `    <changefreq>${path === '/' ? 'weekly' : 'monthly'}</changefreq>`,
      `    <priority>${priority}</priority>`,
      '  </url>',
    ].join('\n');
  }).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
    '',
  ].join('\n');
}

export function robotsTxt(): string {
  const allows = PUBLIC_SITEMAP_PATHS.map((path) =>
    path === '/' ? 'Allow: /' : `Allow: ${path}`,
  );
  const disallows = ROBOTS_DISALLOW_PREFIXES.map((prefix) => `Disallow: ${prefix}`);
  return [
    'User-agent: *',
    ...allows,
    ...disallows,
    '',
    `Sitemap: ${publicAbsoluteUrl('/sitemap.xml')}`,
    '',
  ].join('\n');
}

const META_TAGS: Array<{ attr: 'name' | 'property'; key: string; content: (entry: PublicSeoEntry) => string }> = [
  { attr: 'name', key: 'description', content: (entry) => entry.description },
  { attr: 'name', key: 'robots', content: (entry) => entry.robots },
  { attr: 'property', key: 'og:type', content: () => 'website' },
  { attr: 'property', key: 'og:site_name', content: () => 'Grafter' },
  { attr: 'property', key: 'og:locale', content: () => 'en_AU' },
  { attr: 'property', key: 'og:title', content: (entry) => entry.title },
  { attr: 'property', key: 'og:description', content: (entry) => entry.description },
  { attr: 'property', key: 'og:url', content: (entry) => publicAbsoluteUrl(entry.path) },
  { attr: 'name', key: 'twitter:card', content: () => 'summary' },
  { attr: 'name', key: 'twitter:title', content: (entry) => entry.title },
  { attr: 'name', key: 'twitter:description', content: (entry) => entry.description },
];

function upsertMeta(
  doc: DocumentHeadLike,
  attr: 'name' | 'property',
  key: string,
  content: string,
): HeadElementLike {
  const selector = `meta[${attr}="${key}"]`;
  let el = doc.querySelector(selector);
  if (!el) {
    el = doc.createElement('meta');
    el.setAttribute(attr, key);
    doc.head.appendChild(el);
  }
  el.setAttribute('content', content);
  return el;
}

function upsertCanonical(doc: DocumentHeadLike, href: string): HeadElementLike {
  let el = doc.querySelector('link[rel="canonical"]');
  if (!el) {
    el = doc.createElement('link');
    el.setAttribute('rel', 'canonical');
    doc.head.appendChild(el);
  }
  el.setAttribute('href', href);
  return el;
}

function snapshot(el: HeadElementLike | null, names: string[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  if (!el) return out;
  for (const name of names) out[name] = el.getAttribute(name);
  return out;
}

/**
 * Write public-page title, description, robots, canonical, and Open Graph tags.
 * Returns a restore function for route unmount.
 */
export function applyPublicDocumentHead(doc: DocumentHeadLike, key: PublicSeoKey): () => void {
  const entry = PUBLIC_SEO[key];
  const previousTitle = doc.title;
  const previousMetas = META_TAGS.map((tag) => ({
    ...tag,
    snapshot: snapshot(doc.querySelector(`meta[${tag.attr}="${tag.key}"]`), [tag.attr, 'content']),
    existed: Boolean(doc.querySelector(`meta[${tag.attr}="${tag.key}"]`)),
  }));
  const canonicalEl = doc.querySelector('link[rel="canonical"]');
  const previousCanonical = {
    existed: Boolean(canonicalEl),
    snapshot: snapshot(canonicalEl, ['rel', 'href']),
  };

  doc.title = entry.title;
  for (const tag of META_TAGS) {
    upsertMeta(doc, tag.attr, tag.key, tag.content(entry));
  }
  upsertCanonical(doc, publicAbsoluteUrl(entry.path));

  return () => {
    doc.title = previousTitle;
    for (const tag of previousMetas) {
      const el = doc.querySelector(`meta[${tag.attr}="${tag.key}"]`);
      if (!el) continue;
      if (!tag.existed) {
        el.setAttribute('content', '');
        continue;
      }
      if (tag.snapshot.content != null) el.setAttribute('content', tag.snapshot.content);
    }
    const canonical = doc.querySelector('link[rel="canonical"]');
    if (canonical && previousCanonical.existed && previousCanonical.snapshot.href != null) {
      canonical.setAttribute('href', previousCanonical.snapshot.href);
    }
  };
}

export function usePublicDocumentHead(key?: PublicSeoKey | null): void {
  useEffect(() => {
    if (!key || typeof document === 'undefined') return;
    return applyPublicDocumentHead(document, key);
  }, [key]);
}
