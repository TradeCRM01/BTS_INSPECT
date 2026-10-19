/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../contexts/AuthContext';
import { ToastProvider } from '../components/ui';
import { InspectionsPage } from './InspectionsPage';

const harness = vi.hoisted(() => ({
  userId: '00000000-0000-4000-8000-0000000000aa',
  companyId: '00000000-0000-4000-8000-0000000000bb',
  deletes: [] as string[],
  archives: [] as Array<{ id: string; archived: boolean }>,
  issues: [] as string[],
  rows: [] as Array<Record<string, unknown>>,
}));

vi.mock('../lib/supabase', () => {
  const user = {
    id: harness.userId,
    email: 'qa@example.com',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00.000Z',
  };
  const session = {
    access_token: 'qa-token',
    refresh_token: 'qa-refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user,
  };
  const profile = {
    id: harness.userId,
    company_id: harness.companyId,
    name: 'QA',
    role: 'admin',
    email: 'qa@example.com',
  };
  const company = { id: harness.companyId, name: 'QA Co' };

  function builder(table: string) {
    let updatePayload: Record<string, unknown> | null = null;
    let eqId: string | null = null;
    let names = false;
    const query = {
      select() { return query; },
      order() { return query; },
      eq(column: string, value: string) {
        if (column === 'id') eqId = value;
        return query;
      },
      in() {
        names = true;
        return query;
      },
      limit() { return query; },
      or() { return query; },
      not() { return query; },
      update(payload: Record<string, unknown>) {
        updatePayload = payload;
        return query;
      },
      delete() {
        return {
          eq(_column: string, value: string) {
            if (table === 'inspections') harness.deletes.push(value);
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
      maybeSingle() {
        if (table === 'profiles') return Promise.resolve({ data: profile, error: null });
        if (table === 'companies') return Promise.resolve({ data: company, error: null });
        return Promise.resolve({ data: null, error: null });
      },
      single() {
        return query.maybeSingle();
      },
      then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        if (table === 'inspections' && updatePayload && eqId) {
          if (updatePayload.archived != null) {
            harness.archives.push({ id: eqId, archived: Boolean(updatePayload.archived) });
            const row = harness.rows.find(item => item.id === eqId);
            if (row) row.archived = Boolean(updatePayload.archived);
          }
          if (updatePayload.status === 'issued') harness.issues.push(eqId);
        }
        let data: unknown = [];
        if (table === 'inspections' && !updatePayload) data = harness.rows;
        else if (table === 'profiles' && names) data = [{ id: harness.userId, name: 'QA' }];
        else if (table === 'profiles') data = profile;
        else if (table === 'companies') data = company;
        return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
      },
    };
    return query;
  }

  return {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({ error: null }),
      },
      from: (table: string) => builder(table),
      rpc: async () => ({ data: false, error: null }),
    },
  };
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.deletes = [];
  harness.archives = [];
  harness.issues = [];
  harness.rows = [{
    id: 'insp-issued',
    status: 'issued',
    meta: { siteName: 'Phone site' },
    started_at: '2026-10-18T16:00:00.000Z',
    completed_at: '2026-10-18T16:00:00.000Z',
    template_snapshot: { name: 'CoS 069 prove template' },
    inspector_id: harness.userId,
    archived: false,
    parent_inspection_id: null,
    crm_job_id: null,
    responses: {},
    due_on: null,
  }];
  sessionStorage.clear();
  window.history.replaceState({}, '', '/inspections');
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

async function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={['/inspections']}>
              <InspectionsPage />
            </MemoryRouter>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>,
    );
  });
}

async function waitForText(text: string) {
  const started = Date.now();
  while (Date.now() - started < 4000) {
    if (document.body.textContent?.includes(text)) return;
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
  }
  throw new Error(`timed out waiting for ${text}: ${document.body.textContent?.slice(0, 400)}`);
}

async function openFilters() {
  const filter = document.querySelector('[aria-label="Filter inspections"]');
  if (!(filter instanceof HTMLElement)) throw new Error('missing filter');
  await act(async () => {
    filter.click();
  });
}

