/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { FIELD_AU_PHONE, FIELD_EMAIL } from '../lib/fieldValidation';
import { QuoteSendDialog } from '../components/invoicing/QuoteSendDialog';

const harness = vi.hoisted(() => ({
  bundle: {
    quote: {
      id: 'q1',
      company_id: 'co1',
      quote_number: 12,
      client_id: 'c1',
      job_id: 'job-1',
      status: 'draft',
      description: 'Switchboard',
      line_items: [{ description: 'Labour', quantity: 1, unit_price: 120 }],
      subtotal: 120,
      tax_rate: 10,
      tax_amount: 12,
      total: 132,
    },
    client: { id: 'c1', name: 'Acme', email: null as string | null, phone: null as string | null, address: '' },
    jobAddress: '1 Test St',
    smtp: { smtp_host: 'smtp.resend.com', smtp_pass: 'x', from_name: 'Co', from_email: 'quotes@co.com.au' },
    company: { name: 'Co', email: 'office@co.com.au' },
  },
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  },
}));

vi.mock('../lib/sendQuoteDeliver', () => ({
  loadQuoteSendBundle: async () => harness.bundle,
}));

vi.mock('../lib/documentShareDeliver', () => ({
  loadActiveClientPortalUrl: async () => null,
  copyShareText: async () => ({ ok: true }),
  markQuoteSentForShare: async () => {},
  openDocumentShareMailto: () => {},
  prepareDocumentShareLink: async () => ({ url: '' }),
  triggerBrowserDownload: () => {},
}));

vi.mock('../lib/checkPriceGate', () => ({
  checkPriceSendBlock: () => null,
  throwIfCheckPriceUnpriced: () => {},
}));

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

async function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <QuoteSendDialog
            quoteId="q1"
            company={{ id: 'co1', name: 'Co', email: 'office@co.com.au' }}
            onClose={() => {}}
            onSent={() => {}}
          />
        </ToastProvider>
      </QueryClientProvider>,
    );
  });
  await flush();
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLElement.prototype.scrollIntoView = vi.fn();
  harness.bundle.quote.line_items = [{ description: 'Labour', quantity: 1, unit_price: 120 }];
  harness.bundle.client.email = null;
  harness.bundle.client.phone = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('Quote send client email and SMS To', () => {
  it('shows the inline email error for a@b..c instead of a native email popup', async () => {
    await renderDialog();
    const email = document.querySelector('input[aria-label="Client email"]') as HTMLInputElement | null;
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
      document.querySelector('.job-client-email-save')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const emailError = document.querySelector('#quote-send-client-email-error');
    expect(emailError?.textContent).toBe(FIELD_EMAIL);
    expect(email!.getAttribute('aria-invalid')).toBe('true');
  });

  it('shows the SMS To error under the phone input', async () => {
    await renderDialog();
    const phone = document.querySelector('input[aria-label="Client phone"]') as HTMLInputElement | null;
    expect(phone).toBeTruthy();
    await act(async () => {
      setInput(phone!, 'abc');
    });
    await act(async () => {
      document.querySelector('.job-client-phone-save')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const phoneError = document.querySelector('#quote-send-client-phone-error');
    expect(phoneError?.textContent).toBe(FIELD_AU_PHONE);
    expect(phoneError?.closest('form.job-client-phone')).toBe(phone!.closest('form'));
    expect(phone!.getAttribute('aria-invalid')).toBe('true');
    expect(phone!.getAttribute('aria-describedby')).toBe('quote-send-client-phone-error');
  });

  it('shows the miss-chrome phone error under the input with aria-invalid', async () => {
    harness.bundle.quote.line_items = [];
    await renderDialog();
    const phone = document.querySelector('input[aria-label="Client phone"]') as HTMLInputElement | null;
    expect(phone).toBeTruthy();
    expect(document.querySelector('.hub-invoice-send-title')).toBeTruthy();
    expect(document.querySelector('.hub-invoice-kicker')).toBeNull();
    await act(async () => {
      setInput(phone!, 'abc');
    });
    await act(async () => {
      document.querySelector('.job-client-phone-save')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const phoneError = document.querySelector('#quote-send-client-phone-error');
    expect(phoneError?.textContent).toBe(FIELD_AU_PHONE);
    expect(phoneError?.closest('form.job-client-phone')).toBe(phone!.closest('form'));
    expect(phone!.getAttribute('aria-invalid')).toBe('true');
    expect(phone!.getAttribute('aria-describedby')).toBe('quote-send-client-phone-error');
  });

  it('shows the miss-chrome email error for a@b..c instead of a native email popup', async () => {
    harness.bundle.quote.line_items = [];
    await renderDialog();
    const email = document.querySelector('input[aria-label="Client email"]') as HTMLInputElement | null;
    expect(email).toBeTruthy();
    expect(document.querySelector('.hub-invoice-send-title')).toBeTruthy();
    expect(document.querySelector('.hub-invoice-kicker')).toBeNull();
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
      document.querySelector('.job-client-email-save')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const emailError = document.querySelector('#quote-send-client-email-error');
    expect(emailError?.textContent).toBe(FIELD_EMAIL);
    expect(email!.getAttribute('aria-invalid')).toBe('true');
    expect(email!.getAttribute('aria-describedby')).toBe('quote-send-client-email-error');
    expect(emailError?.closest('form.job-client-email')).toBe(email!.closest('form'));
  });
});
