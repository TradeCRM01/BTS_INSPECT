/**
 * @vitest-environment jsdom
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../ui';
import { JobDispatchPanel } from './JobDispatchPanel';
import type { Job } from '../../types/crm';
import type { SaveJobDispatchInput } from '../../lib/saveJobDispatch';

const harness = vi.hoisted(() => ({
  calls: [] as SaveJobDispatchInput[],
  attemptedKeys: [] as Array<string | undefined>,
  failNext: false,
}));

vi.mock('../../lib/supabase', () => {
  function builder() {
    const query = {
      select() { return query; },
      eq() { return query; },
      neq() { return query; },
      in() { return query; },
      then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
      },
    };
    return query;
  }
  return { supabase: { from: () => builder() } };
});

vi.mock('../../lib/persistLivingJobJha', () => ({
  persistLivingJobOnBoundJhas: vi.fn(async () => undefined),
}));

vi.mock('../../lib/loadDispatchSnapshot', async () => {
  const actual = await vi.importActual<typeof import('../../lib/loadDispatchSnapshot')>('../../lib/loadDispatchSnapshot');
  return {
    ...actual,
    loadDispatchPack: vi.fn(async () => ({
      skills: [{ id: 'licence', name: 'Licence' }],
      qualifications: [],
      resources: [],
      skillReqs: [{ jobId: 'job-a', skillId: 'licence', minHolders: 2 }],
      resourceReqs: [],
      allocations: [],
      missing: false,
    })),
  };
});

vi.mock('../../lib/saveJobDispatch', async () => {
  const actual = await vi.importActual<typeof import('../../lib/saveJobDispatch')>('../../lib/saveJobDispatch');
  return {
    ...actual,
    saveJobDispatch: vi.fn(async (input: SaveJobDispatchInput) => {
      harness.attemptedKeys.push(input.idempotencyKey);
      if (harness.failNext) {
        harness.failNext = false;
        throw new Error('response lost');
      }
      harness.calls.push(input);
      return {
        ok: true,
        updatedAt: '2026-10-05T01:00:00.000Z',
        dispatchVersion: 2,
        eventId: 'event-1',
        overridden: false,
        replayed: false,
      };
    }),
  };
});

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;

function job(over: Partial<Job> & Pick<Job, 'id'>): Job {
  return {
    company_id: 'co',
    client_id: null,
    title: 'Switchboard',
    description: null,
    status: 'scheduled',
    priority: 'medium',
    scheduled_date: '2026-10-04',
    start_time: '08:00:00',
    end_time: '09:00:00',
    address: null,
    assigned_team: ['jack'],
    inspection_id: null,
    created_by: 'jack',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-04T00:00:00.000Z',
    job_number: 10,
    color: null,
    budget: null,
    dispatch_ready: false,
    required_crew_count: 0,
    ...over,
  };
}

function clock(kind: 'start' | 'end'): string {
  const inputs = container.querySelectorAll<HTMLInputElement>('input[type="time"]');
  return (kind === 'start' ? inputs[0] : inputs[1])?.value ?? '';
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.calls = [];
  harness.attemptedKeys = [];
  harness.failNext = false;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function tree(node: ReactNode) {
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>{node}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

async function show(next: Job) {
  await act(async () => {
    root.render(tree(
      <JobDispatchPanel job={next} teamMembers={[{ id: 'jack', name: 'Jack' }, { id: 'm6', name: 'M6' }]} role="admin" />,
    ));
  });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 30));
  });
}

describe('job dispatch panel lifecycle', () => {
  it('adopts an external booking when the user has not edited', async () => {
    await show(job({ id: 'job-a', start_time: '08:00:00', end_time: '09:00:00' }));
    expect(clock('start')).toBe('08:00');
    expect(clock('end')).toBe('09:00');
    await show(job({
      id: 'job-a',
      start_time: '10:00:00',
      end_time: '11:00:00',
      updated_at: '2026-10-04T02:00:00.000Z',
    }));
    expect(clock('start')).toBe('10:00');
    expect(clock('end')).toBe('11:00');
    expect(container.querySelector('[data-testid="dispatch-booking-conflict"]')).toBeNull();
    const save = [...container.querySelectorAll('button')].find(button => button.textContent === 'Save booking');
    expect(save?.hasAttribute('disabled')).toBe(true);
  });

  it('keeps a real edit and resets when the job id changes', async () => {
    await show(job({ id: 'job-a', start_time: '08:00:00', end_time: '09:00:00' }));
    const end = container.querySelectorAll<HTMLInputElement>('input[type="time"]')[1];
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(end, '09:30');
      end.dispatchEvent(new Event('input', { bubbles: true }));
      end.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(clock('end')).toBe('09:30');
    await show(job({
      id: 'job-a',
      start_time: '10:00:00',
      end_time: '11:00:00',
      updated_at: '2026-10-04T02:00:00.000Z',
    }));
    expect(clock('end')).toBe('09:30');
    expect(container.querySelector('[data-testid="dispatch-booking-conflict"]')?.textContent).toMatch(/unsaved booking/);
    await show(job({
      id: 'job-b',
      start_time: '14:00:00',
      end_time: '15:00:00',
      updated_at: '2026-10-04T03:00:00.000Z',
    }));
    expect(clock('start')).toBe('14:00');
    expect(clock('end')).toBe('15:00');
    expect(container.querySelector('[data-testid="dispatch-booking-conflict"]')).toBeNull();
  });

  it('reuses a key only while the save is unresolved', async () => {
    await show(job({ id: 'job-a', dispatch_ready: false }));
    const ready = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(ready).toBeTruthy();
    harness.failNext = true;
    await act(async () => {
      ready!.click();
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 30));
    });
    expect(harness.calls).toHaveLength(0);
    expect(harness.attemptedKeys).toHaveLength(1);
    await act(async () => {
      ready!.click();
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 30));
    });
    expect(harness.calls).toHaveLength(1);
    expect(harness.attemptedKeys[1]).toBe(harness.attemptedKeys[0]);
    const firstKey = harness.calls[0].idempotencyKey;
    await show(job({
      id: 'job-a',
      dispatch_ready: true,
      updated_at: '2026-10-04T02:00:00.000Z',
    }));
    await show(job({
      id: 'job-a',
      dispatch_ready: false,
      updated_at: '2026-10-04T03:00:00.000Z',
    }));
    const readyAgain = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    await act(async () => {
      readyAgain!.click();
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 30));
    });
    expect(harness.calls).toHaveLength(2);
    expect(harness.calls[1].idempotencyKey).toBeTruthy();
    expect(harness.calls[1].idempotencyKey).not.toBe(firstKey);
    expect(harness.calls[1].dispatchReady).toBe(true);
    expect(harness.calls[1].snapshot.job.start_time).toBe('08:00:00');
  });
});
