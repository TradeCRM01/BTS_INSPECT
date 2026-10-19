/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyBrandHtml, brandManifestFields } from './brand';
import { applyPublicDocumentHead, type DocumentHeadLike, type HeadElementLike } from './publicSeo';
import { Wordmark } from '../components/brand/Wordmark';
import { AppShell } from '../components/layout/AppShell';

vi.mock('./brand', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./brand')>();
  return {
    ...actual,
    BRAND_NAME: 'Acmeco',
    brandLabel: (suffix?: string) => (suffix ? `Acmeco ${suffix}` : 'Acmeco'),
  };
});

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { name: 'Field Audit', role: 'admin', company_id: 'c1' },
    company: { name: 'Northside', report_theme: null },
    signOut: async () => {},
    isPlatformOperator: false,
  }),
}));

vi.mock('./useCompanyAiKey', () => ({
  useCompanyAiKey: () => ({ ready: true, hasKey: false }),
}));

vi.mock('../components/search/GlobalSearch', () => ({
  GlobalSearch: () => null,
}));

vi.mock('../components/ui/DevConsole', () => ({
  DevConsole: () => null,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe('BRAND_NAME mocked to Acmeco reaches rendered surfaces', () => {
  it('renders Wordmark textContent and aria as Acmeco with uppercase class', () => {
    const html = renderToStaticMarkup(<Wordmark size="header" tone="onDark" />);
    const div = document.createElement('div');
    div.innerHTML = html;
    const wm = div.querySelector('[data-grafter-wordmark]');
    expect(wm?.textContent).toBe('Acmeco');
    expect(wm?.getAttribute('aria-label')).toBe('Acmeco');
    expect(wm?.textContent).not.toBe('Grafter');
    expect(wm?.className).toMatch(/\buppercase\b/);
  });

  it('renders AppShell lockup aria as Acmeco', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <AppShell>
              <div>child</div>
            </AppShell>
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    const lockup = container.querySelector('a[aria-label]');
    expect(lockup?.getAttribute('aria-label')).toBe('Acmeco');
    expect(container.textContent).toContain('Acmeco');
    expect(container.querySelector('[data-grafter-wordmark]')?.textContent).toBe('Acmeco');
    expect(container.innerHTML).not.toMatch(/\bGrafter\b/);
  });

  it('writes login document.title and og:site_name from Acmeco, not Grafter', () => {
    type MetaEl = HeadElementLike & { tagName: string; attrs: Record<string, string> };
    const metas: MetaEl[] = [];
    const match = (selector: string, el: MetaEl) => {
      const metaName = selector.match(/^meta\[name="([^"]+)"\]$/);
      if (metaName) return el.tagName === 'meta' && el.attrs.name === metaName[1];
      const metaProp = selector.match(/^meta\[property="([^"]+)"\]$/);
      if (metaProp) return el.tagName === 'meta' && el.attrs.property === metaProp[1];
      const linkRel = selector.match(/^link\[rel="([^"]+)"\]$/);
      if (linkRel) return el.tagName === 'link' && el.attrs.rel === linkRel[1];
      return false;
    };
    const makeEl = (tagName: string): MetaEl => ({
      tagName,
      attrs: {},
      getAttribute(name: string) {
        return name in this.attrs ? this.attrs[name] : null;
      },
      setAttribute(name: string, value: string) {
        this.attrs[name] = value;
      },
    });
    const doc: DocumentHeadLike = {
      title: 'start',
      querySelector: (selector: string) => metas.find((el) => match(selector, el)) ?? null,
      createElement: (tag: string) => makeEl(tag),
      head: {
        appendChild: (el: HeadElementLike) => {
          metas.push(el as MetaEl);
        },
      },
    };
    applyPublicDocumentHead(doc, 'login');
    expect(doc.title).toContain('Acmeco');
    expect(doc.title).not.toMatch(/\bGrafter\b/);
    const site = metas.find((el) => el.attrs.property === 'og:site_name');
    expect(site?.attrs.content).toBe('Acmeco');
    expect(site?.attrs.content).not.toMatch(/\bGrafter\b/);
  });

  it('runs applyBrandHtml and brandManifestFields with Acmeco, not source greps', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const out = applyBrandHtml(html, 'Acmeco');
    expect(out).toContain('<title>Acmeco — Trade job software for Australian crews</title>');
    expect(out).toContain('content="Acmeco"');
    expect(out).not.toMatch(/\bGrafter\b/);
    expect(out).not.toContain('%BRAND_NAME%');
    expect(brandManifestFields('Acmeco')).toEqual({ name: 'Acmeco', short_name: 'Acmeco' });
  });
});
