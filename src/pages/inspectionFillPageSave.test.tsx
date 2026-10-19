/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../contexts/AuthContext';
import { ToastProvider } from '../components/ui';
import { InspectionFillPage } from './InspectionFillPage';
import { setKeepaliveAccessToken } from '../lib/unsavedChangesGuard';

const harness = vi.hoisted(() => ({
  updates: [] as Array<Record<string, unknown>>,
  emptyUpdate: false,
  userId: '00000000-0000-4000-8000-0000000000aa',
  companyId: '00000000-0000-4000-8000-0000000000bb',
  inspectionId: '00000000-0000-4000-8000-0000000000cc',
  inspectionStatus: 'draft',
  inspectionMeta: { siteName: 'Phone site' } as Record<string, string>,
  inspectionCrmJobId: null as string | null,
  inspectionArchived: false,
  jobs: [] as Array<Record<string, unknown>>,
  schema: {
    meta: {
      requiresSiteName: false,
      requiresSiteAddress: false,
      requiresClientName: false,
      requiresJobNumber: false,
    },
    sections: [{
      id: 'sec-1',
      title: 'Prove section',
      isRepeating: false,
      questions: [{
        id: 'notes-1',
        type: 'long_text',
        label: 'Notes',
        required: false,
      }],
    }],
  },
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
  function inspectionRow() {
    return {
      id: harness.inspectionId,
      status: harness.inspectionStatus,
      responses: {},
      meta: harness.inspectionMeta,
      template_snapshot: { name: 'CoS 069 prove template', schema: harness.schema },
      started_at: '2026-10-19T00:00:00.000Z',
      completed_at: harness.inspectionStatus === 'draft' ? null : '2026-10-19T00:00:00.000Z',
      inspector_id: harness.userId,
      crm_job_id: harness.inspectionCrmJobId,
      client_id: null,
      archived: harness.inspectionArchived,
    };
  }

  function resultFor(table: string) {
    if (table === 'profiles') return { data: profile, error: null };
    if (table === 'companies') return { data: company, error: null };
    if (table === 'inspections') return { data: inspectionRow(), error: null };
    if (table === 'jobs') return { data: harness.jobs, error: null };
    if (table === 'photos') return { data: [], error: null };
    if (table === 'clients') return { data: null, error: null };
    return { data: [], error: null };
  }

  function builder(table: string) {
    let promise: Promise<unknown> = Promise.resolve(resultFor(table));
    const query = {
      select() { return query; },
      order() { return query; },
      eq() { return query; },
      in() { return query; },
      limit() { return query; },
      or() { return query; },
      update(payload: Record<string, unknown>) {
        if (table === 'inspections') harness.updates.push(payload);
        if (table === 'inspections' && harness.emptyUpdate) {
          promise = Promise.resolve({ data: [], error: null });
        } else         if (table === 'inspections') {
          promise = Promise.resolve({ data: [{ id: harness.inspectionId, ...payload }], error: null });
        }
        return query;
      },
      delete() { return query; },
      maybeSingle() { return promise; },
      single() { return promise; },
      then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        return promise.then(onFulfilled, onRejected);
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
      storage: {
        from: () => ({
          createSignedUrl: async () => ({ data: { signedUrl: '' }, error: null }),
          remove: async () => ({ error: null }),
        }),
      },
    },
  };
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.updates = [];
  harness.emptyUpdate = false;
  harness.inspectionStatus = 'draft';
  harness.inspectionMeta = { siteName: 'Phone site' };
  harness.inspectionCrmJobId = null;
  harness.inspectionArchived = false;
  harness.jobs = [];
  sessionStorage.clear();
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
  const router = createMemoryRouter([
    {
      path: '/inspections/:id',
      element: (
        <AuthProvider>
          <ToastProvider>
            <InspectionFillPage />
          </ToastProvider>
        </AuthProvider>
      ),
    },
    { path: '/inspections', element: <div>Inspections list</div> },
    { path: '/inspections/:id/review', element: <div>REVIEW PAGE</div> },
    { path: '/inspections/:id/report', element: <div>REPORT PAGE</div> },
  ], { initialEntries: [`/inspections/${harness.inspectionId}`] });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  });
}

