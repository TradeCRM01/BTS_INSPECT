/**
 * @vitest-environment jsdom
 */
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScheduleJobSheet } from '../components/crm/ScheduleJobSheet';
import {
  applyTimeFieldsSaveBlock,
  timeFieldSaveFormError,
  timeFieldsSaveValidation,
  TIME_FIELD_ADD_AM_PM,
  TIME_FIELD_INCOMPLETE,
  type TimeFieldHintKind,
} from './timeFieldInput';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mockTimeFieldSlot = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('FIX-5c C6 shared save guard', () => {
  it('does not duplicate field hints at form level', () => {
    expect(timeFieldSaveFormError(TIME_FIELD_ADD_AM_PM)).toBeNull();
    expect(timeFieldSaveFormError(TIME_FIELD_INCOMPLETE)).toBeNull();
  });

  it('blocks start AM/PM without treating blank end as AM/PM', () => {
    const block = timeFieldsSaveValidation({
      start: '',
      end: '',
      startHint: 'ampm',
      endHint: 'none',
    });
    expect(block?.focus).toBe('start');
    let formErr = 'unset';
    applyTimeFieldsSaveBlock(block!, {
      setFormError: m => { formErr = m ?? 'null'; },
      focusStart: () => {},
      focusEnd: () => {},
    });
    expect(formErr).toBe('null');
  });

  it('blocks incomplete generic hint on start', () => {
    const block = timeFieldsSaveValidation({
      start: '',
      end: '16:00',
      startHint: 'incomplete',
      endHint: 'none',
    });
    expect(block?.message).toBe(TIME_FIELD_INCOMPLETE);
  });

  it('allows save when times are complete and no hint', () => {
    expect(timeFieldsSaveValidation({
      start: '09:30',
      end: '16:00',
      startHint: 'none',
      endHint: 'none',
    })).toBeNull();
  });
});

let mockTimeFieldSlot = 0;
let mockStartHint: TimeFieldHintKind = 'none';

vi.mock('../components/ui', async importOriginal => {
  const actual = await importOriginal<typeof import('../components/ui')>();
  const MockTimeFieldInput = ({
    onTimeFieldHintChange,
    onChange,
    value,
  }: {
    onTimeFieldHintChange?: (hint: TimeFieldHintKind) => void;
    onChange: (v: string) => void;
    value: string;
  }) => {
    const slot = mockTimeFieldSlot++;
    useEffect(() => {
      if (slot === 0) onTimeFieldHintChange?.(mockStartHint);
    }, [onTimeFieldHintChange, slot]);
    return (
      <input
        type="time"
        data-testid={slot === 0 ? 'time-start' : 'time-end'}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    );
  };
  return { ...actual, TimeFieldInput: MockTimeFieldInput };
});

const auditJob = {
  id: 'audit-job',
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

describe('FIX-5c C6 ScheduleJobSheet behaviour', () => {
  it('does not call onSave when start needs AM/PM', async () => {
    mockStartHint = 'ampm';
    const onSave = vi.fn();
    await act(async () => {
      root.render(
        <ScheduleJobSheet
          job={auditJob}
          teamMembers={[{ id: '1', name: 'Sam' }]}
          viewedDate="2026-08-25"
          prefill={{ startTime: '07:30' }}
          onClose={() => {}}
          onSave={onSave}
        />,
      );
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('.hub-editor-sticky-save')?.click();
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(document.querySelector('.hub-schedule-job-sheet-body > p.text-fail')).toBeNull();
  });

  it('does not call onSave when start has generic incomplete hint', async () => {
    mockStartHint = 'incomplete';
    const onSave = vi.fn();
    await act(async () => {
      root.render(
        <ScheduleJobSheet
          job={auditJob}
          teamMembers={[{ id: '1', name: 'Sam' }]}
          viewedDate="2026-08-25"
          prefill={{ startTime: '07:30' }}
          onClose={() => {}}
          onSave={onSave}
        />,
      );
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('.hub-editor-sticky-save')?.click();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('calls onSave with 09:30 when times are complete', async () => {
    mockStartHint = 'none';
    const onSave = vi.fn();
    await act(async () => {
      root.render(
        <ScheduleJobSheet
          job={auditJob}
          teamMembers={[{ id: '1', name: 'Sam' }]}
          viewedDate="2026-08-25"
          prefill={{ startTime: '09:30', endTime: '16:00' }}
          onClose={() => {}}
          onSave={onSave}
        />,
      );
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('.hub-editor-sticky-save')?.click();
    });
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      startTime: '09:30',
      endTime: '16:00',
    }));
  });
});
