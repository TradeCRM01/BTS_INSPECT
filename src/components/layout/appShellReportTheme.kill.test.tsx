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

const themeState = vi.hoisted(() => ({
  reportTheme: null as Record<string, string> | null,
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { name: 'Field Audit', role: 'admin', company_id: 'c1' },
    company: {
      name: 'Northside Plumbing & Gas Maintenance Services Pty Ltd',
      report_theme: themeState.reportTheme,
    },
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
      ? (resolveThen: (v: unknown) => void) => resolveThen({ data: [], error: null, count: 0 })
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

function injectPaintCss() {
  const tokens = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');
  const style = document.createElement('style');
  style.dataset.s2Shell = '1';
  // Consume --shell-navy/--shell-accent when AppShell sets them, else tokens.
  style.textContent = `${tokens}
    .shell-header {
      background-color: var(--shell-navy, var(--g-nav-bg));
      color: var(--shell-accent, var(--g-nav-ink));
    }
    .shell-nav-btn { color: var(--g-ink-subtle); background: transparent; }
    .shell-nav-btn-active {
      color: var(--shell-accent, var(--g-nav-ink));
      border-bottom-color: var(--shell-accent, var(--g-nav-ink));
    }
    .shell-bottom-nav {
      background-color: var(--shell-navy, var(--g-tab-bg));
      color: var(--g-tab-ink);
    }
    .shell-bottom-tab { color: var(--g-tab-ink); }
    .shell-bottom-tab-active { color: var(--shell-accent, var(--g-tab-active-ink)); }
    .shell-bottom-tab-active .shell-bottom-tab-pip {
      background: var(--g-tab-active-bg);
      color: var(--g-tab-active-ink);
    }
  `;
  document.head.appendChild(style);
}

function paint(el: Element | null) {
  expect(el).not.toBeNull();
  const node = el as HTMLElement;
  const cs = getComputedStyle(node);
  const navy = (node.style.getPropertyValue('--shell-navy') || cs.getPropertyValue('--shell-navy')).trim();
  const accent = (node.style.getPropertyValue('--shell-accent') || cs.getPropertyValue('--shell-accent')).trim();
  return {
    bg: navy || cs.backgroundColor,
    color: accent || cs.color,
    navy,
    accent,
  };
}

function isLoud(c: string) {
  return /#ff0000/i.test(c)
    || /#00ff00/i.test(c)
    || /rgb\(\s*255,\s*0,\s*0\s*\)/.test(c)
    || /rgb\(\s*0,\s*255,\s*0\s*\)/.test(c);
}

let container: HTMLDivElement;
let root: Root;

async function renderShell(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <AppShell>
            <div>child</div>
          </AppShell>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
}

function snapshot() {
  const header = paint(container.querySelector('.shell-header'));
  const activeNav = paint(
    container.querySelector('.shell-nav-btn-active') || container.querySelector('[data-shell-nav-group="Jobs"]'),
  );
  const tabBar = paint(container.querySelector('.shell-bottom-nav'));
  const activeTab = paint(
    container.querySelector('.shell-bottom-tab-active') || container.querySelector('[data-phone-tab="jobs"]'),
  );
  return { header, activeNav, tabBar, activeTab };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  themeState.reportTheme = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  injectPaintCss();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  document.querySelectorAll('style[data-s2-shell]').forEach((el) => el.remove());
});

describe('report_theme does not tint the app shell', () => {
  it('keeps header, active nav and tab bar computed colours identical for #FF0000/#00FF00 vs null', async () => {
    themeState.reportTheme = null;
    await renderShell('/jobs');
    const plain = snapshot();

    themeState.reportTheme = { navy: '#FF0000', accent: '#00FF00', accentLight: '#00FF00', navyLight: '#FF0000' };
    await renderShell('/jobs');
    const loud = snapshot();

    expect(loud.header.bg).toBe(plain.header.bg);
    expect(loud.header.color).toBe(plain.header.color);
    expect(loud.header.navy).toBe(plain.header.navy);
    expect(loud.header.accent).toBe(plain.header.accent);
    expect(loud.activeNav.color).toBe(plain.activeNav.color);
    expect(loud.tabBar.bg).toBe(plain.tabBar.bg);
    expect(loud.tabBar.navy).toBe(plain.tabBar.navy);
    expect(loud.activeTab.color).toBe(plain.activeTab.color);
    expect(isLoud(loud.header.bg)).toBe(false);
    expect(isLoud(loud.header.color)).toBe(false);
    expect(isLoud(loud.activeNav.color)).toBe(false);
    expect(isLoud(loud.tabBar.bg)).toBe(false);
    expect(isLoud(loud.activeTab.color)).toBe(false);
    expect(container.innerHTML).not.toContain('#FF0000');
    expect(container.innerHTML).not.toContain('#00FF00');
  });
});