async function waitForNotes() {
  const started = Date.now();
  while (Date.now() - started < 4000) {
    if (container.querySelector('textarea')) return container.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
  }
  throw new Error(`timed out waiting for notes: ${document.body.textContent?.slice(0, 400)}`);
}

describe('inspection fill page flush', () => {
  it('keeps a typed note by flushing on blur before the debounce would fire', async () => {
    await renderPage();
    const notes = await waitForNotes();
    expect(document.body.textContent).toContain('Saved');

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(notes, 'keep this note');
      notes.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(document.body.textContent).toContain('Saving…');
    expect(harness.updates).toEqual([]);

    await act(async () => {
      notes.blur();
      notes.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      await Promise.resolve();
    });

    expect(harness.updates.length).toBeGreaterThan(0);
    expect(JSON.stringify(harness.updates[0])).toContain('keep this note');
  });

  it('warns on Inspections while saving and keeps the note if you cancel', async () => {
    await renderPage();
    const notes = await waitForNotes();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(notes, 'keep this note');
      notes.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(document.body.textContent).toContain('Saving…');
    expect(document.body.textContent).not.toContain('Inspections list');

    const back = Array.from(document.body.querySelectorAll('a')).find(link => (
      link.textContent?.replace(/\s+/g, ' ').trim() === 'Inspections'
    ));
    if (!back) throw new Error('missing Inspections link');
    await act(async () => {
      back.click();
    });
    expect(document.body.textContent).toMatch(/Leave without saving\?|Leave\?/);
    expect(document.body.textContent).toMatch(/unsaved changes|last edit is saved/);
    expect((container.querySelector('textarea') as HTMLTextAreaElement).value).toBe('keep this note');
    expect(document.body.textContent).not.toContain('Inspections list');

    const cancel = Array.from(document.body.querySelectorAll('button')).find(btn => btn.textContent === 'Cancel');
    if (!cancel) throw new Error('missing Cancel');
    await act(async () => {
      cancel.click();
    });
    expect(document.body.textContent).not.toMatch(/Leave without saving\?|Your last edit is saved/);
    expect((container.querySelector('textarea') as HTMLTextAreaElement).value).toBe('keep this note');
    expect(document.body.textContent).not.toContain('Inspections list');
  });

  it('0 returned rows means the edit stays pending and Saved is not shown', async () => {
    harness.emptyUpdate = true;
    await renderPage();
    const notes = await waitForNotes();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(notes, 'kept?');
      notes.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      notes.blur();
      notes.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      await Promise.resolve();
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    expect(harness.updates.length).toBeGreaterThan(0);
    expect(JSON.stringify(harness.updates[0])).toContain('kept?');
    expect(container.querySelector('[data-save-status]')?.getAttribute('data-save-status')).not.toBe('saved');
    expect(document.body.textContent).toMatch(/Save failed|Unsaved|Saving/);
  });

  it('K2: pagehide keepalive uses the session bearer and does not mark Saved', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'ANON_KEY_123');
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const orig = globalThis.fetch;
    globalThis.fetch = ((url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return Promise.resolve(new Response(null, { status: 204 }));
    }) as typeof fetch;
    try {
      await renderPage();
      const notes = await waitForNotes();
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(notes, 'kept?');
        notes.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const updatesBefore = harness.updates.length;
      await act(async () => {
        window.dispatchEvent(new Event('pagehide'));
        window.dispatchEvent(new Event('beforeunload', { cancelable: true }));
      });
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 80));
      });
      const ka = calls.filter(c => c.url.includes('/rest/v1/inspections'));
      expect(ka.length).toBeGreaterThan(0);
      const headers = ka[0].init.headers as Record<string, string>;
      expect(ka[0].init.keepalive).toBe(true);
      expect(headers.apikey).toBe('ANON_KEY_123');
      expect(headers.Authorization).toBe('Bearer qa-token');
      expect(harness.updates.length).toBe(updatesBefore);
      expect(container.querySelector('[data-save-status]')?.getAttribute('data-save-status')).not.toBe('saved');
    } finally {
      globalThis.fetch = orig;
      vi.unstubAllEnvs();
    }
  });

  it('pagehide without a session token does not write, does not show Saved, and still warns', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'ANON_KEY_123');
    const fetch = vi.fn();
    const orig = globalThis.fetch;
    globalThis.fetch = fetch as typeof fetch;
    try {
      await renderPage();
      const notes = await waitForNotes();
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(notes, 'kept?');
        notes.dispatchEvent(new Event('input', { bubbles: true }));
      });
      setKeepaliveAccessToken(null);
      const updatesBefore = harness.updates.length;
      let warned = false;
      await act(async () => {
        window.dispatchEvent(new Event('pagehide'));
        const leave = new Event('beforeunload', { cancelable: true });
        Object.defineProperty(leave, 'returnValue', {
          configurable: true,
          set() { warned = true; },
          get() { return ''; },
        });
        window.dispatchEvent(leave);
        if (leave.defaultPrevented) warned = true;
      });
      expect(fetch.mock.calls.some(call => String(call[0]).includes('/rest/v1/inspections'))).toBe(false);
      expect(harness.updates.length).toBe(updatesBefore);
      expect(container.querySelector('[data-save-status]')?.getAttribute('data-save-status')).not.toBe('saved');
      expect(warned).toBe(true);
    } finally {
      globalThis.fetch = orig;
      vi.unstubAllEnvs();
    }
  });

  it('a failed Review save stays on the fill page and shows the error', async () => {
    await renderPage();
    const notes = await waitForNotes();
    harness.emptyUpdate = true;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(notes, 'kept?');
      notes.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 800));
    });
    expect(harness.updates.length).toBeGreaterThan(0);
    expect(JSON.stringify(harness.updates[0])).toContain('kept?');
    const review = Array.from(document.body.querySelectorAll('button')).find(btn => (
      /Review|Save/.test(btn.textContent || '') && !/Cancel|Leave/.test(btn.textContent || '')
    ));
    if (!review) throw new Error('missing Review');
    await act(async () => {
      review.click();
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 200));
    });
    expect(document.body.textContent).not.toContain('REVIEW PAGE');
    expect(container.querySelector('[data-save-status]')?.getAttribute('data-save-status')).toBe('error');
  });

  it('after Saved, Inspections navigates with no leave dialog', async () => {
    await renderPage();
    const notes = await waitForNotes();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(notes, 'saved then leave');
      notes.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 800));
    });
    expect(container.querySelector('[data-save-status]')?.getAttribute('data-save-status')).toBe('saved');
    const back = Array.from(document.body.querySelectorAll('a')).find(link => (
      link.textContent?.replace(/\s+/g, ' ').trim() === 'Inspections'
    ));
    if (!back) throw new Error('missing Inspections link');
    await act(async () => {
      back.click();
    });
    expect(document.body.textContent).not.toContain('Leave without saving?');
    expect(document.body.textContent).not.toContain('Your last edit is saved');
    expect(document.body.textContent).not.toContain('Leave?');
    expect(document.body.textContent).toContain('Inspections list');
  });

  it('R2: after Saved, Review navigates with no leave dialog', async () => {
    await renderPage();
    const notes = await waitForNotes();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(notes, 'probe note');
      notes.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 800));
    });
    expect(container.querySelector('[data-save-status]')?.getAttribute('data-save-status')).toBe('saved');
    const review = Array.from(document.body.querySelectorAll('button')).find(btn => (
      /Review/.test(btn.textContent || '') && !/Cancel|Leave/.test(btn.textContent || '')
    ));
    if (!review) throw new Error('missing Review');
    await act(async () => {
      review.click();
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 80));
    });
    expect(document.body.textContent).not.toContain('Leave without saving?');
    expect(document.body.textContent).toContain('REVIEW PAGE');
  });

  it('does not write an issued inspection on retry, flush, or View PDF', async () => {
    const walked = await finalisedWalk('issued');
    expect(walked).toMatchObject({
      lock: true,
      textareaDisabled: true,
      updates: 0,
      rest: 0,
      navigated: 'report',
    });
    expect(walked.follows).toBe(false);
  });

  it('does not persist a draft when the living job matches stored meta', async () => {
    harness.inspectionMeta = { siteName: 'Same St', siteAddress: 'Same St', clientName: '' };
    harness.inspectionCrmJobId = 'job-1';
    harness.jobs = [{
      id: 'job-1',
      title: 'Same St',
      client_id: null,
      address: 'Same St',
      job_number: 7,
      scheduled_date: '2026-10-19',
      company_id: harness.companyId,
      start_time: null,
    }];
    await renderPage();
    await waitForNotes();
    const started = Date.now();
    while (Date.now() - started < 2000 && harness.updates.length === 0) {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    }
    expect(harness.updates).toEqual([]);
  });
});

