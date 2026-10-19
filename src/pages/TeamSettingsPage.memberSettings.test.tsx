/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MEMBER_SETTINGS_NO_ROW } from '../lib/updateMemberSettings';

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { rpc, auth } = vi.hoisted(() => ({
  rpc: vi.fn(),
  auth: {
    profile: {
      id: '00000000-0000-0000-0000-000000000002',
      role: 'admin',
      company_id: '00000000-0000-0000-0000-000000000001',
      name: 'Field Audit',
    },
    company: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Field Audit Co',
      created_by: '00000000-0000-0000-0000-000000000002',
    },
  },
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: [], error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
    auth: { getSession: async () => ({ data: { session: null } }) },
  },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: auth.profile,
    company: auth.company,
    session: { access_token: 'dev' },
  }),
}));

vi.mock('../components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: unknown }) => children,
}));

vi.mock('../lib/devFieldAuditDocs', () => ({
  getAuditExpenseCostModels: () => [{
    id: 'audit-p331-loaded-hourly',
    company_id: '00000000-0000-0000-0000-000000000001',
    name: 'Loaded crew hourly',
  }],
  getAuditMemberExpenseCostModelId: () => null,
  getAuditTeamMembers: () => null,
}));

vi.mock('../lib/useCompanyAiKey', () => ({
  useCompanyAiKey: () => ({ hasKey: false }),
}));

import { TeamSettingsPage } from './TeamSettingsPage';

async function flush(times = 8) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function waitFor(container: HTMLElement, selector: string) {
  for (let i = 0; i < 40; i += 1) {
    if (container.querySelector(selector)) return;
    await flush(2);
  }
}

function renderPage(url: string): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[url]}>
          <TeamSettingsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  return { container, root };
}

describe('TeamSettingsPage member settings render-and-act', () => {
  beforeEach(() => {
    rpc.mockReset();
    auth.profile = {
      id: '00000000-0000-0000-0000-000000000002',
      role: 'admin',
      company_id: '00000000-0000-0000-0000-000000000001',
      name: 'Field Audit',
    };
    auth.company = {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Field Audit Co',
      created_by: '00000000-0000-0000-0000-000000000002',
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('saves through the RPC and keeps the selected cost model', async () => {
    rpc.mockResolvedValue({
      data: {
        id: 'look-team-alex',
        expense_cost_model_id: 'audit-p331-loaded-hourly',
        template_access: 'view',
        role: 'member',
      },
      error: null,
    });
    const { container, root } = renderPage(
      '/settings/team?look=p331-team-select&id=look-team-alex',
    );
    await waitFor(container, 'select[aria-label="Cost model"]');
    const costSelect = container.querySelector('select[aria-label="Cost model"]') as HTMLSelectElement | null;
    expect(costSelect).toBeTruthy();
    expect(container.textContent).not.toContain('Add a cost model in Expenses');

    await act(async () => {
      costSelect!.value = 'audit-p331-loaded-hourly';
      costSelect!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush(8);

    expect(rpc).toHaveBeenCalled();
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe('update_member_settings');
    expect(args.member_id).toBe('look-team-alex');
    expect(args.patch.expense_cost_model_id).toBe('audit-p331-loaded-hourly');
    expect((container.querySelector('select[aria-label="Cost model"]') as HTMLSelectElement).value)
      .toBe('audit-p331-loaded-hourly');
    act(() => { root.unmount(); });
  });

  it('shows a visible error and reverts the select when the RPC returns 0 rows', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const { container, root } = renderPage(
      '/settings/team?look=p331-team-select&id=look-team-alex',
    );
    await waitFor(container, 'select[aria-label="Cost model"]');
    const costSelect = container.querySelector('select[aria-label="Cost model"]') as HTMLSelectElement;
    const before = costSelect.value;

    await act(async () => {
      costSelect.value = 'audit-p331-loaded-hourly';
      costSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush(8);
    await waitFor(container, '[role="alert"]');

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(MEMBER_SETTINGS_NO_ROW);
    expect((container.querySelector('select[aria-label="Cost model"]') as HTMLSelectElement).value)
      .toBe(before);
    act(() => { root.unmount(); });
  });

  it('reverts template access and shows the same failure when the RPC errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Not allowed' } });
    const { container, root } = renderPage(
      '/settings/team?look=p331-team-select&id=look-team-alex',
    );
    await waitFor(container, 'select[aria-label="Template access"]');
    const accessSelect = container.querySelector('select[aria-label="Template access"]') as HTMLSelectElement;
    expect(accessSelect.value).toBe('view');

    await act(async () => {
      accessSelect.value = 'none';
      accessSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush(8);
    await waitFor(container, '[role="alert"]');

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Not allowed');
    expect((container.querySelector('select[aria-label="Template access"]') as HTMLSelectElement).value)
      .toBe('view');
    act(() => { root.unmount(); });
  });

  it('labels No access as field use, not a hidden library', async () => {
    const { container, root } = renderPage(
      '/settings/team?look=p331-team-select&id=look-team-alex',
    );
    await waitFor(container, 'select[aria-label="Template access"]');
    const noneOpt = [...container.querySelectorAll('select[aria-label="Template access"] option')]
      .find(o => (o as HTMLOptionElement).value === 'none');
    expect(noneOpt?.textContent).toBe('No access');
    act(() => { root.unmount(); });
  });

  it('renders No access as field use, not a hidden library', async () => {
    const { container, root } = renderPage(
      '/settings/team?look=p331-team-select&id=look-team-alex',
    );
    await waitFor(container, 'button');
    const invite = [...container.querySelectorAll('button')].find(b => (b.textContent || '').includes('Invite member'));
    expect(invite).toBeTruthy();
    await act(async () => { invite!.click(); });
    const help = "Can use templates on jobs, can't see or edit the template library";
    for (let i = 0; i < 40; i += 1) {
      if ((document.body.textContent || '').includes(help)) break;
      await flush(2);
    }
    expect(document.body.textContent).toContain(help);
    expect(document.body.textContent).toContain('Invite team member');
    expect(document.body.textContent).toContain('No access');
    act(() => { root.unmount(); });
  });

  it('shows Make admin for the owner and hides it for a non-owner admin', async () => {
    const owner = renderPage('/settings/team?look=p331-team-select&id=look-team-alex');
    await waitFor(owner.container, 'select[aria-label="Cost model"]');
    expect([...owner.container.querySelectorAll('button')].some(b => (b.textContent || '').includes('Make admin'))).toBe(true);
    act(() => { owner.root.unmount(); });
    owner.container.remove();

    auth.profile = {
      ...auth.profile,
      id: '00000000-0000-0000-0000-000000000099',
      name: 'Other Admin',
    };
    const nonOwner = renderPage('/settings/team?look=p331-team-select&id=look-team-alex');
    await waitFor(nonOwner.container, 'select[aria-label="Cost model"]');
    expect([...nonOwner.container.querySelectorAll('button')].some(b => (b.textContent || '').includes('Make admin'))).toBe(false);
    expect(nonOwner.container.textContent).not.toContain('Make admin');
    act(() => { nonOwner.root.unmount(); });
    nonOwner.container.remove();
  });
});
