/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionDueReminder } from '../components/inspection/InspectionDueReminder';
import { FIELD_AU_PHONE } from '../lib/fieldValidation';

vi.mock('../lib/supabase', () => ({
  supabase: {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    order: () => Promise.resolve({ data: [], error: null }),
                  };
                },
                maybeSingle: () => Promise.resolve({
                  data: {
                    smtp_host: 'smtp.resend.com',
                    smtp_pass: 'x',
                    from_name: 'Co',
                    from_email: 'quotes@co.com.au',
                  },
                  error: null,
                }),
                order: () => Promise.resolve({ data: [], error: null }),
              };
            },
          };
        },
      };
    },
  },
}));

vi.mock('../components/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../components/ui')>();
  return {
    ...actual,
    useToast: () => ({ showToast: () => {} }),
  };
});

let container: HTMLDivElement;
let root: Root;

function setInput(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
}

async function renderTray() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: 1, retryDelay: 0 } },
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <InspectionDueReminder
            inspection={{
              id: 'ins-1',
              status: 'in_progress',
              client_id: 'c1',
              crm_job_id: 'job-1',
              due_on: '2026-10-20',
            }}
            job={{
              id: 'job-1',
              company_id: 'co1',
              client_id: 'c1',
              title: 'Switchboard',
              status: 'scheduled',
              scheduled_date: '2026-10-20',
            }}
            client={{ id: 'c1', name: 'Acme', email: 'jane@acme.com.au', phone: '' }}
            company={{ id: 'co1', name: 'Co', email: 'office@co.com.au' }}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  await flush();
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLElement.prototype.scrollIntoView = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('Inspection due reminder client phone', () => {
  it('describes the inline phone error on the due reminder SMS To field', async () => {
    await renderTray();
    const phone = container.querySelector('input[aria-label="Client phone"]') as HTMLInputElement | null;
    expect(phone).toBeTruthy();
    await act(async () => {
      setInput(phone!, 'abc');
    });
    await act(async () => {
      container.querySelector('.job-client-phone-save')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const phoneError = container.querySelector('#inspection-due-client-phone-error');
    expect(phoneError?.textContent).toBe(FIELD_AU_PHONE);
    expect(phone!.getAttribute('aria-invalid')).toBe('true');
    expect(phone!.getAttribute('aria-describedby')).toBe('inspection-due-client-phone-error');
    expect(phoneError?.closest('form.job-client-phone')).toBe(phone!.closest('form'));
  });
});