describe('inspections list delete, archive, filter, and date', () => {
  it('asks before delete and archive, then shows archived so it can be restored', async () => {
    await renderPage();
    await waitForText('Start inspection');
    await openFilters();
    const all = Array.from(document.body.querySelectorAll('button')).find(btn => btn.textContent === 'All inspections');
    if (!all) throw new Error('missing All inspections');
    await act(async () => {
      all.click();
    });
    await waitForText('Phone site');
    expect(document.body.textContent).toContain('19 Oct 2026');

    const more = Array.from(document.querySelectorAll('summary[aria-label="More"]'));
    if (!more[0]) throw new Error('missing row menu');
    await act(async () => {
      (more[0] as HTMLElement).click();
    });

    const deleteBtn = Array.from(document.body.querySelectorAll('button')).find(btn => btn.textContent === 'Delete');
    if (!deleteBtn) throw new Error('missing Delete');
    await act(async () => {
      deleteBtn.click();
    });
    expect(harness.deletes).toEqual([]);
    await waitForText('Delete this issued inspection?');

    const cancel = Array.from(document.body.querySelectorAll('button')).find(btn => btn.textContent === 'Cancel');
    if (!cancel) throw new Error('missing Cancel');
    await act(async () => {
      cancel.click();
    });

    await act(async () => {
      (more[0] as HTMLElement).click();
    });
    const archiveBtn = Array.from(document.body.querySelectorAll('button')).find(btn => btn.textContent === 'Archive');
    if (!archiveBtn) throw new Error('missing Archive');
    await act(async () => {
      archiveBtn.click();
    });
    expect(harness.archives).toEqual([]);
    await waitForText('Archive this issued inspection?');

    const confirmArchive = Array.from(document.body.querySelectorAll('button')).find(btn => btn.textContent === 'Archive' && btn.className.includes('btn-'));
    const archiveConfirms = Array.from(document.body.querySelectorAll('button')).filter(btn => btn.textContent === 'Archive');
    const confirm = confirmArchive ?? archiveConfirms[archiveConfirms.length - 1];
    if (!confirm) throw new Error('missing archive confirm');
    await act(async () => {
      confirm.click();
      await Promise.resolve();
    });
    expect(harness.archives.length).toBeGreaterThan(0);

    await openFilters();
    const archived = Array.from(document.body.querySelectorAll('button')).find(btn => btn.textContent === 'Archived');
    if (!archived) throw new Error('missing Archived filter');
    await act(async () => {
      archived.click();
    });
    expect(document.querySelector('[aria-label="Filter inspections"]')?.closest('details')?.open).not.toBe(true);
  });

  it('A1/A2: Archived shows archived rows, Restore writes archived false and returns the row to the active list', async () => {
    harness.rows = [
      {
        id: 'insp-open',
        status: 'draft',
        meta: { siteName: 'Phone site' },
        started_at: '2026-10-18T16:00:00.000Z',
        completed_at: null,
        template_snapshot: { name: 'CoS 069 prove template' },
        inspector_id: harness.userId,
        archived: false,
        parent_inspection_id: null,
        crm_job_id: null,
        responses: {},
        due_on: null,
      },
      {
        id: 'insp-archived',
        status: 'completed',
        meta: { siteName: 'Shed roof' },
        started_at: '2026-10-17T16:00:00.000Z',
        completed_at: '2026-10-17T18:00:00.000Z',
        template_snapshot: { name: 'CoS 069 prove template' },
        inspector_id: harness.userId,
        archived: true,
        parent_inspection_id: null,
        crm_job_id: null,
        responses: {},
        due_on: null,
      },
    ];

    await renderPage();
    await waitForText('Start inspection');
    await openFilters();
    const all = Array.from(document.body.querySelectorAll('button')).find(btn => btn.textContent === 'All inspections');
    if (!all) throw new Error('missing All inspections');
    await act(async () => {
      all.click();
    });
    await waitForText('Phone site');
    expect(document.body.textContent).toContain('Phone site');
    expect(document.body.textContent).not.toContain('Shed roof');

    await openFilters();
    const archived = Array.from(document.body.querySelectorAll('button')).find(btn => btn.textContent === 'Archived');
    if (!archived) throw new Error('missing Archived filter');
    await act(async () => {
      archived.click();
    });
    await waitForText('Shed roof');
    expect(document.body.textContent).toContain('Shed roof');
    expect(document.body.textContent).not.toContain('Phone site');
    expect(document.body.textContent).not.toContain('Unarchive');

    const more = Array.from(document.querySelectorAll('summary[aria-label="More"]'));
    if (!more[0]) throw new Error('missing archived row menu');
    await act(async () => {
      (more[0] as HTMLElement).click();
    });
    const restoreBtn = Array.from(document.body.querySelectorAll('button')).find(btn => btn.textContent === 'Restore');
    if (!restoreBtn) throw new Error('missing Restore');
    await act(async () => {
      restoreBtn.click();
    });
    await waitForText('Restore this inspection?');
    const confirmRestore = Array.from(document.body.querySelectorAll('button')).find(btn => (
      btn.textContent === 'Restore' && btn.className.includes('btn-')
    ));
    if (!confirmRestore) throw new Error('missing restore confirm');
    await act(async () => {
      confirmRestore.click();
      await Promise.resolve();
    });
    expect(harness.archives).toEqual([{ id: 'insp-archived', archived: false }]);
    expect(harness.rows.find(row => row.id === 'insp-archived')?.archived).toBe(false);

    await openFilters();
    const allAgain = Array.from(document.body.querySelectorAll('button')).find(btn => btn.textContent === 'All inspections');
    if (!allAgain) throw new Error('missing All inspections after restore');
    await act(async () => {
      allAgain.click();
    });
    await waitForText('Shed roof');
    expect(document.body.textContent).toContain('Phone site');
    expect(document.body.textContent).toContain('Shed roof');

    await openFilters();
    const archivedAgain = Array.from(document.body.querySelectorAll('button')).find(btn => btn.textContent === 'Archived');
    if (!archivedAgain) throw new Error('missing Archived filter after restore');
    await act(async () => {
      archivedAgain.click();
    });
    await waitForText('No archived inspections');
    expect(document.body.textContent).not.toContain('Shed roof');
  });

  it('closes the filter popup on Escape and labels it', async () => {
    await renderPage();
    await waitForText('Start inspection');
    await openFilters();
    expect(document.querySelector('[aria-label="Filter inspections"]')?.closest('details')?.open).toBe(true);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.querySelector('[aria-label="Filter inspections"]')?.closest('details')?.open).not.toBe(true);
  });
});
