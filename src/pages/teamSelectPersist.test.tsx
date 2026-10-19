/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIELD_WRITE_FAILED } from '../lib/fieldValidation';
import { TeamSettingsPage } from './TeamSettingsPage';

const harness = vi.hoisted(() => ({
  costModelId: null as string | null,
  templateAccess: 'view' as string,
  failWrite: false as false | 'error' | 'empty',
  writes: [] as Array<{ payload: unknown }>,
  profile: { id: 'admin-1', company_id: 'co1', role: 'admin' },
  company: { id: 'co1', name: 'CoS Test', created_by: 'admin-1' },
  session: { access_token: 't' },
}));

function query(result: { data: unknown; error: unknown }) {
  const row: Record<string, unknown> = {
    select() { return row; },
    eq() { return row; },
    order() { return row; },
    maybeSingle: async () => result,
    single: async () => result,
    then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
  return row;
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from(table: string) {
      if (table === 'expense_cost_models') {
        return query({
          data: [{ id: 'model-1', company_id: 'co1', name: 'Crew hourly' }],
          error: null,
        });
      }
      if (table === 'profiles') {
        return {
          select() {
            return query({
              data: { expense_cost_model_id: harness.costModelId },
              error: null,
            });
          },
          update(payload: Record<string, unknown>) {
            harness.writes.push({ payload });
            if (harness.failWrite === 'error') {
              return query({ data: null, error: { message: 'permission denied' } });
            }
            if (harness.failWrite === 'empty') {
              return query({ data: null, error: null });
            }
            if ('expense_cost_model_id' in payload) {
              harness.costModelId = (payload.expense_cost_model_id as string | null) ?? null;
            }
            if ('template_access' in payload) {
              harness.templateAccess = String(payload.template_access);
            }
            return query({ data: payload, error: null });
          },
        };
      }
      return query({ data: [], error: null });
    },
    rpc: async () => ({
      data: [{
        id: 'member-1',
        email: 'alex@northside.example.com',
        name: 'Alex Nguyen',
        licence_number: 'EC 123456',
        role: 'member',
        template_access: harness.templateAccess,
        created_at: '2026-08-01T00:00:00.000Z',
        email_confirmed_at: '2026-08-01T00:00:00.000Z',
        last_sign_in_at: '2026-08-20T00:00:00.000Z',
      }],
      error: null,
    }),
    auth: {
      getSession: async () => ({ data: { session: { access_token: 't' } }, error: null }),
    },
  },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: harness.profile,
    company: harness.company,
    session: harness.session,
  }),
}));

vi.mock('../components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: unknown }) => <div>{children as never}</div>,
}));

let container: HTMLDivElement;
let root: Root;

async function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/settings/team?id=member-1']}>
          <TeamSettingsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

async function waitForSelect() {
  for (let i = 0; i < 20; i++) {
    if (container.querySelector('select[aria-label="Cost model"]')) return;
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
  }
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear();
  harness.costModelId = null;
  harness.templateAccess = 'view';
  harness.failWrite = false;
  harness.writes = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('Team member selects', () => {
  it('persists Cost model and Templates after a successful write', async () => {
    await renderPage();
    await waitForSelect();
    const cost = container.querySelector('select[aria-label="Cost model"]') as HTMLSelectElement;
    const templates = container.querySelector('select[aria-label="Template access"]') as HTMLSelectElement;
    if (!cost) throw new Error(`no cost select: ${container.textContent?.slice(0, 400)}`);
    expect(cost).toBeTruthy();
    expect(templates).toBeTruthy();
    await act(async () => {
      cost.value = 'model-1';
      cost.dispatchEvent(new Event('change', { bubbles: true }));
      templates.value = 'none';
      templates.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(harness.writes.length).toBeGreaterThan(0);
    expect(harness.costModelId).toBe('model-1');
    expect(harness.templateAccess).toBe('none');
    act(() => root.unmount());
    root = createRoot(container);
    await renderPage();
    await waitForSelect();
    const costAfter = container.querySelector('select[aria-label="Cost model"]') as HTMLSelectElement;
    const templatesAfter = container.querySelector('select[aria-label="Template access"]') as HTMLSelectElement;
    expect(costAfter.value).toBe('model-1');
    expect(templatesAfter.value).toBe('none');
  });

  it('shows the server error when a select write fails', async () => {
    harness.failWrite = 'error';
    await renderPage();
    await waitForSelect();
    const cost = container.querySelector('select[aria-label="Cost model"]') as HTMLSelectElement;
    await act(async () => {
      cost.value = 'model-1';
      cost.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(container.textContent).toContain('permission denied');
    expect(container.textContent).not.toContain(FIELD_WRITE_FAILED);
    const costAfter = container.querySelector('select[aria-label="Cost model"]') as HTMLSelectElement;
    expect(costAfter.value).toBe('');
  });

  it('shows a write failure when the update returns no row', async () => {
    harness.failWrite = 'empty';
    await renderPage();
    await waitForSelect();
    const cost = container.querySelector('select[aria-label="Cost model"]') as HTMLSelectElement;
    await act(async () => {
      cost.value = 'model-1';
      cost.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(container.textContent).toContain(FIELD_WRITE_FAILED);
  });
});
