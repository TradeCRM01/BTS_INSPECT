/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

const LONG_NAME = 'Northside Plumbing & Gas Maintenance Pty Ltd';
const ONE_WORD = 'Grafter';

let companyName = LONG_NAME;
let profileName = 'Field Audit';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { name: profileName, role: 'admin', company_id: 'c1' },
    company: { name: companyName, report_theme: null },
    signOut: async () => {},
    isPlatformOperator: false,
  }),
}));

vi.mock('../../lib/useCompanyAiKey', () => ({
  useCompanyAiKey: () => ({ ready: true, hasKey: false }),
}));

vi.mock('../search/GlobalSearch', () => ({
  GlobalSearch: () => null,
}));

vi.mock('../ui/DevConsole', () => ({
  DevConsole: () => null,
}));

let container: HTMLDivElement;
let root: Root;

async function renderShell() {
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
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  companyName = LONG_NAME;
  profileName = 'Field Audit';
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

describe('AppShell desktop switcher fits the header row', () => {
  it('renders the full company name wrapped, without truncate, and matching title', async () => {
    await renderShell();
    const name = container.querySelector('[data-shell-switcher-name]');
    expect(name).not.toBeNull();
    expect(name?.textContent).toBe(LONG_NAME);
    expect(name?.className).not.toMatch(/max-w-\[6rem\]/);
    expect(name?.className).not.toMatch(/\btruncate\b/);
    expect(name?.className).not.toMatch(/min-w-0/);
    expect(name?.className).toMatch(/hidden lg:line-clamp-2/);
    expect(name?.className).toMatch(/max-w-\[7\.5rem\]/);
    expect(name?.className).toMatch(/lg:line-clamp-2/);
    expect(name?.className).toMatch(/\bleading-4\b/);
    expect(name?.className).toMatch(/\bbreak-words\b/);
    expect(name?.className).not.toMatch(/\bwhitespace-normal\b/);
    expect(name?.className).not.toMatch(/\bleading-none\b/);
    expect(name?.className).not.toMatch(/\blg:block\b/);
    expect(name?.className).toMatch(/\btext-left\b/);
    const btn = name?.closest('button');
    expect(btn?.className).toMatch(/\bmin-h-11\b/);
    expect(btn?.getAttribute('title')).toBe(LONG_NAME);
    expect(btn?.getAttribute('aria-label')).toBe(LONG_NAME);
    const cluster = btn?.parentElement?.parentElement;
    expect(cluster?.className).toMatch(/\bshrink-0\b/);
    const search = container.querySelector('button[aria-label="Search"]');
    expect(search?.className).toMatch(/\bh-11\b/);
    expect(search?.className).toMatch(/\bmin-h-11\b/);
    expect(search?.getAttribute('aria-label')).toBe('Search');
    expect(cluster?.className).not.toMatch(/min-w-0/);
    const avatar = btn?.querySelector('[data-shell-switcher-avatar]');
    const chevron = btn?.querySelector('[data-shell-switcher-chevron]');
    expect(avatar?.getAttribute('class')).toMatch(/\bshrink-0\b/);
    expect(chevron?.getAttribute('class')).toMatch(/\bshrink-0\b/);
  });

  it('renders a one-word company name with the same title and aria-label', async () => {
    companyName = ONE_WORD;
    await renderShell();
    const name = container.querySelector('[data-shell-switcher-name]');
    expect(name?.textContent).toBe(ONE_WORD);
    const btn = name?.closest('button');
    expect(btn?.className).toMatch(/\bmin-h-11\b/);
    expect(btn?.getAttribute('title')).toBe(ONE_WORD);
    expect(btn?.getAttribute('aria-label')).toBe(ONE_WORD);
  });
});
