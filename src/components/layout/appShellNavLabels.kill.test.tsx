/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppShell } from './AppShell';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { name: 'Field Audit', role: 'admin', company_id: 'c1' },
    company: { name: 'Northside Plumbing & Gas Maintenance Services Pty Ltd' },
    signOut: async () => {},
    isPlatformOperator: false,
  }),
}));

vi.mock('../../lib/useCompanyAiKey', () => ({
  useCompanyAiKey: () => ({ ready: true, hasKey: false }),
}));

vi.mock('../ui/DevConsole', () => ({
  DevConsole: () => null,
}));

vi.mock('../../lib/supabase', () => {
  let chain: unknown;
  chain = new Proxy(function chainFn() { return chain; }, {
    get: (_target, key) => (key === 'then'
      ? (resolve: (v: unknown) => void) => resolve({ data: [], error: null, count: 0 })
      : chain),
    apply: () => chain,
  });
  return {
    supabase: {
      from: () => chain,
      rpc: async () => ({ data: [], error: null }),
      auth: {
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
    },
  };
});

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  window.matchMedia = (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    const max = /max-width:\s*(\d+)px/.exec(query);
    let matches = true;
    if (min) matches = matches && width >= Number(min[1]);
    if (max) matches = matches && width <= Number(max[1]);
    return {
      matches,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() { return false; },
      onchange: null,
    };
  };
}

function renderShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AppShell>
          <div>child</div>
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setViewport(800);
  const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
  const start = css.indexOf('.shell-nav-btn {');
  const end = css.indexOf('.shell-search-btn {');
  const style = document.createElement('style');
  style.dataset.s2Nav = '1';
  style.textContent = css.slice(start, end);
  document.head.appendChild(style);
});

afterEach(() => {
  document.querySelectorAll('style[data-s2-nav]').forEach((el) => el.remove());
  cleanup();
});

describe('tablet nav jsdom probe (not a kill; S3 is the Chromium layout kill)', () => {
  it('jsdom still sees short-label text at 800px (not a kill)', () => {
    renderShell();
    const shorts = [...document.querySelectorAll('.shell-nav-label-short')].map((el) => el.textContent);
    expect(shorts).toEqual(['Today', 'Jobs', 'Field', 'Money', 'Stock']);
    for (const el of document.querySelectorAll('.shell-nav-label-short')) {
      expect(el.className).not.toMatch(/\bhidden\b/);
    }
    const jobs = document.querySelector('[data-shell-nav-group="Jobs"]');
    expect(jobs).not.toBeNull();
    expect(jobs?.getAttribute('aria-label')).toBe('CRM');
    const size = getComputedStyle(jobs as HTMLElement);
    expect(size.minHeight).toBe('44px');
    expect(size.minWidth).toBe('44px');
    expect(getComputedStyle(document.querySelector('.shell-nav-label-short') as HTMLElement).display).not.toBe('none');
    expect(getComputedStyle(document.querySelector('.shell-nav-label-full') as HTMLElement).display).toBe('none');
    const name = document.querySelector('[data-shell-switcher-name]');
    expect(name?.getAttribute('title')).toBe('Northside Plumbing & Gas Maintenance Services Pty Ltd');
    expect(name?.textContent).toBe('Northside Plumbing & Gas Maintenance Services Pty Ltd');
    expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy();
  });
});
