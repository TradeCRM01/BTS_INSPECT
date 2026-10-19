/**
 * @vitest-environment jsdom
 */
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JobDispatchPanel } from '../components/jobs/JobDispatchPanel';
import { ToastProvider } from '../components/ui/Toast';
import { DATE_INVALID_MESSAGE, END_BEFORE_START_MESSAGE } from './dateTimeIntegrity';
import type { TimeFieldHintKind } from './timeFieldInput';

vi.mock('../components/ui/TimeFieldInput', () => ({
  TimeFieldInput: ({
    onTimeFieldHintChange,
    onChange,
    onBlurCommit,
    value,
  }: {
    onTimeFieldHintChange?: (hint: TimeFieldHintKind) => void;
    onChange: (v: string) => void;
    onBlurCommit?: (v: string) => void;
    value: string;
  }) => {
    useEffect(() => {
      onTimeFieldHintChange?.('none');
    }, [onTimeFieldHintChange]);
    let latest = value;
    return (
      <span>
        <input
          type="text"
          data-testid="dispatch-time"
          value={value}
          onChange={e => {
            latest = e.target.value;
            onChange(e.target.value);
          }}
        />
        <button type="button" data-testid="dispatch-commit" onClick={() => onBlurCommit?.(latest)}>
          commit
        </button>
      </span>
    );
  },
}));

const updateJob = vi.fn();

vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({
      update: (row: unknown) => {
        updateJob(row);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
  },
}));

vi.mock('./devFieldAuditAuth', () => ({
  isDevFieldAuditAuth: () => false,
}));

const job = {
  id: 'job-1',
  company_id: 'co',
  client_id: 'cl',
  title: 'Hot water',
  description: null,
  status: 'scheduled' as const,
  priority: 'medium' as const,
  scheduled_date: '2026-08-25',
  start_time: '09:00:00',
  end_time: '10:00:00',
  address: '1 Test St',
  assigned_team: [] as string[],
  inspection_id: null,
  created_by: 'u',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  job_number: 1,
  color: null,
  budget: null,
  parent_job_id: null,
  cost_code: null,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  updateJob.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function setInput(el: HTMLInputElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  proto?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('JobDispatchPanel times', () => {
  it('blocks end before start without writing', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <ToastProvider>
            <MemoryRouter>
              <JobDispatchPanel job={job} teamMembers={[]} />
            </MemoryRouter>
          </ToastProvider>
        </QueryClientProvider>,
      );
    });
    const start = document.querySelectorAll<HTMLInputElement>('[data-testid="dispatch-time"]')[0];
    await act(async () => {
      setInput(start, '14:00');
    });
    await act(async () => {
      document.querySelectorAll<HTMLButtonElement>('[data-testid="dispatch-commit"]')[0].click();
    });
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(END_BEFORE_START_MESSAGE);
    expect(updateJob).not.toHaveBeenCalled();
  });

  it('keeps a later Start and writes both times once End is valid', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <ToastProvider>
            <MemoryRouter>
              <JobDispatchPanel job={job} teamMembers={[]} />
            </MemoryRouter>
          </ToastProvider>
        </QueryClientProvider>,
      );
    });
    const start = document.querySelectorAll<HTMLInputElement>('[data-testid="dispatch-time"]')[0];
    const end = document.querySelectorAll<HTMLInputElement>('[data-testid="dispatch-time"]')[1];
    await act(async () => {
      setInput(start, '14:00');
    });
    await act(async () => {
      document.querySelectorAll<HTMLButtonElement>('[data-testid="dispatch-commit"]')[0].click();
    });
    expect(updateJob).not.toHaveBeenCalled();
    expect(start.value).toBe('14:00');
    await act(async () => {
      setInput(end, '16:00');
    });
    await act(async () => {
      document.querySelectorAll<HTMLButtonElement>('[data-testid="dispatch-commit"]')[1].click();
    });
    expect(updateJob).toHaveBeenCalledWith(expect.objectContaining({ start_time: '14:00', end_time: '16:00' }));
  });

  it('does not write scheduled_date while retyping one key at a time', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <ToastProvider>
            <MemoryRouter>
              <JobDispatchPanel job={job} teamMembers={[]} />
            </MemoryRouter>
          </ToastProvider>
        </QueryClientProvider>,
      );
    });
    const input = document.querySelector<HTMLInputElement>('#job-dispatch-date')!;
    expect(input.getAttribute('data-date-field')).toBe('au');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    const text = '21/10/2026';
    await act(async () => {
      setter.call(input, text[0]);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    for (const c of text.slice(1)) {
      await act(async () => {
        setter.call(input, input.value + c);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    expect(input.value).toBe('21/10/2026');
    expect(updateJob).not.toHaveBeenCalled();
    await act(async () => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(updateJob).toHaveBeenCalledWith(expect.objectContaining({ scheduled_date: '2026-10-21' }));
    expect(updateJob.mock.calls.some(call => JSON.stringify(call[0]).includes('2020-10-01'))).toBe(false);
  });

  it('does not save an invalid Job page date', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <ToastProvider>
            <MemoryRouter>
              <JobDispatchPanel job={job} teamMembers={[]} />
            </MemoryRouter>
          </ToastProvider>
        </QueryClientProvider>,
      );
    });
    const input = document.querySelector<HTMLInputElement>('#job-dispatch-date')!;
    expect(input.getAttribute('data-date-field')).toBe('au');
    await act(async () => {
      setInput(input, '31/02/2026');
    });
    await act(async () => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(updateJob).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(DATE_INVALID_MESSAGE);
  });
});
