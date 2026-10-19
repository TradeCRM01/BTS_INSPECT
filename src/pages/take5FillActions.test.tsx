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
import { Take5Page } from './Take5Page';

const harness = vi.hoisted(() => ({
  updates: [] as Array<Record<string, unknown>>,
  stroke: '' as string,
  userId: '00000000-0000-4000-8000-0000000000aa',
  companyId: '00000000-0000-4000-8000-0000000000bb',
  take5Id: '00000000-0000-4000-8000-0000000000cc',
  jhaId: '00000000-0000-4000-8000-0000000000dd',
  take5: {
    id: '00000000-0000-4000-8000-0000000000cc',
    jha_document_id: '00000000-0000-4000-8000-0000000000dd',
    status: 'draft',
    meta: {
      date: '2026-10-19',
      time: '09:00',
      location: 'Laundry HWS cupboard',
      crewSignOns: '',
    },
    stop_think: 'Isolate the board',
    identify_hazards: 'Live terminals',
    assess_risk: 'High if re-energised',
    control_actions: 'Lock out and test dead',
    go_no_go: 'go' as const,
    signed_name: 'Jane Spark',
    signature: null as string | null,
    signed_at: null as string | null,
  },
}));

vi.mock('react-signature-canvas', () => {
  const React = require('react') as typeof import('react');
  return {
    default: React.forwardRef(function Sig(
      props: { onEnd?: () => void },
      ref: React.Ref<{ isEmpty: () => boolean; toDataURL: () => string; clear: () => void }>,
    ) {
      React.useImperativeHandle(ref, () => ({
        isEmpty: () => !harness.stroke,
        toDataURL: () => harness.stroke || '',
        clear: () => { harness.stroke = ''; },
      }));
      return React.createElement('canvas', {
        'data-sig-pad': '1',
        onMouseUp: () => {
          harness.stroke = 'data:image/png;base64,take5sig';
          props.onEnd?.();
        },
      });
    }),
  };
});

vi.mock('../reports/generateTake5Pdf', () => ({
  generateTake5Pdf: async () => new Blob(['pdf'], { type: 'application/pdf' }),
  take5PdfCompanyFrom: (company: { name: string }) => ({
    name: company.name,
    logo_url: null,
    report_theme: null,
  }),
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
    name: 'Jane Spark',
    role: 'admin',
    email: 'qa@example.com',
  };
  const company = { id: harness.companyId, name: 'QA Co' };
  const jha = {
    id: harness.jhaId,
    report_number: 'JHA-QA',
    meta: { taskName: 'Hot water swap', siteName: '' },
    status: 'draft',
    job_id: null,
  };

  function resultFor(table: string) {
    if (table === 'profiles') return { data: profile, error: null };
    if (table === 'companies') return { data: company, error: null };
    if (table === 'jha_take5') return { data: harness.take5, error: null };
    if (table === 'jha_documents') return { data: jha, error: null };
    if (table === 'jobs') return { data: null, error: null };
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
      maybeSingle() { return promise; },
      single() { return promise; },
      update(payload: Record<string, unknown>) {
        if (table === 'jha_take5') {
          harness.updates.push(payload);
          Object.assign(harness.take5, payload);
        }
        return query;
      },
      insert() { return query; },
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
      rpc: async () => ({ data: [], error: null }),
    },
  };
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.updates = [];
  harness.stroke = '';
  harness.take5.status = 'draft';
  harness.take5.signature = null;
  harness.take5.signed_at = null;
  harness.take5.meta = {
    date: '2026-10-19',
    time: '09:00',
    location: 'Laundry HWS cupboard',
    crewSignOns: '',
  };
  URL.createObjectURL = vi.fn(() => 'blob:take5-pdf');
  URL.revokeObjectURL = vi.fn();
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
      path: '/jha/take5',
      element: (
        <AuthProvider>
          <ToastProvider>
            <Take5Page />
          </ToastProvider>
        </AuthProvider>
      ),
    },
  ], { initialEntries: [`/jha/take5?jhaId=${harness.jhaId}&id=${harness.take5Id}`] });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  });
}

async function waitFor(label: string, find: () => boolean) {
  const started = Date.now();
  while (Date.now() - started < 4000) {
    if (find()) return;
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
  }
  throw new Error(`timed out waiting for ${label}: ${document.body.textContent?.slice(0, 400)}`);
}

function setInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('Take 5 fill — complete, save, signature, names', () => {
  it('keeps Save draft after the first save, writes the signature, and completes to a PDF', async () => {
    await renderPage();
    await waitFor('Mark done', () => document.body.textContent?.includes('Mark done') === true);

    const saveButtons = [...document.querySelectorAll('button')].filter(btn => btn.textContent?.includes('Save draft'));
    expect(saveButtons.length).toBeGreaterThan(0);

    const pad = document.querySelector('[data-sig-pad]') as HTMLElement;
    await act(async () => {
      pad.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    await act(async () => {
      saveButtons[0].click();
    });
    await waitFor('signature persist', () => harness.updates.some(row => (
      row.status === 'draft' && row.signature === 'data:image/png;base64,take5sig'
    )));

    expect(document.body.textContent).toContain('Save draft');
    expect(document.body.textContent).toContain('Signed Jane Spark');

    const location = [...document.querySelectorAll('input')].find(el =>
      el.placeholder.includes('Where is this check'),
    ) as HTMLInputElement;
    await act(async () => {
      location.focus();
      setInputValue(location, '  Cupboard face  ');
      location.blur();
    });
    await act(async () => {
      saveButtons[0].click();
    });
    await waitFor('location persist', () => harness.updates.some(row => {
      const meta = row.meta as { location?: string } | undefined;
      return meta?.location === 'Cupboard face';
    }));

    const complete = document.querySelector('[data-take5-complete]') as HTMLButtonElement;
    expect(complete).toBeTruthy();
    await act(async () => {
      complete.click();
    });
    await waitFor('complete', () => harness.updates.some(row => row.status === 'completed'));

    const pdfTab = [...document.querySelectorAll('button')].find(btn => btn.textContent === 'PDF');
    await act(async () => {
      pdfTab?.click();
    });
    await waitFor('pdf ready', () => document.body.textContent?.includes('Take 5 PDF ready') === true);
    expect(document.body.textContent).not.toContain('Complete the Take 5 to generate the PDF.');
  });
});
