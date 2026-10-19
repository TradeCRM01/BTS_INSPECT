/**
 * @vitest-environment jsdom
 */
import { act, useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScheduleJobSheet } from '../components/crm/ScheduleJobSheet';
import { JobFormModal } from '../components/crm/JobFormModal';
import { TimeEntryForm } from '../components/timesheets/TimeEntryForm';
import { DateFieldInput } from '../components/ui/DateFieldInput';
import { ToastProvider } from '../components/ui/Toast';
import { ReminderEditSheet } from '../pages/ReminderEditPage';
import {
  DATE_INVALID_MESSAGE,
  DATE_REQUIRED_MESSAGE,
  END_BEFORE_START_MESSAGE,
  REVERSED_TIME_ENTRY_MESSAGE,
  TIME_ENTRY_OVERLAP_MESSAGE,
  TIME_NEEDS_DATE_MESSAGE,
} from './dateTimeIntegrity';
import type { TimeFieldHintKind } from './timeFieldInput';
import { saveReminder } from './reminders';

const insertEntry = vi.fn();
const updateJob = vi.fn();

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
          is: () => ({
            neq: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          }),
        }),
      }),
      insert: (row: unknown) => {
        if (table === 'timesheet_entries') {
          insertEntry(row);
          return Promise.resolve({ error: null });
        }
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: 'ts-1' }, error: null }),
          }),
        };
      },
      update: (row: unknown) => {
        updateJob(row);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
    rpc: () => Promise.resolve({ data: [], error: null }),
  },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { id: 'emp-1', company_id: 'co-1' },
    company: { name: 'Grafter' },
  }),
}));

vi.mock('./devFieldAuditAuth', () => ({
  isDevFieldAuditAuth: () => false,
  pageQueryBlocked: () => false,
}));

vi.mock('./reminders', async importOriginal => {
  const actual = await importOriginal<typeof import('./reminders')>();
  return {
    ...actual,
    saveReminder: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../components/ui/ManagedSelect', () => ({
  ManagedSelect: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <input data-testid="work-type" value={value} onChange={e => onChange(e.target.value)} />
  ),
}));

let mockTimeFieldSlot = 0;
vi.mock('../components/ui', async importOriginal => {
  const actual = await importOriginal<typeof import('../components/ui')>();
  const MockTimeFieldInput = ({
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
    const slot = mockTimeFieldSlot++;
    useEffect(() => {
      onTimeFieldHintChange?.('none');
    }, [onTimeFieldHintChange]);
    let latest = value;
    return (
      <input
        type="time"
        data-testid={slot % 2 === 0 ? 'time-start' : 'time-end'}
        value={value}
        onChange={e => {
          latest = e.target.value;
          onChange(e.target.value);
        }}
        onBlur={() => onBlurCommit?.(latest)}
      />
    );
  };
  return { ...actual, TimeFieldInput: MockTimeFieldInput };
});

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
    const slot = mockTimeFieldSlot++;
    useEffect(() => {
      onTimeFieldHintChange?.('none');
    }, [onTimeFieldHintChange]);
    let latest = value;
    return (
      <input
        type="time"
        data-testid={slot % 2 === 0 ? 'time-start' : 'time-end'}
        value={value}
        onChange={e => {
          latest = e.target.value;
          onChange(e.target.value);
        }}
        onBlur={() => onBlurCommit?.(latest)}
      />
    );
  },
}));

const auditJob = {
  id: 'job-1',
  company_id: 'co',
  client_id: 'cl',
  title: 'Hot water',
  description: null,
  status: 'scheduled' as const,
  priority: 'medium' as const,
  scheduled_date: '2026-08-25',
  start_time: '07:30:00',
  end_time: '16:00:00',
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
  client_name: 'Client',
  client_address: null,
};