function forceType(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function tick(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

async function finalisedWalk(status: string, archived = false) {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'ANON_KEY_123');
  const calls: string[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = ((url: string) => {
    calls.push(String(url));
    return Promise.resolve(new Response(null, { status: 204 }));
  }) as typeof fetch;
  harness.inspectionStatus = status;
  harness.inspectionArchived = archived;
  harness.inspectionMeta = { siteName: 'Old St', siteAddress: 'Old St', clientName: 'Old Client' };
  harness.inspectionCrmJobId = 'job-1';
  harness.jobs = [{
    id: 'job-1',
    title: 'New job',
    client_id: 'client-1',
    address: 'New St',
    job_number: 41,
    scheduled_date: '2026-10-19',
    company_id: harness.companyId,
    start_time: null,
  }];
  const out = {
    lock: false,
    follows: false,
    textareaDisabled: false,
    updates: 0,
    rest: 0,
    navigated: '',
  };
  try {
    vi.useFakeTimers();
    await renderPage();
    for (let i = 0; i < 20 && !container.querySelector('textarea'); i++) await tick(50);
    const body = document.body.textContent || '';
    out.lock = body.includes('Locked. Contact the office to amend.');
    out.follows = body.includes('Site follows this job.') || body.includes('Client follows this job');
    const ta = container.querySelector('textarea') as HTMLTextAreaElement | null;
    out.textareaDisabled = !!ta?.matches(':disabled');
    if (ta) await act(async () => { forceType(ta, 'forced edit'); });
    await tick(700);
    await tick(31000);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pagehide'));
      window.dispatchEvent(new Event('beforeunload', { cancelable: true }));
    });
    const btn = Array.from(document.body.querySelectorAll('button')).find(b => (
      /View PDF|Review|Next/.test(b.textContent || '')
    ));
    if (btn) await act(async () => { btn.click(); });
    await tick(100);
    out.updates = harness.updates.length;
    out.rest = calls.filter(u => u.includes('/rest/v1/inspections')).length;
    out.navigated = (document.body.textContent || '').includes('REPORT PAGE')
      ? 'report'
      : ((document.body.textContent || '').includes('REVIEW PAGE') ? 'review' : 'stayed');
    return out;
  } finally {
    globalThis.fetch = orig;
    vi.unstubAllEnvs();
    vi.useRealTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  }
}

