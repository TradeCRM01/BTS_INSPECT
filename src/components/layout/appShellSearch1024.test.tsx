/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1' },
    profile: { name: 'Field Audit', role: 'admin', company_id: 'c1' },
    company: { name: 'Northside', report_theme: null },
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

const INDEX_CSS = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
const SEARCH_CSS = INDEX_CSS.slice(INDEX_CSS.indexOf('/* Icon-only search'));

function setViewport(width: number, height = 768) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: height });
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

function box(el: HTMLElement): { width: number; height: number } {
  const live = el.getBoundingClientRect();
  if (live.width >= 40 && live.height >= 40) {
    return { width: live.width, height: live.height };
  }
  const cs = getComputedStyle(el);
  return {
    width: parseFloat(cs.width) || parseFloat(cs.minWidth) || live.width,
    height: parseFloat(cs.height) || parseFloat(cs.minHeight) || live.height,
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
  document.documentElement.style.fontSize = '16px';
  setViewport(1024);
  window.location.hash = '';
  const style = document.createElement('style');
  style.dataset.search1024 = '1';
  style.textContent = SEARCH_CSS;
  document.head.appendChild(style);
});

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

describe('AppShell icon-only search at 1024', () => {
  it('renders a 44×44 Search button found by getByRole', () => {
    renderShell();
    const search = screen.getByRole('button', { name: 'Search' });
    expect(search.getAttribute('aria-label')).toBe('Search');
    const size = box(search);
    expect(size.width).toBe(44);
    expect(size.height).toBe(44);
  });

  it('opens a focused full-width Search… input on one click', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole('button', { name: 'Search' }));
    const input = await screen.findByPlaceholderText('Search…');
    expect(input.tagName).toBe('INPUT');
    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });
    const panel = input.closest('.overlay-panel-xl');
    expect(panel).toBeTruthy();
    expect(getComputedStyle(input).width).toBe('100%');
    expect(getComputedStyle(panel as HTMLElement).width).toBe('100%');
  });

  it('closes on Escape and click outside, and keeps the typed text on reopen', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole('button', { name: 'Search' }));
    const input = await screen.findByPlaceholderText('Search…');
    await user.type(input, 'pump');
    expect((input as HTMLInputElement).value).toBe('pump');

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Search…')).toBeNull();
    });

    await user.click(screen.getByRole('button', { name: 'Search' }));
    const afterEsc = await screen.findByPlaceholderText('Search…');
    expect((afterEsc as HTMLInputElement).value).toBe('pump');

    const backdrop = afterEsc.closest('.overlay-backdrop');
    expect(backdrop).toBeTruthy();
    await user.click(backdrop as HTMLElement);
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Search…')).toBeNull();
    });

    await user.click(screen.getByRole('button', { name: 'Search' }));
    const afterOutside = await screen.findByPlaceholderText('Search…');
    expect((afterOutside as HTMLInputElement).value).toBe('pump');
  });
});
