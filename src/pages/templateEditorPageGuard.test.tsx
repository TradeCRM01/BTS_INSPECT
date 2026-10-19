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
import { TemplateEditorPage } from './TemplateEditorPage';

const harness = vi.hoisted(() => ({
  writes: [] as string[],
  userId: '00000000-0000-4000-8000-0000000000aa',
  companyId: '00000000-0000-4000-8000-0000000000bb',
  templateId: '00000000-0000-4000-8000-0000000000dd',
  schema: {
    meta: {
      requiresSiteName: true,
      requiresSiteAddress: true,
      requiresClientName: true,
      requiresJobNumber: false,
      customFields: [],
    },
    sections: [{
      id: 'sec-1',
      title: 'Pre-start',
      isRepeating: false,
      questions: [{
        id: 'q-water',
        type: 'yes_no',
        label: 'Water off at meter',
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
  const template = {
    id: harness.templateId,
    name: 'Plumbing pre-start',
    report_renderer: 'generic_inspection',
    schema: harness.schema,
    company_id: harness.companyId,
    created_by: harness.userId,
  };

  function resultFor(table: string) {
    if (table === 'profiles') return { data: profile, error: null };
    if (table === 'companies') return { data: company, error: null };
    if (table === 'templates') return { data: template, error: null };
    if (table === 'inspection_renderers') {
      return { data: [{ key: 'generic_inspection', label: 'Generic Inspection' }], error: null };
    }
    return { data: [], error: null };
  }

  function builder(table: string) {
    const promise = Promise.resolve(resultFor(table));
    const query = {
      select() { return query; },
      order() { return query; },
      eq() { return query; },
      in() { return query; },
      limit() { return query; },
      or() { return query; },
      update() { harness.writes.push(`${table}:update`); return query; },
      insert() { harness.writes.push(`${table}:insert`); return query; },
      delete() { harness.writes.push(`${table}:delete`); return query; },
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
    },
  };
});

{ const R = globalThis.Request; (globalThis as { Request: unknown }).Request = class extends R { constructor(i: RequestInfo | URL, init?: RequestInit) { const { signal: _s, ...rest } = init ?? {}; super(i, rest); } }; }

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.writes = [];
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

async function renderPage(initial = `/templates/${harness.templateId}`) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const editor = () => (
    <AuthProvider>
      <ToastProvider>
        <TemplateEditorPage />
      </ToastProvider>
    </AuthProvider>
  );
  const router = createMemoryRouter([
    { path: '/templates/new', element: editor() },
    { path: '/templates/:id', element: editor() },
    { path: '/templates', element: <div>Templates list</div> },
  ], { initialEntries: [initial] });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
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

function clickNamed(label: string) {
  const button = Array.from(document.body.querySelectorAll('button')).find(btn => (
    btn.textContent?.replace(/\s+/g, ' ').trim() === label
    || btn.getAttribute('aria-label') === label
  ));
  if (!button) throw new Error(`missing button ${label}`);
  return act(async () => {
    button.click();
  });
}

describe('template editor leave and question delete', () => {
  it('warns on Templates while unsaved and keeps the edit if you cancel', async () => {
    await renderPage();
    await waitForText('Water off at meter');

    const name = document.querySelector('input[placeholder="Template name"]');
    if (!(name instanceof HTMLInputElement)) throw new Error('missing template name');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(name, 'Sign-off pack');
      name.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(name.value).toBe('Sign-off pack');
    expect(document.body.textContent).not.toContain('Templates list');

    await clickNamed('Templates');
    await waitForText('Leave without saving?');
    expect(document.body.textContent).toContain('unsaved changes');
    expect((document.querySelector('input[placeholder="Template name"]') as HTMLInputElement).value).toBe('Sign-off pack');

    await clickNamed('Cancel');
    expect(document.body.textContent).not.toContain('Leave without saving?');
    expect((document.querySelector('input[placeholder="Template name"]') as HTMLInputElement).value).toBe('Sign-off pack');
    expect(document.body.textContent).not.toContain('Templates list');
  });

  it('does not remove a question until Delete is confirmed', async () => {
    await renderPage();
    await waitForText('Water off at meter');

    await clickNamed('Delete question');
    expect(document.body.textContent).toContain('Delete this question?');
    expect(document.body.textContent).toContain('Water off at meter');

    await clickNamed('Cancel');
    expect(document.body.textContent).toContain('Water off at meter');
    expect(document.body.textContent).not.toContain('Delete this question?');

    await clickNamed('Delete question');
    const confirm = Array.from(document.body.querySelectorAll('button')).find(btn => (
      btn.textContent === 'Delete' && btn.className.includes('btn-')
    ));
    if (!confirm) throw new Error('missing delete confirm');
    await act(async () => {
      confirm.click();
    });
    expect(document.body.textContent).not.toContain('Water off at meter');
  });

  it('R3: first Save on a new template navigates with no leave dialog; the next edit re-arms', async () => {
    await renderPage('/templates/new');
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 400));
    });
    const name = document.querySelector('input[placeholder="Template name"]') as HTMLInputElement | null;
    if (!name) throw new Error('missing template name');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(name, 'New probe');
      name.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const save = Array.from(document.body.querySelectorAll('button')).find(btn => /^\s*Save\s*$/.test(btn.textContent || ''));
    if (!save) throw new Error('missing Save');
    await act(async () => {
      save.click();
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 400));
    });
    expect(document.body.textContent).not.toContain('Leave without saving?');
    expect(harness.writes).toContain('templates:insert');
    await waitForText('Water off at meter').catch(() => {});
    const renamed = document.querySelector('input[placeholder="Template name"]') as HTMLInputElement | null;
    if (!renamed) throw new Error('missing template name after save');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(renamed, 'New probe edited');
      renamed.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await clickNamed('Templates');
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 80));
    });
    expect(document.body.textContent).toContain('Leave without saving?');
    expect(document.body.textContent).not.toContain('Templates list');
  });

  it('R7: delete navigates to the list with no leave dialog', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderPage();
    await waitForText('Water off at meter');
    const name = document.querySelector('input[placeholder="Template name"]') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(name, 'Edited then deleted');
      name.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const del = Array.from(document.body.querySelectorAll('button')).find(btn => (
      btn.textContent?.replace(/\s+/g, ' ').trim() === 'Delete'
    ));
    if (!del) throw new Error('missing Delete');
    await act(async () => {
      del.click();
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 80));
    });
    expect(document.body.textContent).not.toContain('Leave without saving?');
    expect(document.body.textContent).toContain('Templates list');
    confirm.mockRestore();
  });
});