const unscheduledJob = {
  ...auditJob,
  id: 'job-open',
  scheduled_date: null,
  start_time: null,
  end_time: null,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mockTimeFieldSlot = 0;
  insertEntry.mockReset();
  updateJob.mockReset();
  vi.mocked(saveReminder).mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
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

function typeDate(value: string) {
  const input = document.querySelector<HTMLInputElement>('[data-date-field="au"]');
  if (!input) throw new Error('missing date field');
  act(() => {
    input.focus();
    setInput(input, value);
  });
}

describe('DateFieldInput', () => {
  it('propagates compact, two-digit and dashed dates and flags invalid text', async () => {
    const onChange = vi.fn();
    const onValidityChange = vi.fn();
    await act(async () => {
      root.render(
        <DateFieldInput value="2026-10-21" onChange={onChange} onValidityChange={onValidityChange} />,
      );
    });
    const input = document.querySelector<HTMLInputElement>('[data-date-field="au"]')!;
    expect(input.value).toBe('21/10/2026');

    await act(async () => {
      setInput(input, '23102026');
    });
    expect(onChange).toHaveBeenCalledWith('2026-10-23');
    expect(onValidityChange).toHaveBeenCalledWith(false);

    onChange.mockClear();
    await act(async () => {
      setInput(input, '1/1/26');
    });
    expect(onChange).not.toHaveBeenCalledWith('2026-01-01');
    expect(onValidityChange).toHaveBeenCalledWith(true);
    await act(async () => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith('2026-01-01');

    onChange.mockClear();
    onValidityChange.mockClear();
    await act(async () => {
      setInput(input, '31/02/2026');
    });
    expect(onChange).not.toHaveBeenCalledWith('');
    expect(onValidityChange).toHaveBeenCalledWith(true);
    expect(input.value).toBe('31/02/2026');
    await act(async () => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(onChange).not.toHaveBeenCalledWith('');
    expect(onValidityChange).toHaveBeenCalledWith(true);
    expect(input.value).toBe('31/02/2026');

    onChange.mockClear();
    onValidityChange.mockClear();
    await act(async () => {
      setInput(input, '21/10/27');
    });
    expect(onChange).not.toHaveBeenCalledWith('2027-10-21');
    await act(async () => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith('2027-10-21');
    expect(onValidityChange).toHaveBeenCalledWith(false);
  });
});

describe('ScheduleJobSheet save', () => {
  it('does not call onSave when the date is blank', async () => {
    const onSave = vi.fn();
    await act(async () => {
      root.render(
        <ScheduleJobSheet
          job={unscheduledJob}
          teamMembers={[]}
          onClose={() => {}}
          onSave={onSave}
        />,
      );
    });
    expect(document.querySelector<HTMLInputElement>('[data-date-field="au"]')?.value).toBe('');
    await act(async () => {
      document.querySelector<HTMLButtonElement>('.hub-editor-sticky-save')?.click();
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(DATE_REQUIRED_MESSAGE);
  });

  it('does not re-seed the viewed board day on an unscheduled job', async () => {
    const onSave = vi.fn();
    await act(async () => {
      root.render(
        <ScheduleJobSheet
          job={unscheduledJob}
          teamMembers={[]}
          onClose={() => {}}
          onSave={onSave}
        />,
      );
    });
    expect(document.querySelector<HTMLInputElement>('[data-date-field="au"]')?.value).toBe('');
  });

  it('blocks Save when the typed date is invalid', async () => {
    const onSave = vi.fn();
    await act(async () => {
      root.render(
        <ScheduleJobSheet
          job={auditJob}
          teamMembers={[]}
          onClose={() => {}}
          onSave={onSave}
        />,
      );
    });
    const input = document.querySelector<HTMLInputElement>('[data-date-field="au"]')!;
    await act(async () => {
      setInput(input, '31/02/2026');
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('.hub-editor-sticky-save')?.click();
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(DATE_INVALID_MESSAGE);
  });
});

describe('JobFormModal save', () => {
  it('does not create a job when end is before start', async () => {
    const onSaved = vi.fn();
    await act(async () => {
      root.render(providers(
        <JobFormModal
          job={null}
          presetDate="2026-10-21"
          presetClientId={null}
          presetStartTime="14:00"
          onClose={() => {}}
          onSaved={onSaved}
        />,
      ));
    });
    const title = document.querySelector<HTMLInputElement>('input[placeholder="e.g. Annual safety inspection"]')
      ?? document.querySelector<HTMLInputElement>('input.form-input');
    await act(async () => {
      if (title) setInput(title, 'Mixer');
    });
    const end = document.querySelector<HTMLInputElement>('[data-testid="time-end"]');
    await act(async () => {
      if (end) setInput(end, '09:00');
    });
    await act(async () => {
      const buttons = [...document.querySelectorAll('button')];
      buttons.find(b => b.textContent?.includes('Create Job'))?.click();
    });
    expect(onSaved).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(END_BEFORE_START_MESSAGE);
  });

  it('does not create a job when the typed date is invalid', async () => {
    const onSaved = vi.fn();
    await act(async () => {
      root.render(providers(
        <JobFormModal
          job={null}
          presetDate="2026-10-21"
          presetClientId={null}
          onClose={() => {}}
          onSaved={onSaved}
        />,
      ));
    });
    const title = document.querySelector<HTMLInputElement>('input[placeholder="e.g. Annual safety inspection"]')
      ?? document.querySelector<HTMLInputElement>('input.form-input');
    await act(async () => {
      if (title) setInput(title, 'Mixer');
    });
    typeDate('31/02/2026');
    await act(async () => {
      const buttons = [...document.querySelectorAll('button')];
      buttons.find(b => b.textContent?.includes('Create Job'))?.click();
    });
    expect(onSaved).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(DATE_INVALID_MESSAGE);
  });
});

describe('TimeEntryForm save', () => {
  const jobs = [{ id: 'job-a', title: 'A', job_number: 1 }];
  const timesheets = [{
    id: 'ts-1',
    company_id: 'co',
    employee_id: 'emp-1',
    date: '2026-10-19',
    status: 'open' as const,
    break_minutes: 0,
    total_minutes: 0,
    clock_in: null,
    clock_out: null,
    notes: null,
    created_at: '',
    updated_at: '',
  }];

  it('does not insert a reversed 15:00-13:00 entry', async () => {
    const onSaved = vi.fn();
    const loadSiblings = vi.fn().mockResolvedValue([]);
    await act(async () => {
      root.render(providers(
        <TimeEntryForm
          timesheets={timesheets}
          jobs={jobs}
          employeeId="emp-1"
          presetDate="2026-10-19"
          presetStartTime="15:00"
          presetEndTime="13:00"
          loadSiblings={loadSiblings}
          onClose={() => {}}
          onSaved={onSaved}
        />,
      ));
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(onSaved).not.toHaveBeenCalled();
    expect(insertEntry).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(REVERSED_TIME_ENTRY_MESSAGE);
  });

  it('does not insert when the date is blank', async () => {
    const onSaved = vi.fn();
    await act(async () => {
      root.render(providers(
        <TimeEntryForm
          timesheets={timesheets}
          jobs={jobs}
          employeeId="emp-1"
          presetDate="2026-10-19"
          presetStartTime="09:00"
          presetEndTime="10:00"
          loadSiblings={async () => []}
          onClose={() => {}}
          onSaved={onSaved}
        />,
      ));
    });
    const date = document.querySelector<HTMLInputElement>('[data-date-field="au"]')!;
    await act(async () => {
      setInput(date, '');
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(insertEntry).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(DATE_REQUIRED_MESSAGE);
  });

  it('does not insert when the typed date is invalid', async () => {
    const onSaved = vi.fn();
    await act(async () => {
      root.render(providers(
        <TimeEntryForm
          timesheets={timesheets}
          jobs={jobs}
          employeeId="emp-1"
          presetDate="2026-10-19"
          presetStartTime="09:00"
          presetEndTime="10:00"
          loadSiblings={async () => []}
          onClose={() => {}}
          onSaved={onSaved}
        />,
      ));
    });
    typeDate('31/02/2026');
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(insertEntry).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(DATE_INVALID_MESSAGE);
  });

  it('blocks overlap from another job for the same person', async () => {
    const onSaved = vi.fn();
    const loadSiblings = vi.fn().mockResolvedValue([
      { id: 'other-job', start_time: '2026-10-19T09:00:00', end_time: '2026-10-19T12:00:00' },
    ]);
    await act(async () => {
      root.render(providers(
        <TimeEntryForm
          timesheets={timesheets}
          jobs={jobs}
          employeeId="emp-1"
          presetDate="2026-10-19"
          presetStartTime="10:00"
          presetEndTime="11:00"
          loadSiblings={loadSiblings}
          onClose={() => {}}
          onSaved={onSaved}
        />,
      ));
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(loadSiblings).toHaveBeenCalledWith({
      employeeId: 'emp-1',
      date: '2026-10-19',
      endsNextDay: false,
    });
    expect(insertEntry).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(TIME_ENTRY_OVERLAP_MESSAGE);
  });

  it('writes overnight 23:00-01:00 on the next day when Ends next day is ticked', async () => {
    const onSaved = vi.fn();
    await act(async () => {
      root.render(providers(
        <TimeEntryForm
          timesheets={timesheets}
          jobs={jobs}
          employeeId="emp-1"
          presetDate="2026-10-19"
          presetStartTime="23:00"
          presetEndTime="01:00"
          loadSiblings={async () => []}
          onClose={() => {}}
          onSaved={onSaved}
        />,
      ));
    });
    const box = [...document.querySelectorAll('input[type="checkbox"]')]
      .find(el => el.parentElement?.textContent?.includes('Ends next day')) as HTMLInputElement;
    await act(async () => {
      box.click();
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(insertEntry).toHaveBeenCalled();
    const row = insertEntry.mock.calls[0][0] as { start_time: string; end_time: string };
    const span = new Date(row.end_time).getTime() - new Date(row.start_time).getTime();
    expect(span).toBe(2 * 60 * 60 * 1000);
  });

  it('ticks Ends next day when an 8h chip crosses midnight', async () => {
    await act(async () => {
      root.render(providers(
        <TimeEntryForm
          timesheets={timesheets}
          jobs={jobs}
          employeeId="emp-1"
          presetDate="2026-10-19"
          presetStartTime="20:00"
          blankTimesOnOpen
          loadSiblings={async () => []}
          onClose={() => {}}
          onSaved={() => {}}
        />,
      ));
    });
    const start = document.querySelector<HTMLInputElement>('[data-testid="time-start"]')!;
    await act(async () => {
      setInput(start, '20:00');
    });
    await act(async () => {
      [...document.querySelectorAll('button')].find(b => b.textContent === '8h')?.click();
    });
    const box = [...document.querySelectorAll('input[type="checkbox"]')]
      .find(el => el.parentElement?.textContent?.includes('Ends next day')) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(box.parentElement?.textContent).toContain('(+1)');
  });
});

describe('ReminderEditSheet save', () => {
  const reminder = {
    id: 'rem-1',
    ownerId: 'emp-1',
    title: 'Call Alex',
    details: '',
    dueAt: null,
    jobId: null,
    relatedHref: null,
    completed: false,
    completedAt: null,
    visibility: 'private' as const,
    taggedUserIds: [],
    createdAt: '2026-10-01T00:00:00Z',
  };

  it('blocks a time without a date', async () => {
    await act(async () => {
      root.render(providers(
        <ReminderEditSheet reminder={reminder} jobs={[]} crew={[]} userId="emp-1" />,
      ));
    });
    const time = document.querySelector<HTMLInputElement>('#reminder-time')!;
    await act(async () => {
      setInput(time, '07:30');
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('.reminder-save')?.click();
    });
    expect(saveReminder).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(TIME_NEEDS_DATE_MESSAGE);
  });

  it('saves 23102026 as 23 October', async () => {
    await act(async () => {
      root.render(providers(
        <ReminderEditSheet reminder={reminder} jobs={[]} crew={[]} userId="emp-1" />,
      ));
    });
    typeDate('23102026');
    const time = document.querySelector<HTMLInputElement>('#reminder-time')!;
    await act(async () => {
      setInput(time, '07:30');
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('.reminder-save')?.click();
    });
    expect(saveReminder).toHaveBeenCalled();
    const payload = vi.mocked(saveReminder).mock.calls[0][1] as { dueAt: string | null };
    expect(payload.dueAt).toBeTruthy();
    expect(new Date(payload.dueAt as string).getDate()).toBe(23);
  });

  it('blocks an invalid reminder date', async () => {
    await act(async () => {
      root.render(providers(
        <ReminderEditSheet reminder={reminder} jobs={[]} crew={[]} userId="emp-1" />,
      ));
    });
    typeDate('31/02/2026');
    await act(async () => {
      document.querySelector<HTMLButtonElement>('.reminder-save')?.click();
    });
    expect(saveReminder).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(DATE_INVALID_MESSAGE);
  });
});
