/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { name: 'Field Audit', role: 'admin', company_id: 'c1' },
    company: { name: 'CoS Test Plumbing', report_theme: null },
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

function getByRole(role: 'button', options: { name: string | RegExp }): HTMLElement {
  const matches = [...document.querySelectorAll(role)].filter((el) => {
    const labelled = el.getAttribute('aria-labelledby');
    const fromId = labelled
      ? labelled.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ')
      : '';
    const name = (el.getAttribute('aria-label') || fromId || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (typeof options.name === 'string') return name === options.name || name.includes(options.name);
    return options.name.test(name);
  });
  if (matches.length === 0) {
    throw new Error(`Unable to find role="${role}" with name ${options.name}`);
  }
  if (matches.length > 1) {
    throw new Error(`Found ${matches.length} role="${role}" with name ${options.name}`);
  }
  return matches[0] as HTMLElement;
}

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

describe('AppShell desktop Search button', () => {
  it('has an accessible name (mutant: drop aria-label when Search is icon-only)', async () => {
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
    const search = getByRole('button', { name: 'Search' });
    expect(search.getAttribute('aria-label')).toBe('Search');
  });
});
