import { describe, expect, it } from 'vitest';
import {
  buildJobClockOnEntry,
  buildJobTimeEntry,
  buildOpenTimesheetInsert,
  entryMinutes,
  findRunningJobEntry,
  localDateIso,
} from './timesheetJob';

describe('findRunningJobEntry', () => {
  const entries = [
    { id: '1', job_id: 'job-a', end_time: '2026-08-20T02:00:00.000Z' },
    { id: '2', job_id: 'job-a', end_time: null },
    { id: '3', job_id: 'job-b', end_time: null },
  ];

  it('finds the open entry for this job', () => {
    expect(findRunningJobEntry(entries, 'job-a')?.id).toBe('2');
  });

  it('ignores running time on a different job', () => {
    expect(findRunningJobEntry(entries, 'job-c')).toBeUndefined();
  });
});

describe('entryMinutes', () => {
  it('rounds a closed interval to minutes', () => {
    expect(entryMinutes('2026-08-20T08:00:00.000Z', '2026-08-20T09:30:00.000Z')).toBe(90);
  });

  it('does not go negative', () => {
    expect(entryMinutes('2026-08-20T10:00:00.000Z', '2026-08-20T09:00:00.000Z')).toBe(0);
  });
});

describe('builders', () => {
  it('opens a day timesheet and optionally clocks in', () => {
    expect(buildOpenTimesheetInsert({
      companyId: 'co',
      employeeId: 'emp',
      date: '2026-08-20',
    })).toEqual({
      company_id: 'co',
      employee_id: 'emp',
      date: '2026-08-20',
      status: 'open',
    });
    expect(buildOpenTimesheetInsert({
      companyId: 'co',
      employeeId: 'emp',
      date: '2026-08-20',
      clockInIso: '2026-08-20T08:00:00.000Z',
    }).clock_in).toBe('2026-08-20T08:00:00.000Z');
  });

  it('pre-fills job_id on clock-on and add-entry payloads', () => {
    const start = new Date('2026-08-20T08:00:00.000Z');
    expect(buildJobClockOnEntry({
      timesheetId: 'ts',
      companyId: 'co',
      jobId: 'job-1',
      start,
    })).toMatchObject({
      timesheet_id: 'ts',
      job_id: 'job-1',
      start_time: start.toISOString(),
      end_time: null,
      billable: true,
    });
    expect(buildJobTimeEntry({
      timesheetId: 'ts',
      companyId: 'co',
      jobId: 'job-1',
      start,
      end: new Date('2026-08-20T17:00:00.000Z'),
      workType: 'Install',
    }).job_id).toBe('job-1');
  });

  it('formats a local calendar date', () => {
    expect(localDateIso(new Date(2026, 7, 20, 15, 4))).toBe('2026-08-20');
  });
});
