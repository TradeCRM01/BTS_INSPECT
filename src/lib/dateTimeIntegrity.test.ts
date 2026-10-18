import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AU_DATE_PLACEHOLDER,
  DATE_REQUIRED_MESSAGE,
  END_BEFORE_START_MESSAGE,
  REVERSED_TIME_ENTRY_MESSAGE,
  TIME_ENTRY_OVERLAP_MESSAGE,
  formatAuDate,
  isoDateKey,
  jobClockOrderError,
  parseAuDate,
  scheduleSheetDateError,
  scheduleSheetDateSeed,
  scheduleSheetSaveError,
  timeEntryOrderError,
  timeEntryOverlapError,
  timeEntrySaveError,
} from './dateTimeIntegrity';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('schedule sheet blank date', () => {
  it('does not seed an unscheduled job from the viewed board day', () => {
    expect(scheduleSheetDateSeed({
      prefillDate: null,
      scheduledDate: null,
    })).toBe('');
    expect(scheduleSheetDateSeed({
      prefillDate: '',
      scheduledDate: '',
    })).toBe('');
  });

  it('keeps a spoken or already-booked day', () => {
    expect(scheduleSheetDateSeed({
      prefillDate: '2026-10-21',
      scheduledDate: null,
    })).toBe('2026-10-21');
    expect(scheduleSheetDateSeed({
      prefillDate: null,
      scheduledDate: '2026-10-22T00:00:00.000Z',
    })).toBe('2026-10-22');
  });

  it('blocks save when the date is blank', () => {
    expect(scheduleSheetDateError('')).toBe(DATE_REQUIRED_MESSAGE);
    expect(scheduleSheetDateError('   ')).toBe(DATE_REQUIRED_MESSAGE);
    expect(scheduleSheetSaveError({
      date: '',
      startTime: '',
      endTime: '',
    })).toBe(DATE_REQUIRED_MESSAGE);
  });

  it('does not invent today when the date is blank', () => {
    const payloadDate = scheduleSheetSaveError({
      date: '',
      startTime: '',
      endTime: '',
    });
    expect(payloadDate).toBe(DATE_REQUIRED_MESSAGE);
    expect(isoDateKey('')).toBeNull();
  });
});

describe('job clock order', () => {
  it('blocks end before start', () => {
    expect(jobClockOrderError('14:00', '09:00')).toBe(END_BEFORE_START_MESSAGE);
    expect(jobClockOrderError('14:00', '14:00')).toBe(END_BEFORE_START_MESSAGE);
    expect(scheduleSheetSaveError({
      date: '2026-10-21',
      startTime: '14:00',
      endTime: '09:00',
    })).toBe(END_BEFORE_START_MESSAGE);
  });

  it('allows a blank pair or a later end', () => {
    expect(jobClockOrderError('', '')).toBeNull();
    expect(jobClockOrderError('14:00', '')).toBeNull();
    expect(jobClockOrderError('09:00', '14:00')).toBeNull();
  });
});

describe('time entry order', () => {
  it('blocks a reversed start/end instead of wrapping to 22h', () => {
    expect(timeEntryOrderError('15:00', '13:00')).toBe(REVERSED_TIME_ENTRY_MESSAGE);
    expect(timeEntrySaveError({
      date: '2026-10-19',
      start: '15:00',
      end: '13:00',
    })).toBe(REVERSED_TIME_ENTRY_MESSAGE);
  });

  it('blocks equal clocks so a day is not billed as 24h', () => {
    expect(timeEntryOrderError('15:00', '15:00')).toBe(REVERSED_TIME_ENTRY_MESSAGE);
  });

  it('allows a same-day end after start', () => {
    expect(timeEntryOrderError('15:00', '17:00')).toBeNull();
  });
});

describe('time entry overlap', () => {
  const existing = [
    {
      id: 'a',
      start_time: '2026-10-19T15:00:00',
      end_time: '2026-10-19T17:00:00',
    },
  ];

  it('blocks an overlapping interval for the same person', () => {
    expect(timeEntryOverlapError({
      date: '2026-10-19',
      start: '16:00',
      end: '18:00',
      existing,
    })).toBe(TIME_ENTRY_OVERLAP_MESSAGE);
    expect(timeEntrySaveError({
      date: '2026-10-19',
      start: '16:00',
      end: '18:00',
      existing,
    })).toBe(TIME_ENTRY_OVERLAP_MESSAGE);
  });

  it('allows touching end-to-start and a different id edit', () => {
    expect(timeEntryOverlapError({
      date: '2026-10-19',
      start: '17:00',
      end: '18:00',
      existing,
    })).toBeNull();
    expect(timeEntryOverlapError({
      date: '2026-10-19',
      start: '15:00',
      end: '17:00',
      excludeId: 'a',
      existing,
    })).toBeNull();
  });
});

describe('AU date format and parse', () => {
  it('formats and parses dd/mm/yyyy without using the runtime locale', () => {
    expect(formatAuDate('2026-10-23')).toBe('23/10/2026');
    expect(parseAuDate('23/10/2026')).toBe('2026-10-23');
    expect(parseAuDate('2026-10-23')).toBe('2026-10-23');
    expect(AU_DATE_PLACEHOLDER).toBe('dd/mm/yyyy');
  });

  it('stays day-first when the runtime locale is en-US', () => {
    const prevLang = process.env.LANG;
    const prevLc = process.env.LC_ALL;
    process.env.LANG = 'en_US.UTF-8';
    process.env.LC_ALL = 'en_US.UTF-8';
    try {
      expect(new Intl.DateTimeFormat('en-US').resolvedOptions().locale.toLowerCase()).toContain('en');
      expect(formatAuDate('2026-10-23')).toBe('23/10/2026');
      expect(parseAuDate('23/10/2026')).toBe('2026-10-23');
      expect(parseAuDate('10/23/2026')).toBeNull();
      expect(formatAuDate('2026-05-06')).toBe('06/05/2026');
      expect(parseAuDate('06/05/2026')).toBe('2026-05-06');
    } finally {
      if (prevLang == null) delete process.env.LANG;
      else process.env.LANG = prevLang;
      if (prevLc == null) delete process.env.LC_ALL;
      else process.env.LC_ALL = prevLc;
    }
  });

  it('rejects a real US-looking date that is not a calendar day in AU order', () => {
    expect(parseAuDate('31/02/2026')).toBeNull();
    expect(isoDateKey('2026-02-31')).toBeNull();
  });
});

describe('date/time integrity surfaces', () => {
  it('uses the shared AU date field on new job, stage, time entry, reminder, and the schedule sheet', () => {
    const jobForm = src('src/components/crm/JobFormModal.tsx');
    const sheet = src('src/components/crm/ScheduleJobSheet.tsx');
    const time = src('src/components/timesheets/TimeEntryForm.tsx');
    const reminder = src('src/pages/ReminderEditPage.tsx');
    for (const file of [jobForm, sheet, time, reminder]) {
      expect(file).toContain('DateFieldInput');
      expect(file).toContain('dateTimeIntegrity');
    }
    expect(jobForm).toContain('jobClockOrderError');
    expect(sheet).toContain('scheduleSheetSaveError');
    expect(sheet).toContain('scheduleSheetDateSeed');
    expect(time).toContain('timeEntrySaveError');
    expect(time).not.toContain('86400000');
  });
});
