import { describe, expect, it } from 'vitest';
import {
  TIMESHEET_CLOCK_OFF_STATUS,
  TIMESHEET_COMPANY_TZ,
  buildJobClockOffEntry,
  buildJobClockOnEntry,
  buildJobTimeEntry,
  buildOpenTimesheetInsert,
  buildTimesheetClockOffUpdate,
  buildTimesheetClockOnUpdate,
  entryMinutes,
  findRunningJobEntry,
  localDateIso,
  planTimesheetClockOff,
  timesheetWorkedMinutes,
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

  it('treats missing or equal timestamps as 0', () => {
    expect(entryMinutes(null, '2026-08-20T09:00:00.000Z')).toBe(0);
    expect(entryMinutes('2026-08-20T09:00:00.000Z', undefined)).toBe(0);
    expect(entryMinutes('2026-08-20T09:00:00.000Z', '2026-08-20T09:00:00.000Z')).toBe(0);
  });
});

describe('clock on then clock off', () => {
  const start = new Date('2026-09-02T00:00:00.000Z');
  const end = new Date('2026-09-02T01:15:00.000Z');

  it('yields non-zero hours for a real elapsed interval and is not OPEN', () => {
    const on = buildJobClockOnEntry({
      timesheetId: 'ts',
      companyId: 'co',
      jobId: 'job-1',
      start,
    });
    expect(on.end_time).toBeNull();
    const off = planTimesheetClockOff({
      clockIn: on.start_time,
      now: end,
      runningEntries: [{ id: 'entry-1', start_time: on.start_time }],
      priorTotalMinutes: 0,
    });
    expect(off.addedMinutes).toBe(75);
    expect(off.timesheetUpdate.total_minutes).toBe(75);
    expect(off.timesheetUpdate.clock_out).toBe(end.toISOString());
    expect(off.timesheetUpdate.status).toBe(TIMESHEET_CLOCK_OFF_STATUS);
    expect(off.timesheetUpdate.status).not.toBe('open');
    expect(off.entryUpdates).toEqual([{ id: 'entry-1', end_time: end.toISOString() }]);
    expect(buildJobClockOffEntry(end).end_time).toBe(end.toISOString());
  });

  it('is 0h 0m only when they clocked off immediately, and still not OPEN', () => {
    const off = planTimesheetClockOff({
      clockIn: start.toISOString(),
      now: start,
      runningEntries: [{ id: 'entry-1', start_time: start.toISOString() }],
      priorTotalMinutes: 0,
    });
    expect(off.addedMinutes).toBe(0);
    expect(off.timesheetUpdate.total_minutes).toBe(0);
    expect(off.timesheetUpdate.status).not.toBe('open');
    expect(buildTimesheetClockOffUpdate({
      clockOutIso: start.toISOString(),
      totalMinutes: 0,
    }).status).toBe('submitted');
  });

  it('reopens a clocked-off day without inventing a second clock-in', () => {
    expect(buildTimesheetClockOnUpdate({
      now: end,
      existingClockIn: start.toISOString(),
    })).toEqual({
      clock_in: start.toISOString(),
      clock_out: null,
      status: 'open',
    });
  });
});

describe('timesheetWorkedMinutes', () => {
  it('prefers a stamped total, then closed entries, then clock stamps', () => {
    expect(timesheetWorkedMinutes({
      totalMinutes: 90,
      clockIn: '2026-09-02T00:00:00.000Z',
      clockOut: '2026-09-02T00:10:00.000Z',
    })).toBe(90);
    expect(timesheetWorkedMinutes({
      totalMinutes: 0,
      entryMinutes: 45,
      clockIn: '2026-09-02T00:00:00.000Z',
      clockOut: '2026-09-02T00:10:00.000Z',
    })).toBe(45);
    expect(timesheetWorkedMinutes({
      totalMinutes: 0,
      clockIn: '2026-09-02T00:00:00.000Z',
      clockOut: '2026-09-02T00:10:00.000Z',
    })).toBe(10);
    expect(timesheetWorkedMinutes({
      totalMinutes: 0,
      clockIn: '2026-09-02T00:00:00.000Z',
      clockOut: null,
    })).toBe(0);
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

  it('dates the row on the Australia/Brisbane calendar, not leftover Perth or UTC', () => {
    expect(TIMESHEET_COMPANY_TZ).toBe('Australia/Brisbane');
    // 22:00 UTC 1 Sep = 08:00 2 Sep Brisbane. UTC date is still 1 Sep.
    expect(localDateIso(new Date('2026-09-01T22:00:00.000Z'))).toBe('2026-09-02');
    // 14:30 UTC 1 Sep = 00:30 2 Sep Brisbane, 22:30 1 Sep leftover Perth.
    expect(localDateIso(new Date('2026-09-01T14:30:00.000Z'))).toBe('2026-09-02');
    expect(localDateIso(new Date('2026-09-01T14:30:00.000Z'), 'Australia/Perth')).toBe('2026-09-01');
    expect(localDateIso(new Date('2026-09-01T14:30:00.000Z'), 'UTC')).toBe('2026-09-01');
  });
});
