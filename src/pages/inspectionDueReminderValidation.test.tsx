/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionDueReminder } from '../components/inspection/InspectionDueReminder';
import { FIELD_AU_PHONE, FIELD_EMAIL } from '../lib/fieldValidation';

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

async function renderTray(clientEmail = 'jane@acme.com.au') {
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
            client={{ id: 'c1', name: 'Acme', email: clientEmail, phone: '' }}
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

  it('shows the inline due-reminder email error for a@b..c instead of a native email popup', async () => {
    await renderTray('');
    const email = container.querySelector('input[aria-label="Client email"]') as HTMLInputElement | null;
    expect(email).toBeTruthy();
    const form = email!.closest('form.job-client-email') as HTMLFormElement | null;
    expect(form).toBeTruthy();
    expect(form!.noValidate || email!.getAttribute('type') === 'text').toBe(true);
    if (email!.getAttribute('type') === 'text') {
      expect(email!.getAttribute('inputMode')).toBe('email');
    }
    await act(async () => {
      setInput(email!, 'a@b..c');
    });
    await act(async () => {
      container.querySelector('.job-client-email-save')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const emailError = container.querySelector('#inspection-due-client-email-error');
    expect(emailError?.textContent).toBe(FIELD_EMAIL);
    expect(email!.getAttribute('aria-invalid')).toBe('true');
    expect(email!.getAttribute('aria-describedby')).toBe('inspection-due-client-email-error');
    expect(emailError?.closest('form.job-client-email')).toBe(email!.closest('form'));
  });
});