describe('finalised write guards', () => {
  it('living effect returns before persist when the inspection is finalised', async () => {
    const walked = await finalisedWalk('issued');
    expect(walked.updates).toBe(0);
    expect(walked.rest).toBe(0);
    expect(walked.lock).toBe(true);
  });

  it('saveInspection returns before update when the inspection is finalised', async () => {
    const walked = await finalisedWalk('completed');
    expect(walked).toMatchObject({ lock: true, follows: false, textareaDisabled: true, updates: 0, rest: 0, navigated: 'report' });
  });

  it('flush and retry skip saveInspection when the inspection is finalised', async () => {
    const walked = await finalisedWalk('sent');
    expect(walked.updates).toBe(0);
    expect(walked.rest).toBe(0);
    expect(walked.lock).toBe(true);
    expect(walked.follows).toBe(false);
  });

  it('living effect does not persist when the living job matches stored meta', async () => {
    harness.inspectionStatus = 'draft';
    harness.inspectionMeta = { siteName: 'Same St', siteAddress: 'Same St', clientName: '' };
    harness.inspectionCrmJobId = 'job-1';
    harness.jobs = [{
      id: 'job-1',
      title: 'Same St',
      client_id: null,
      address: 'Same St',
      job_number: 7,
      scheduled_date: '2026-10-19',
      company_id: harness.companyId,
      start_time: null,
    }];
    await renderPage();
    await waitForNotes();
    const started = Date.now();
    while (Date.now() - started < 2000 && harness.updates.length === 0) {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    }
    expect(harness.updates).toEqual([]);
  });

  it('locks a draft with the archived flag and writes nothing after forced input', async () => {
    const walked = await finalisedWalk('draft', true);
    expect(walked).toMatchObject({ lock: true, follows: false, textareaDisabled: true, updates: 0, rest: 0 });
  });
});

