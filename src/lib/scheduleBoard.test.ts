import { describe, expect, it } from 'vitest';
import {
  SCHEDULE_WEEK_STARTS_ON,
  compareScheduleJobs,
  filterJobsByCrew,
  groupJobsByScheduleDay,
  jobMatchesCrewFilter,
  jobsOnScheduleDay,
  parseScheduleView,
  scheduleClockLabel,
  scheduleCrewLabel,
  scheduleCrewNames,
  scheduleDateKey,
  scheduleDayKey,
  scheduleJobHref,
  scheduleWeekColumns,
  scheduleWeekDayKeys,
  scheduleWeekDays,
} from './scheduleBoard';

const members = [
  { id: 'emp-a', name: 'Alex Crew' },
  { id: 'emp-b', name: 'Blair Hand' },
];

function job(over: {
  id?: string;
  title?: string | null;
  scheduled_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  assigned_team?: string[] | null;
} = {}) {
  return {
    id: 'job-1',
    title: 'Switchboard test',
    scheduled_date: '2026-08-25',
    start_time: '08:30:00',
    end_time: '16:00:00',
    assigned_team: ['emp-a'],
    ...over,
  };
}

describe('scheduleJobHref', () => {
  it('opens the existing job page, not a new schedule destination', () => {
    expect(scheduleJobHref('job-42')).toBe('/jobs/job-42');
  });
});

describe('parseScheduleView', () => {
  it('defaults to week so the contractor sees the week first', () => {
    expect(parseScheduleView(null)).toBe('week');
    expect(parseScheduleView('')).toBe('week');
    expect(parseScheduleView('week')).toBe('week');
    expect(parseScheduleView('day')).toBe('day');
    expect(parseScheduleView('month')).toBe('week');
  });
});

describe('scheduleDayKey', () => {
  it('reads a calendar day, including an ISO timestamp', () => {
    expect(scheduleDayKey('2026-08-25')).toBe('2026-08-25');
    expect(scheduleDayKey('2026-08-25T00:00:00.000Z')).toBe('2026-08-25');
    expect(scheduleDayKey(' 2026-08-25 ')).toBe('2026-08-25');
    expect(scheduleDayKey(null)).toBeNull();
    expect(scheduleDayKey('')).toBeNull();
    expect(scheduleDayKey('Tuesday')).toBeNull();
  });
});

describe('AU week grouping', () => {
  it('starts the week on Monday', () => {
    expect(SCHEDULE_WEEK_STARTS_ON).toBe(1);
    const wednesday = new Date(2026, 7, 26); // Wed 26 Aug 2026
    const keys = scheduleWeekDayKeys(wednesday);
    expect(keys).toEqual([
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
      '2026-08-27',
      '2026-08-28',
      '2026-08-29',
      '2026-08-30',
    ]);
    expect(scheduleDateKey(scheduleWeekDays(wednesday)[0])).toBe('2026-08-24');
  });

  it('puts dated jobs on their day and leaves undated jobs off the board', () => {
    const rows = [
      job({ id: 'tue-am', scheduled_date: '2026-08-25', start_time: '09:00:00', title: 'Meter' }),
      job({ id: 'tue-pm', scheduled_date: '2026-08-25T16:00:00.000Z', start_time: '13:00:00', title: 'Board' }),
      job({ id: 'thu', scheduled_date: '2026-08-27', start_time: '07:30:00', title: 'Switchboard' }),
      job({ id: 'undated', scheduled_date: null, title: 'Needs a date' }),
    ];
    const columns = scheduleWeekColumns(rows, new Date(2026, 7, 26));
    expect(columns.map(col => col.date)).toEqual(scheduleWeekDayKeys(new Date(2026, 7, 26)));
    expect(columns[1].jobs.map(j => j.id)).toEqual(['tue-am', 'tue-pm']);
    expect(columns[3].jobs.map(j => j.id)).toEqual(['thu']);
    expect(columns.every(col => col.jobs.every(j => j.id !== 'undated'))).toBe(true);
    expect(jobsOnScheduleDay(rows, '2026-08-26')).toEqual([]);
  });

  it('sorts a day by start time, then title; all-day after timed', () => {
    const rows = [
      job({ id: 'late', start_time: '15:00:00', title: 'Zebra' }),
      job({ id: 'all-day', start_time: null, title: 'All day' }),
      job({ id: 'early-b', start_time: '08:00:00', title: 'B job' }),
      job({ id: 'early-a', start_time: '08:00:00', title: 'A job' }),
    ];
    expect(jobsOnScheduleDay(rows, '2026-08-25').map(j => j.id)).toEqual([
      'early-a',
      'early-b',
      'late',
      'all-day',
    ]);
  });

  it('only fills requested day keys so a day view stays on that date', () => {
    const rows = [
      job({ id: 'tue', scheduled_date: '2026-08-25' }),
      job({ id: 'wed', scheduled_date: '2026-08-26' }),
    ];
    const grouped = groupJobsByScheduleDay(rows, ['2026-08-26']);
    expect([...grouped.keys()]).toEqual(['2026-08-26']);
    expect(grouped.get('2026-08-26')?.map(j => j.id)).toEqual(['wed']);
  });
});

describe('crew filter and labels', () => {
  it('shows every job until a crew filter is on', () => {
    const open = job({ assigned_team: [] });
    const alex = job({ id: 'alex', assigned_team: ['emp-a'] });
    const blair = job({ id: 'blair', assigned_team: ['emp-b'] });
    expect(filterJobsByCrew([open, alex, blair], new Set())).toHaveLength(3);
    expect(filterJobsByCrew([open, alex, blair], new Set(['emp-a'])).map(j => j.id)).toEqual(['alex']);
    expect(jobMatchesCrewFilter(['emp-a', 'emp-b'], new Set(['emp-b']))).toBe(true);
    expect(jobMatchesCrewFilter([], new Set(['emp-a']))).toBe(false);
  });

  it('resolves assigned_team through the members the board already loads', () => {
    expect(scheduleCrewNames(['emp-b', 'missing'], members)).toEqual(['Blair Hand']);
    expect(scheduleCrewLabel(['emp-a', 'emp-b'], members)).toBe('Alex Crew, Blair Hand');
    expect(scheduleCrewLabel([], members)).toBe('Unassigned');
    expect(scheduleCrewLabel(['ghost'], members)).toBe('Crew');
  });
});

describe('scheduleClockLabel', () => {
  it('prints stored times and stays blank for all-day work', () => {
    expect(scheduleClockLabel('08:30:00', '16:00:00')).toBe('08:30 – 16:00');
    expect(scheduleClockLabel('08:30:00', null)).toBe('08:30');
    expect(scheduleClockLabel(null, '16:00:00')).toBeNull();
  });
});

describe('compareScheduleJobs', () => {
  it('is stable for the board sort', () => {
    expect(compareScheduleJobs(
      { start_time: '09:00:00', title: 'B' },
      { start_time: '09:00:00', title: 'A' },
    )).toBeGreaterThan(0);
  });
});
