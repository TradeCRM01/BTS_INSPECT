/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

const { resolveSpy } = vi.hoisted(() => ({ resolveSpy: vi.fn() }));

vi.mock('./appShellTheme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./appShellTheme')>();
  return {
    ...actual,
    resolveAppShellColors: ((...args: Parameters<typeof actual.resolveAppShellColors>) => {
      resolveSpy(...args);
      return actual.resolveAppShellColors(...args);
    }) as typeof actual.resolveAppShellColors,
  };
});

let reportTheme: Record<string, string> | null = null;

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { name: 'Field Audit', role: 'admin', company_id: 'c1' },
    company: { name: 'Northside Plumbing & Gas Maintenance Services Pty Ltd', report_theme: reportTheme },
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

function injectShellCss() {
  const tokens = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');
  const style = document.createElement('style');
  style.dataset.s2Shell = '1';
  style.textContent = `${tokens}
    .shell-header { background-color: var(--g-nav-bg); color: var(--g-nav-ink); }
  `;
  document.head.appendChild(style);
}

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
  resolveSpy.mockClear();
  reportTheme = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  injectShellCss();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  document.querySelectorAll('style[data-s2-shell]').forEach((el) => el.remove());
});

describe('report_theme does not tint the app shell', () => {
  it('keeps header pixels identical when companies.report_theme is navy vs orange', async () => {
    reportTheme = { navy: '#1B3A4B', accent: '#C45C26', accentLight: '#F4D7C4', navyLight: '#2F5A6A' };
    await renderShell();
    const a = container.querySelector('.shell-header') as HTMLElement | null;
    expect(a).not.toBeNull();
    const firstBg = getComputedStyle(a!).backgroundColor;
    const firstInk = getComputedStyle(a!).color;

    reportTheme = { navy: '#7A1F1F', accent: '#E11D48', accentLight: '#FCE7F3', navyLight: '#9F1239' };
    await renderShell();
    const b = container.querySelector('.shell-header') as HTMLElement | null;
    expect(getComputedStyle(b!).backgroundColor).toBe(firstBg);
    expect(getComputedStyle(b!).color).toBe(firstInk);
    expect(container.innerHTML).not.toContain('#7A1F1F');
    expect(container.innerHTML).not.toContain('#1B3A4B');
    expect(resolveSpy).not.toHaveBeenCalled();
  });
});
