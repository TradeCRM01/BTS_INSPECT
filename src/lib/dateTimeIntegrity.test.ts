import { describe, expect, it } from 'vitest';
import {
  AU_DATE_PLACEHOLDER,
  DATE_INVALID_MESSAGE,
  DATE_RANGE_ORDER_MESSAGE,
  DATE_REQUIRED_MESSAGE,
  DATE_YEAR_MAX,
  DATE_YEAR_MIN,
  dateFieldYearError,
  ENDS_NEXT_DAY_HINT,
  ENDS_NEXT_DAY_UNCHECK_MESSAGE,
  END_BEFORE_START_MESSAGE,
  REVERSED_TIME_ENTRY_MESSAGE,
  TIME_ENTRY_OVERLAP_MESSAGE,
  TIME_ENTRY_OVERNIGHT_CAP_MESSAGE,
  TIME_NEEDS_DATE_MESSAGE,
  addLocalDate,
  clockOffSaveError,
  clockOnSaveError,
  dateRangeOrderError,
  formatAuDate,
  isSupportedDateYear,
  formatClockFinishLabel,
  formatClockRangeLabel,
  isoDateKey,
  jobClockOrderError,
  overlapQueryDates,
  parseAuDate,
  reminderSaveError,
  scheduleSheetDateError,
  scheduleSheetDateSeed,
  scheduleSheetSaveError,
  timeEntryOrderError,
  timeEntryOverlapError,
  timeEntrySaveError,
} from './dateTimeIntegrity';

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

  it('blocks an invalid typed date', () => {
    expect(scheduleSheetSaveError({
      date: '',
      startTime: '',
      endTime: '',
      invalid: true,
    })).toBe(DATE_INVALID_MESSAGE);
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
    const msg = timeEntryOrderError('15:00', '13:00');
    expect(msg).toContain(REVERSED_TIME_ENTRY_MESSAGE);
    expect(msg).toContain(ENDS_NEXT_DAY_HINT);
    expect(timeEntrySaveError({
      date: '2026-10-19',
      start: '15:00',
      end: '13:00',
    })).toContain(REVERSED_TIME_ENTRY_MESSAGE);
  });

  it('blocks equal clocks so a day is not billed as 24h', () => {
    expect(timeEntryOrderError('15:00', '15:00')).toContain(REVERSED_TIME_ENTRY_MESSAGE);
  });

  it('allows a same-day end after start', () => {
    expect(timeEntryOrderError('15:00', '17:00')).toBeNull();
  });

  it('blocks overnight 23:00-01:00 until Ends next day is ticked', () => {
    expect(timeEntryOrderError('23:00', '01:00')).toContain(ENDS_NEXT_DAY_HINT);
    expect(timeEntryOrderError('23:00', '01:00', { endsNextDay: true })).toBeNull();
  });

  it('caps an overnight wrap at 16 hours', () => {
    expect(timeEntryOrderError('15:00', '13:00', { endsNextDay: true })).toBe(TIME_ENTRY_OVERNIGHT_CAP_MESSAGE);
  });

  it('rejects Ends next day when end is later the same day', () => {
    expect(timeEntryOrderError('15:00', '17:00', { endsNextDay: true })).toBe(ENDS_NEXT_DAY_UNCHECK_MESSAGE);
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
  });

  it('allows touching end-to-start', () => {
    expect(timeEntryOverlapError({
      date: '2026-10-19',
      start: '17:00',
      end: '18:00',
      existing,
    })).toBeNull();
  });

  it('counts a running clock-on as ongoing through now', () => {
    expect(timeEntryOverlapError({
      date: '2026-10-19',
      start: '09:00',
      end: '10:00',
      now: '2026-10-19T12:00:00',
      existing: [{ start_time: '2026-10-19T08:00:00', end_time: null }],
    })).toBe(TIME_ENTRY_OVERLAP_MESSAGE);
  });

  it('blocks overnight overlap with the next morning', () => {
    expect(timeEntryOverlapError({
      date: '2026-10-19',
      start: '23:00',
      end: '01:00',
      endsNextDay: true,
      existing: [{ start_time: '2026-10-20T00:30:00', end_time: '2026-10-20T02:00:00' }],
    })).toBe(TIME_ENTRY_OVERLAP_MESSAGE);
  });

  it('blocks clock-on while another entry is running', () => {
    expect(clockOnSaveError({
      now: '2026-10-19T09:00:00',
      existing: [{ start_time: '2026-10-19T08:00:00', end_time: null }],
    })).toBe(TIME_ENTRY_OVERLAP_MESSAGE);
  });

  it('blocks a zero-length clock-off', () => {
    expect(clockOffSaveError({
      startIso: '2026-10-19T07:45:00',
      endIso: '2026-10-19T07:45:00',
    })).toBe(END_BEFORE_START_MESSAGE);
  });

  it('treats a sub-minute clock-off as zero-length', () => {
    expect(clockOffSaveError({
      startIso: '2026-10-21T07:45:10+10:00',
      endIso: '2026-10-21T07:45:40+10:00',
    })).toBe(END_BEFORE_START_MESSAGE);
  });

  it('blocks clock-off that overlaps another closed entry', () => {
    expect(clockOffSaveError({
      startIso: '2026-10-21T08:00:00',
      endIso: '2026-10-21T10:00:00',
      existing: [{ start_time: '2026-10-21T09:00:00', end_time: '2026-10-21T11:00:00' }],
    })).toBe(TIME_ENTRY_OVERLAP_MESSAGE);
  });
});

