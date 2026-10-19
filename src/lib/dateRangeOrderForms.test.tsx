/**
 * @vitest-environment jsdom
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContractForm } from '../pages/ContractsPage';
import { ComplianceForm } from '../pages/CompliancePage';
import { DATE_INVALID_MESSAGE, DATE_RANGE_ORDER_MESSAGE, DATE_REQUIRED_MESSAGE } from './dateTimeIntegrity';
import { DATE_YEAR_RANGE_MESSAGE } from './safeDate';
import { ToastProvider } from '../components/ui/Toast';

const insertContract = vi.fn();

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => Promise.resolve({
              data: table === 'clients' ? [{ id: 'cl-1', name: 'Client' }] : [],
              error: null,
            }),
          }),
        }),
      }),
      insert: (row: unknown) => {
        insertContract(row);
        return Promise.resolve({ error: null });
      },
      update: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      }),
    }),
  },
}));

const auth = {
  profile: { id: 'emp-1', company_id: 'co-1' },
  company: { name: 'Grafter' },
};

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => auth,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  insertContract.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function providers(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>{node}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

function setInput(el: HTMLInputElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  proto?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function tabOut(el: HTMLInputElement) {
  el.focus();
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  el.blur();
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

function pressEnterSave() {
  const btn = document.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!btn) throw new Error('missing Save');
  btn.focus();
  btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
  btn.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
  btn.form?.requestSubmit(btn);
}

function alertsWith(text: string) {
  return [...document.querySelectorAll('[role="alert"]')].filter(el => el.textContent === text);
}

describe('ContractForm date range', () => {
  it('does not save when the end date is before the start date', async () => {
    const onSaved = vi.fn();
    await act(async () => {
      root.render(providers(
        <ContractForm
          contract={null}
          creating={false}
          onClose={() => {}}
          onSaved={onSaved}
        />,
      ));
    });
    await act(async () => {
      await Promise.resolve();
    });

    const title = document.querySelector<HTMLInputElement>('input[placeholder="e.g. Annual Maintenance Agreement"]');
    const client = document.querySelector<HTMLSelectElement>('select');
    await act(async () => {
      if (title) setInput(title, 'Annual service');
      if (client) {
        client.value = 'cl-1';
        client.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    const dates = document.querySelectorAll<HTMLInputElement>('[data-date-field="au"]');
    await act(async () => {
      setInput(dates[0], '21/10/2026');
      setInput(dates[1], '20/10/2026');
    });

    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });

    expect(insertContract).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(DATE_RANGE_ORDER_MESSAGE);
  });

  it('blocks a blank title and client with inline errors', async () => {
    const onSaved = vi.fn();
    await act(async () => {
      root.render(providers(
        <ContractForm contract={null} creating={false} onClose={() => {}} onSaved={onSaved} />,
      ));
    });
    await act(async () => { await Promise.resolve(); });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(insertContract).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Title is required.');
    expect(document.body.textContent).toContain('Client is required.');
  });

  it('blocks an invalid contract start date', async () => {
    const onSaved = vi.fn();
    await act(async () => {
      root.render(providers(
        <ContractForm contract={null} creating={false} onClose={() => {}} onSaved={onSaved} />,
      ));
    });
    await act(async () => { await Promise.resolve(); });
    const title = document.querySelector<HTMLInputElement>('input[placeholder="e.g. Annual Maintenance Agreement"]');
    const client = document.querySelector<HTMLSelectElement>('select');
    await act(async () => {
      if (title) setInput(title, 'Annual service');
      if (client) {
        client.value = 'cl-1';
        client.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    const dates = document.querySelectorAll<HTMLInputElement>('[data-date-field="au"]');
    const nextService = document.querySelector<HTMLInputElement>('#contract-next-service-date');
    await act(async () => {
      setInput(dates[0], '31/02/2026');
      if (nextService) setInput(nextService, '2026-11-01');
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(insertContract).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(DATE_INVALID_MESSAGE);
  });
});

describe('ContractForm next service DateFieldInput', () => {
  async function fillTitleClient() {
    await act(async () => { await Promise.resolve(); });
    const title = document.querySelector<HTMLInputElement>('input[placeholder="e.g. Annual Maintenance Agreement"]');
    const client = document.querySelector<HTMLSelectElement>('select');
    await act(async () => {
      if (title) setInput(title, 'Annual service');
      if (client) {
        client.value = 'cl-1';
        client.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  async function mountForm() {
    const onSaved = vi.fn();
    await act(async () => {
      root.render(providers(
        <ContractForm contract={null} creating={false} onClose={() => {}} onSaved={onSaved} />,
      ));
    });
    await fillTitleClient();
    return onSaved;
  }

  it('saves 21/10/2026 as 2026-10-21', async () => {
    const onSaved = await mountForm();
    const next = document.querySelector<HTMLInputElement>('#contract-next-service-date');
    expect(next?.getAttribute('data-date-field')).toBe('au');
    await act(async () => {
      if (next) setInput(next, '21/10/2026');
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(insertContract).toHaveBeenCalledTimes(1);
    expect((insertContract.mock.calls[0][0] as { next_service_date: string }).next_service_date).toBe('2026-10-21');
    expect(onSaved).toHaveBeenCalled();
  });

  it('blocks 21/10/2101 with the year-range message and writes nothing', async () => {
    const onSaved = await mountForm();
    const next = document.querySelector<HTMLInputElement>('#contract-next-service-date');
    await act(async () => {
      if (next) setInput(next, '21/10/2101');
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(insertContract).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(DATE_YEAR_RANGE_MESSAGE);
  });

  it('emits nothing for a partial 21/10/20 and does not save', async () => {
    const onSaved = await mountForm();
    const next = document.querySelector<HTMLInputElement>('#contract-next-service-date');
    await act(async () => {
      if (next) setInput(next, '21/10/20');
    });
    expect(next?.value).toBe('21/10/20');
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(insertContract).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('2020-10-21');
    expect(document.getElementById('contract-next-service-date-error')?.textContent).toBe(DATE_INVALID_MESSAGE);
    expect(document.body.textContent).not.toContain('Next service date is required.');
  });

  it('blur then Save on 21/10/20 does not write and shows the dd/mm/yyyy message', async () => {
    const onSaved = await mountForm();
    const next = document.querySelector<HTMLInputElement>('#contract-next-service-date');
    expect(next).toBeTruthy();
    await act(async () => {
      next!.focus();
      setInput(next!, '21/10/20');
    });
    await act(async () => { tabOut(next!); });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(insertContract).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(document.getElementById('contract-next-service-date-error')?.textContent).toBe(DATE_INVALID_MESSAGE);
    expect(document.body.textContent).toContain(DATE_INVALID_MESSAGE);
  });

  it('Tab, Save, focus, Tab, Enter Save on 21/10/20 does not write', async () => {
    const onSaved = await mountForm();
    const next = document.querySelector<HTMLInputElement>('#contract-next-service-date');
    expect(next).toBeTruthy();
    await act(async () => {
      next!.focus();
      setInput(next!, '21/10/20');
    });
    await act(async () => { tabOut(next!); });
    expect(next!.value).toBe('21/10/20');
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(insertContract).not.toHaveBeenCalled();
    expect(document.getElementById('contract-next-service-date-error')?.textContent).toBe(DATE_INVALID_MESSAGE);
    await act(async () => {
      next!.focus();
    });
    await act(async () => { tabOut(next!); });
    expect(next!.value).toBe('21/10/20');
    await act(async () => { pressEnterSave(); });
    expect(insertContract).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(document.getElementById('contract-next-service-date-error')?.textContent).toBe(DATE_INVALID_MESSAGE);
    expect(alertsWith(DATE_INVALID_MESSAGE)).toHaveLength(1);
  });

  it('shows the next-service format error when the title is blank', async () => {
    await act(async () => {
      root.render(providers(
        <ContractForm contract={null} creating={false} onClose={() => {}} onSaved={() => {}} />,
      ));
    });
    await act(async () => { await Promise.resolve(); });
    const next = document.querySelector<HTMLInputElement>('#contract-next-service-date');
    await act(async () => {
      if (next) setInput(next, '21/10/20');
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(insertContract).not.toHaveBeenCalled();
    expect(document.getElementById('contract-next-service-date-error')?.textContent).toBe(DATE_INVALID_MESSAGE);
    expect(document.getElementById('contract-title-error')?.textContent).toBe('Title is required.');
  });

  it('does not write a stored next service when the typed text is a 2-digit year', async () => {
    const onSaved = vi.fn();
    await act(async () => {
      root.render(providers(
        <ContractForm
          contract={{
            id: 'con-1',
            company_id: 'co-1',
            client_id: 'cl-1',
            title: 'Annual service',
            description: null,
            contract_number: 'SC-1',
            status: 'active',
            start_date: '2026-01-01',
            end_date: '2026-12-31',
            billing_cycle: 'monthly',
            contract_value: 0,
            service_frequency: 'monthly',
            next_service_date: '2026-10-21',
            last_service_date: null,
            auto_generate_jobs: false,
            notes: null,
            created_at: '2026-10-19T00:00:00.000Z',
            updated_at: '2026-10-19T00:00:00.000Z',
          }}
          creating={false}
          onClose={() => {}}
          onSaved={onSaved}
        />,
      ));
    });
    await act(async () => { await Promise.resolve(); });
    const next = document.querySelector<HTMLInputElement>('#contract-next-service-date');
    await act(async () => {
      if (next) setInput(next, '21/10/20');
    });
    await act(async () => { if (next) tabOut(next); });
    await act(async () => { pressEnterSave(); });
    expect(insertContract).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(document.getElementById('contract-next-service-date-error')?.textContent).toBe(DATE_INVALID_MESSAGE);
  });

  it('does not write when next service is blank', async () => {
    const onSaved = await mountForm();
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(insertContract).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Next service date is required.');
    const next = document.querySelector<HTMLInputElement>('#contract-next-service-date');
    expect(document.getElementById('contract-next-service-date-error')?.textContent).toBe('Next service date is required.');
    expect(next?.getAttribute('aria-invalid')).toBe('true');
    expect(next?.getAttribute('aria-describedby')).toBe('contract-next-service-date-error');
  });

  it('does not write a blank start date', async () => {
    const onSaved = await mountForm();
    const start = document.querySelector<HTMLInputElement>('#contract-start-date');
    const next = document.querySelector<HTMLInputElement>('#contract-next-service-date');
    await act(async () => {
      if (start) setInput(start, '');
      if (next) setInput(next, '21/10/2026');
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(insertContract).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(document.getElementById('contract-start-date-error')?.textContent).toBe(DATE_REQUIRED_MESSAGE);
    expect(start?.getAttribute('aria-invalid')).toBe('true');
    expect(start?.getAttribute('aria-describedby')).toBe('contract-start-date-error');
  });

  it('marks an invalid start date beside the field', async () => {
    await mountForm();
    const start = document.querySelector<HTMLInputElement>('#contract-start-date');
    const next = document.querySelector<HTMLInputElement>('#contract-next-service-date');
    await act(async () => {
      if (start) setInput(start, '21/10/20');
      if (next) setInput(next, '21/10/2026');
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(insertContract).not.toHaveBeenCalled();
    expect(document.getElementById('contract-start-date-error')?.textContent).toBe(DATE_INVALID_MESSAGE);
    expect(start?.getAttribute('aria-invalid')).toBe('true');
    expect(start?.getAttribute('aria-describedby')).toBe('contract-start-date-error');
    expect(alertsWith(DATE_INVALID_MESSAGE)).toHaveLength(1);
  });

  it('marks an invalid end date beside the field', async () => {
    await mountForm();
    const end = document.querySelector<HTMLInputElement>('#contract-end-date');
    const next = document.querySelector<HTMLInputElement>('#contract-next-service-date');
    await act(async () => {
      if (end) setInput(end, '31/02/2026');
      if (next) setInput(next, '21/10/2026');
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(insertContract).not.toHaveBeenCalled();
    expect(document.getElementById('contract-end-date-error')?.textContent).toBe(DATE_INVALID_MESSAGE);
    expect(end?.getAttribute('aria-invalid')).toBe('true');
    expect(end?.getAttribute('aria-describedby')).toBe('contract-end-date-error');
    expect(alertsWith(DATE_INVALID_MESSAGE)).toHaveLength(1);
  });

  it('marks an invalid next service date beside the field', async () => {
    await mountForm();
    const next = document.querySelector<HTMLInputElement>('#contract-next-service-date');
    await act(async () => {
      if (next) setInput(next, '21/10/20');
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(insertContract).not.toHaveBeenCalled();
    expect(document.getElementById('contract-next-service-date-error')?.textContent).toBe(DATE_INVALID_MESSAGE);
    expect(next?.getAttribute('aria-invalid')).toBe('true');
    expect(next?.getAttribute('aria-describedby')).toBe('contract-next-service-date-error');
    expect(alertsWith(DATE_INVALID_MESSAGE)).toHaveLength(1);
  });

  it('P1 bypass: 21/10/20, blur, Save, refocus+blur, Save still writes nothing', async () => {
    const onSaved = await mountForm();
    const next = document.querySelector<HTMLInputElement>('#contract-next-service-date');
    expect(next).toBeTruthy();
    await act(async () => {
      next!.focus();
      setInput(next!, '21/10/20');
    });
    await act(async () => { tabOut(next!); });
    expect(next!.value).toBe('21/10/20');
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(insertContract).not.toHaveBeenCalled();
    expect(document.getElementById('contract-next-service-date-error')?.textContent).toBe(DATE_INVALID_MESSAGE);
    await act(async () => { tabOut(next!); });
    expect(next!.value).toBe('21/10/20');
    await act(async () => { pressEnterSave(); });
    expect(insertContract).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(document.getElementById('contract-next-service-date-error')?.textContent).toBe(DATE_INVALID_MESSAGE);
    expect(next!.getAttribute('aria-invalid')).toBe('true');
    expect(next!.getAttribute('aria-describedby')).toBe('contract-next-service-date-error');
    expect(alertsWith(DATE_INVALID_MESSAGE)).toHaveLength(1);
  });

  it('stale ref: retype 21/10/2027 and submit without blur saves 2027', async () => {
    await mountForm();
    const next = document.querySelector<HTMLInputElement>('#contract-next-service-date');
    await act(async () => {
      next!.focus();
      setInput(next!, '21/10/20');
    });
    await act(async () => { tabOut(next!); });
    await act(async () => {
      next!.focus();
      setInput(next!, '21/10/2027');
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(insertContract).toHaveBeenCalledTimes(1);
    expect((insertContract.mock.calls[0][0] as { next_service_date: string }).next_service_date).toBe('2027-10-21');
  });

  it('treats 21/10/202 as dd/mm/yyyy not a year-range', async () => {
    await mountForm();
    const next = document.querySelector<HTMLInputElement>('#contract-next-service-date');
    await act(async () => {
      if (next) setInput(next, '21/10/202');
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(insertContract).not.toHaveBeenCalled();
    expect(document.getElementById('contract-next-service-date-error')?.textContent).toBe(DATE_INVALID_MESSAGE);
    expect(document.body.textContent).not.toContain(DATE_YEAR_RANGE_MESSAGE);
  });

  it('links a year-range start date with one alert', async () => {
    await mountForm();
    const start = document.querySelector<HTMLInputElement>('#contract-start-date');
    const next = document.querySelector<HTMLInputElement>('#contract-next-service-date');
    await act(async () => {
      if (start) setInput(start, '21/10/2101');
      if (next) setInput(next, '21/10/2026');
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(insertContract).not.toHaveBeenCalled();
    expect(start?.getAttribute('aria-invalid')).toBe('true');
    expect(start?.getAttribute('aria-describedby')).toBe('contract-start-date-error');
    expect(document.getElementById('contract-start-date-error')?.textContent).toBe(DATE_YEAR_RANGE_MESSAGE);
    expect(alertsWith(DATE_YEAR_RANGE_MESSAGE)).toHaveLength(1);
  });

  it('links a year-range next service with one alert', async () => {
    await mountForm();
    const next = document.querySelector<HTMLInputElement>('#contract-next-service-date');
    await act(async () => {
      if (next) setInput(next, '21/10/2101');
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(next?.getAttribute('aria-invalid')).toBe('true');
    expect(next?.getAttribute('aria-describedby')).toBe('contract-next-service-date-error');
    expect(document.getElementById('contract-next-service-date-error')?.textContent).toBe(DATE_YEAR_RANGE_MESSAGE);
    expect(alertsWith(DATE_YEAR_RANGE_MESSAGE)).toHaveLength(1);
  });

  it('marks End invalid when the range is reversed', async () => {
    await mountForm();
    const start = document.querySelector<HTMLInputElement>('#contract-start-date');
    const end = document.querySelector<HTMLInputElement>('#contract-end-date');
    const next = document.querySelector<HTMLInputElement>('#contract-next-service-date');
    await act(async () => {
      if (start) setInput(start, '21/10/2026');
      if (end) setInput(end, '20/10/2026');
      if (next) setInput(next, '21/10/2026');
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(insertContract).not.toHaveBeenCalled();
    expect(document.getElementById('contract-date-range-error')?.textContent).toBe(DATE_RANGE_ORDER_MESSAGE);
    expect(end?.getAttribute('aria-invalid')).toBe('true');
    expect(end?.getAttribute('aria-describedby')).toBe('contract-date-range-error');
  });

  it('typing an invalid next service sets aria-invalid and one field alert', async () => {
    await mountForm();
    const next = document.querySelector<HTMLInputElement>('#contract-next-service-date');
    await act(async () => {
      if (next) setInput(next, '21/10/20');
    });
    expect(next?.getAttribute('aria-invalid')).toBe('true');
    expect(next?.getAttribute('aria-describedby')).toBe('contract-next-service-date-field-error');
    expect(document.getElementById('contract-next-service-date-field-error')?.textContent).toBe(DATE_INVALID_MESSAGE);
    expect(next?.closest('label')?.querySelectorAll('[role="alert"]').length).toBe(1);
  });

  it('shows the title error beside the title field', async () => {
    await act(async () => {
      root.render(providers(
        <ContractForm contract={null} creating={false} onClose={() => {}} onSaved={() => {}} />,
      ));
    });
    await act(async () => { await Promise.resolve(); });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    const title = document.querySelector<HTMLInputElement>('input[placeholder="e.g. Annual Maintenance Agreement"]');
    const inline = document.getElementById('contract-title-error');
    expect(inline?.textContent).toBe('Title is required.');
    expect(title?.getAttribute('aria-describedby')).toBe('contract-title-error');
    expect(title?.closest('.overlay-body')?.querySelector('#contract-title-error')).toBe(inline);
  });
});

describe('ComplianceForm dates', () => {
  const insertCompliance = vi.fn();

  async function fillComplianceBasics() {
    insertContract.mockReset();
    await act(async () => { await Promise.resolve(); });
    const title = document.querySelector<HTMLInputElement>('input[placeholder="e.g. Annual Fire Extinguisher Service"]');
    const client = document.querySelector<HTMLSelectElement>('select');
    await act(async () => {
      if (title) setInput(title, 'Extinguishers');
      if (client) {
        client.value = 'cl-1';
        client.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  it('blocks a blank first due date', async () => {
    insertCompliance.mockReset();
    await act(async () => {
      root.render(providers(
        <ComplianceForm item={null} onClose={() => {}} onSaved={() => {}} />,
      ));
    });
    await fillComplianceBasics();
    const first = document.querySelector<HTMLInputElement>('#compliance-first-due-date');
    await act(async () => {
      if (first) setInput(first, '');
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(document.body.textContent).toContain(DATE_REQUIRED_MESSAGE);
    expect(document.getElementById('compliance-first-due-date-error')?.textContent).toBe(DATE_REQUIRED_MESSAGE);
  });

  it('blocks an invalid first due date', async () => {
    await act(async () => {
      root.render(providers(
        <ComplianceForm item={null} onClose={() => {}} onSaved={() => {}} />,
      ));
    });
    await fillComplianceBasics();
    const first = document.querySelector<HTMLInputElement>('#compliance-first-due-date');
    expect(first?.getAttribute('data-date-field')).toBe('au');
    await act(async () => {
      if (first) setInput(first, '31/02/2026');
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(document.body.textContent).toContain(DATE_INVALID_MESSAGE);
    expect(insertContract).not.toHaveBeenCalled();
  });

  it('marks first due and last completed invalid with one inline alert each', async () => {
    await act(async () => {
      root.render(providers(
        <ComplianceForm item={null} onClose={() => {}} onSaved={() => {}} />,
      ));
    });
    await fillComplianceBasics();
    const first = document.querySelector<HTMLInputElement>('#compliance-first-due-date');
    await act(async () => {
      if (first) setInput(first, '21/10/20');
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(insertContract).not.toHaveBeenCalled();
    expect(document.getElementById('compliance-first-due-date-error')?.textContent).toBe(DATE_INVALID_MESSAGE);
    expect(first?.getAttribute('aria-invalid')).toBe('true');
    expect(first?.getAttribute('aria-describedby')).toBe('compliance-first-due-date-error');
    expect(alertsWith(DATE_INVALID_MESSAGE)).toHaveLength(1);
  });

  it('marks last completed invalid beside the field', async () => {
    await act(async () => {
      root.render(providers(
        <ComplianceForm item={null} onClose={() => {}} onSaved={() => {}} />,
      ));
    });
    await fillComplianceBasics();
    const first = document.querySelector<HTMLInputElement>('#compliance-first-due-date');
    const last = document.querySelector<HTMLInputElement>('#compliance-last-completed-date');
    await act(async () => {
      if (first) setInput(first, '21/10/2026');
      if (last) setInput(last, '31/02/2026');
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(insertContract).not.toHaveBeenCalled();
    expect(document.getElementById('compliance-last-completed-date-error')?.textContent).toBe(DATE_INVALID_MESSAGE);
    expect(last?.getAttribute('aria-invalid')).toBe('true');
    expect(last?.getAttribute('aria-describedby')).toBe('compliance-last-completed-date-error');
    expect(alertsWith(DATE_INVALID_MESSAGE)).toHaveLength(1);
  });

  it('shows one required alert for a blank first due date', async () => {
    await act(async () => {
      root.render(providers(
        <ComplianceForm item={null} onClose={() => {}} onSaved={() => {}} />,
      ));
    });
    await fillComplianceBasics();
    const first = document.querySelector<HTMLInputElement>('#compliance-first-due-date');
    await act(async () => {
      if (first) setInput(first, '');
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(document.getElementById('compliance-first-due-date-error')?.textContent).toBe(DATE_REQUIRED_MESSAGE);
    expect(alertsWith(DATE_REQUIRED_MESSAGE)).toHaveLength(1);
    expect(alertsWith(DATE_INVALID_MESSAGE)).toHaveLength(0);
    expect(first?.getAttribute('aria-invalid')).toBe('true');
    expect(first?.getAttribute('aria-describedby')).toBe('compliance-first-due-date-error');
    await act(async () => {
      if (first) setInput(first, '21/10/20');
    });
    expect(document.getElementById('compliance-first-due-date-error')?.textContent).toBe(DATE_REQUIRED_MESSAGE);
    expect(alertsWith(DATE_REQUIRED_MESSAGE)).toHaveLength(1);
    expect(alertsWith(DATE_INVALID_MESSAGE)).toHaveLength(0);
  });

  it('links a year-range last completed date with one alert', async () => {
    await act(async () => {
      root.render(providers(
        <ComplianceForm item={null} onClose={() => {}} onSaved={() => {}} />,
      ));
    });
    await fillComplianceBasics();
    const first = document.querySelector<HTMLInputElement>('#compliance-first-due-date');
    const last = document.querySelector<HTMLInputElement>('#compliance-last-completed-date');
    await act(async () => {
      if (first) setInput(first, '21/10/2026');
      if (last) setInput(last, '21/10/2101');
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(insertContract).not.toHaveBeenCalled();
    expect(last?.getAttribute('aria-invalid')).toBe('true');
    expect(last?.getAttribute('aria-describedby')).toBe('compliance-last-completed-date-error');
    expect(document.getElementById('compliance-last-completed-date-error')?.textContent).toBe(DATE_YEAR_RANGE_MESSAGE);
    expect(alertsWith(DATE_YEAR_RANGE_MESSAGE)).toHaveLength(1);
  });

  it('blocks an invalid last completed date', async () => {
    await act(async () => {
      root.render(providers(
        <ComplianceForm item={null} onClose={() => {}} onSaved={() => {}} />,
      ));
    });
    await fillComplianceBasics();
    const last = document.querySelector<HTMLInputElement>('#compliance-last-completed-date');
    expect(last?.getAttribute('data-date-field')).toBe('au');
    await act(async () => {
      if (last) setInput(last, '31/02/2026');
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(document.body.textContent).toContain(DATE_INVALID_MESSAGE);
    expect(insertContract).not.toHaveBeenCalled();
  });
});