describe('AU date format and parse', () => {
  it('formats and parses dd/mm/yyyy without using the runtime locale', () => {
    expect(formatAuDate('2026-10-23')).toBe('23/10/2026');
    expect(parseAuDate('23/10/2026')).toBe('2026-10-23');
    expect(parseAuDate('2026-10-23')).toBe('2026-10-23');
    expect(parseAuDate('10/23/2026')).toBeNull();
    expect(AU_DATE_PLACEHOLDER).toBe('dd/mm/yyyy');
  });

  it('accepts compact, dashed, dotted, spaced and two-digit years', () => {
    expect(parseAuDate('23102026')).toBe('2026-10-23');
    expect(parseAuDate('1/1/26')).toBe('2026-01-01');
    expect(parseAuDate('21/10/27')).toBe('2027-10-21');
    expect(parseAuDate('21-10-2026')).toBe('2026-10-21');
    expect(parseAuDate('21.10.2026')).toBe('2026-10-21');
    expect(parseAuDate('21 / 10 / 2026')).toBe('2026-10-21');
    expect(parseAuDate(' 21/10/2026 ')).toBe('2026-10-21');
  });

  it('rejects a real US-looking date that is not a calendar day in AU order', () => {
    expect(parseAuDate('31/02/2026')).toBeNull();
    expect(isoDateKey('2026-02-31')).toBeNull();
    expect(parseAuDate('29/02/2026')).toBeNull();
    expect(parseAuDate('29/02/2028')).toBe('2028-02-29');
    expect(parseAuDate('05/11/2026')).toBe('2026-11-05');
    expect(parseAuDate('5/11/2026')).toBe('2026-11-05');
    expect(parseAuDate('11/05/2026')).toBe('2026-05-11');
  });

  it('rejects trailing junk and years outside 1900-2100', () => {
    expect(parseAuDate('2026-10-21garbage')).toBeNull();
    expect(isoDateKey('2026-10-21garbage')).toBeNull();
    expect(parseAuDate('21/10/1026')).toBeNull();
    expect(parseAuDate('21/10/9999')).toBeNull();
    expect(parseAuDate('2101-01-01')).toBeNull();
    expect(dateFieldYearError('2101-01-01')).toBe(DATE_INVALID_MESSAGE);
    expect(dateFieldYearError('1900-01-01')).toBeNull();
    expect(dateFieldYearError('31/02/2026')).toBe(DATE_INVALID_MESSAGE);
    expect(dateFieldYearError('')).toBeNull();
    expect(dateFieldYearError('', true)).toBe(DATE_INVALID_MESSAGE);
    expect(parseAuDate('1899-12-31')).toBeNull();
    expect(parseAuDate('1900-01-01')).toBe('1900-01-01');
    expect(parseAuDate('2100-12-31')).toBe('2100-12-31');
  });
});

describe('reminder save', () => {
  it('needs a date when a time is set', () => {
    expect(reminderSaveError({ date: '', time: '07:30' })).toBe(TIME_NEEDS_DATE_MESSAGE);
    expect(reminderSaveError({ date: '', time: '07:30', invalid: true })).toBe(DATE_INVALID_MESSAGE);
    expect(reminderSaveError({ date: '2026-10-23', time: '07:30' })).toBeNull();
    expect(reminderSaveError({ date: '', time: '' })).toBeNull();
  });
});

describe('date range order', () => {
  it('blocks an end day before the start day', () => {
    expect(dateRangeOrderError('2026-10-21', '2026-10-20')).toBe(DATE_RANGE_ORDER_MESSAGE);
    expect(dateRangeOrderError('2026-10-21', '2026-10-21')).toBeNull();
    expect(dateRangeOrderError('2026-10-21', '2026-10-22')).toBeNull();
    expect(dateRangeOrderError('2026-10-21', '')).toBeNull();
  });

  it('keeps years inside 1900-2100 for safe formatting', () => {
    expect(DATE_YEAR_MIN).toBe(1900);
    expect(DATE_YEAR_MAX).toBe(2100);
    expect(isSupportedDateYear(1899)).toBe(false);
    expect(isSupportedDateYear(1900)).toBe(true);
    expect(isSupportedDateYear(2100)).toBe(true);
    expect(isSupportedDateYear(2101)).toBe(false);
    expect(formatAuDate('2026-10-21')).toBe('21/10/2026');
  });
});

describe('overnight write helpers', () => {
  it('adds one local calendar day', () => {
    expect(addLocalDate('2026-10-19', 1)).toBe('2026-10-20');
    expect(addLocalDate('2026-10-21', -1)).toBe('2026-10-20');
    expect(overlapQueryDates('2026-10-21')).toEqual({ fromDate: '2026-10-20', toDate: '2026-10-21' });
    expect(overlapQueryDates('2026-10-21', true)).toEqual({ fromDate: '2026-10-20', toDate: '2026-10-22' });
  });

  it('labels a wrap with (+1)', () => {
    expect(formatClockRangeLabel('2026-10-19T23:00:00', '2026-10-20T01:00:00')).toBe('23:00–01:00 (+1)');
    expect(formatClockFinishLabel('2026-10-19T23:00:00', '2026-10-20T01:00:00')).toBe('01:00 (+1)');
  });
});
