import { describe, expect, it } from 'vitest';
import { pickJobColor } from './jobColors';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  MORE_JOBS_THIS_WEEK,
  SCHEDULE_BOARD_CAP,
  SCHEDULE_BOARD_COLUMNS,
  SCHEDULE_BOARD_LIMIT,
  SCHEDULE_WEEK_STARTS_ON,
  WEEK_UNASSIGNED_CREW_ID,
  jobsColumnsFromMigrations,
  scheduleBoardColumnList,
  takeBoardPage,
  compareScheduleJobs,
  filterJobsByCrew,
  groupJobsByScheduleDay,
  jobMatchesCrewFilter,
  jobOnCrewRow,
  jobsOnScheduleDay,
  parseScheduleDateParam,
  parseScheduleView,
  AGENDA_NO_TIME_LABEL,
  TIME_NOT_SET_LABEL,
  scheduleAgendaClock,
  scheduleChipClock,
  scheduleClockLabel,
  schedulePlotTimes,
  scheduleCrewLabel,
  scheduleCrewNames,
  scheduleDateKey,
  scheduleDayKey,
  scheduleJobHref,
  scheduleSheetSavePayload,
  scheduleWeekAgenda,
  scheduleWeekColumns,
  scheduleWeekDayKeys,
  scheduleWeekDays,
  weekBoardChip,
  weekBoardChipColor,
  weekBoardChipDescription,
  weekBoardCrewLabel,
  weekBoardFamilyKey,
  weekBoardRows,
  countNeedCrewJobs,
  scheduleBoardWhisper,
  scheduleEyebrow,
  scheduleLaneColor,
  scheduleLaneCountLabel,
  scheduleLaneJobCount,
  scheduleNowMark,
  scheduleTimeTrack,
  weekHasWeekendJobs,
} from './scheduleBoard';
import { isNeedCrewJob } from './scheduleNeedCrew';
import { scheduleInvoicedJobIds, scheduleInvoicedQueryIds, schedulePill } from './scheduleInvoiceStatus';

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

describe('board page bounds', () => {
  it('keeps the first 200 rows and flags the 201st', () => {
    const atCap = takeBoardPage(Array.from({ length: SCHEDULE_BOARD_CAP }, (_, i) => i));
    expect(atCap.rows).toHaveLength(200);
    expect(atCap.more).toBe(false);
    const over = takeBoardPage(Array.from({ length: SCHEDULE_BOARD_LIMIT }, (_, i) => i));
    expect(over.rows).toHaveLength(200);
    expect(over.more).toBe(true);
    expect(SCHEDULE_BOARD_LIMIT).toBe(201);
    expect(MORE_JOBS_THIS_WEEK).toBe('More jobs this week than shown — open Jobs');
  });

  it('every SCHEDULE_BOARD_COLUMNS entry exists on jobs in the migration chain', () => {
    const dir = resolve(process.cwd(), 'supabase/migrations');
    expect(existsSync(dir)).toBe(true);
    const sql = readdirSync(dir)
      .filter(name => name.endsWith('.sql'))
      .sort()
      .map(name => readFileSync(join(dir, name), 'utf8'))
      .join('\n');
    const live = jobsColumnsFromMigrations(sql);
    expect(live).toContain('id');
    expect(live).toContain('company_id');
    expect(live).toContain('cost_code');
    expect(live).toContain('parent_job_id');
    expect(live).not.toContain('not_a_column');
    for (const col of scheduleBoardColumnList()) {
      expect(live, `jobs.${col} missing from supabase/migrations`).toContain(col);
    }
    expect(SCHEDULE_BOARD_COLUMNS.includes('*')).toBe(false);
  });

  it('jobsColumnsFromMigrations reads CREATE TABLE jobs and ALTER TABLE ADD COLUMN', () => {
    const cols = jobsColumnsFromMigrations(`
      CREATE TABLE IF NOT EXISTS jobs (
        id uuid PRIMARY KEY,
        title text NOT NULL,
        status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress'))
      );
      ALTER TABLE jobs ADD COLUMN color text;
      ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS cost_code text;
    `);
    expect(cols).toEqual(expect.arrayContaining(['id', 'title', 'status', 'color', 'cost_code']));
  });
});

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

describe('parseScheduleDateParam', () => {
  it('reads a calendar day and rejects junk', () => {
    const parsed = parseScheduleDateParam('2026-09-21');
    expect(parsed && scheduleDateKey(parsed)).toBe('2026-09-21');
    expect(parseScheduleDateParam('not-a-date')).toBeNull();
    expect(parseScheduleDateParam(null)).toBeNull();
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

  it('builds a Mon–Sun agenda with empty days and today marked', () => {
    const today = new Date(2026, 7, 26);
    const agenda = scheduleWeekAgenda([
      job({ id: 'tue', scheduled_date: '2026-08-25' }),
      job({ id: 'thu', scheduled_date: '2026-08-27' }),
    ], today, today);
    expect(agenda.map(day => day.date)).toEqual(scheduleWeekDayKeys(today));
    expect(agenda).toHaveLength(7);
    expect(agenda.filter(day => day.jobs.length === 0)).toHaveLength(5);
    expect(agenda.find(day => day.isToday)?.date).toBe('2026-08-26');
    expect(agenda.find(day => day.date === '2026-08-25')?.jobs.map(j => j.id)).toEqual(['tue']);
    expect(agenda.find(day => day.date === '2026-08-26')?.jobs).toEqual([]);
    expect(agenda.filter(day => day.isToday)).toHaveLength(1);
  });
});

describe('scheduleSheetSavePayload', () => {
  it('writes the same job fields the Schedule tab saves', () => {
    expect(scheduleSheetSavePayload({
      date: '2026-08-26',
      startTime: '08:00',
      endTime: '12:00',
      crewId: 'emp-a',
    })).toEqual({
      scheduled_date: '2026-08-26',
      start_time: '08:00',
      end_time: '12:00',
      assigned_team: ['emp-a'],
    });
    expect(scheduleSheetSavePayload({
      date: '2026-08-26',
      startTime: ' 09:30:00 ',
      endTime: '',
      crewId: null,
    })).toEqual({
      scheduled_date: '2026-08-26',
      start_time: '09:30',
      end_time: null,
      assigned_team: [],
    });
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
    expect(scheduleCrewLabel([' '], members)).toBe('Unassigned');
  });

  it('treats a non-array assigned_team as empty on week and day', () => {
    const objectTeam = job({ id: 'bad-object', assigned_team: {} as never });
    const nullTeam = job({ id: 'bad-null', assigned_team: null });
    expect(jobOnCrewRow({}, WEEK_UNASSIGNED_CREW_ID)).toBe(true);
    expect(jobOnCrewRow({}, 'emp-a')).toBe(false);
    expect(jobOnCrewRow(null, WEEK_UNASSIGNED_CREW_ID)).toBe(true);
    expect(jobOnCrewRow(null, 'emp-a')).toBe(false);
    expect(jobOnCrewRow([' '], WEEK_UNASSIGNED_CREW_ID)).toBe(true);
    expect(jobOnCrewRow([' '], 'emp-a')).toBe(false);
    expect(scheduleCrewNames({}, members)).toEqual([]);
    expect(scheduleCrewNames(null, members)).toEqual([]);
    expect(scheduleCrewLabel({}, members)).toBe('Unassigned');
    expect(scheduleCrewLabel(null, members)).toBe('Unassigned');
    expect(() => scheduleWeekAgenda([objectTeam, nullTeam], new Date(2026, 7, 25))).not.toThrow();
    expect(() => weekBoardRows([objectTeam, nullTeam], members, new Date(2026, 7, 25))).not.toThrow();
    const week = scheduleWeekAgenda([objectTeam, nullTeam], new Date(2026, 7, 25));
    expect(week.some(day => day.jobs.some(row => row.id === 'bad-object'))).toBe(true);
    const rows = weekBoardRows([objectTeam, nullTeam], members, new Date(2026, 7, 25));
    const unassigned = rows.find(row => row.crewId === WEEK_UNASSIGNED_CREW_ID);
    expect(unassigned?.cells.flatMap(cell => cell.jobs.map(j => j.id))).toEqual(
      expect.arrayContaining(['bad-object', 'bad-null']),
    );
  });

  it('keeps the week rail on the full crew name', () => {
    expect(weekBoardCrewLabel('Jack Wieland')).toBe('Jack Wieland');
    expect(weekBoardCrewLabel('David Hale')).toBe('David Hale');
    expect(weekBoardCrewLabel('Albie W')).toBe('Albie W');
    expect(weekBoardCrewLabel('Unassigned')).toBe('Unassigned');
    expect(weekBoardCrewLabel('  Sam Ortiz  ')).toBe('Sam Ortiz');
    expect(weekBoardCrewLabel('')).toBe('Crew');
  });
});

describe('scheduleClockLabel', () => {
  it('prints stored times and stays blank for all-day work', () => {
    expect(scheduleClockLabel('08:30:00', '16:00:00')).toBe('08:30–16:00');
    expect(scheduleClockLabel('08:30:00', null)).toBe('08:30');
    expect(scheduleClockLabel(null, '16:00:00')).toBeNull();
  });
});

describe('scheduleAgendaClock', () => {
  it('prints stored times and says No time set when the job has none', () => {
    expect(scheduleAgendaClock('08:30:00', '16:00:00')).toBe('08:30–16:00');
    expect(scheduleAgendaClock(null, null)).toBe('No time set');
    expect(scheduleAgendaClock(null, null, null)).toBe(AGENDA_NO_TIME_LABEL);
    expect(scheduleAgendaClock(null, null, '2026-10-09')).toContain('Add a time');
    expect(scheduleAgendaClock(null, null, '2026-10-09')).toMatch(/^Booked /);
    expect(scheduleAgendaClock(null, null, '2026-10-22', { status: 'quoted', scheduled_date: '2026-10-22', assigned_team: [] }))
      .not.toMatch(/Booked/);
    expect(scheduleAgendaClock(null, null)).not.toBe('—');
    expect(scheduleAgendaClock(null, null)).not.toBe(TIME_NOT_SET_LABEL);
  });
});

describe('scheduleChipClock', () => {
  it('keeps stored times and labels untimed chips honestly', () => {
    expect(scheduleChipClock('09:00:00', '12:00:00')).toBe('09:00–12:00');
    expect(scheduleChipClock(null, null)).toBe(TIME_NOT_SET_LABEL);
    expect(scheduleChipClock(null, null, '2026-10-09')).toContain('Add a time');
    expect(scheduleChipClock(null, null, '2026-10-09')).toMatch(/^Booked /);
    expect(scheduleChipClock(null, null, '2026-10-22', { status: 'quoted', scheduled_date: '2026-10-22', assigned_team: [] }))
      .not.toMatch(/Booked/);
    expect(scheduleChipClock(null, null, '2026-10-23', { status: 'quoted', scheduled_date: '2026-10-23', assigned_team: ['crew-1'] }))
      .not.toMatch(/Booked/);
  });
});

describe('schedulePlotTimes', () => {
  it('does not invent a span for jobs with no stored clock', () => {
    expect(schedulePlotTimes({ start_time: null, end_time: null })).toEqual({
      start_time: null,
      end_time: null,
      stored: false,
    });
    expect(schedulePlotTimes({ start_time: '10:00', end_time: '15:00' })).toEqual({
      start_time: '10:00',
      end_time: '15:00',
      stored: true,
    });
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

describe('week-board grouping and chips', () => {
  const dave = { id: 'emp-dave', name: 'Dave' };
  const jack = { id: 'emp-jack', name: 'Jack' };
  const sam = { id: 'emp-sam', name: 'Sam' };
  const weekAnchor = new Date(2025, 2, 31); // Mon 31 Mar 2025

  function chipJob(over: {
    id: string;
    title?: string | null;
    description?: string | null;
    scheduled_date?: string | null;
    start_time?: string | null;
    assigned_team?: string[] | null;
    job_number?: number | null;
    cost_code?: string | null;
    parent_job_id?: string | null;
    parent_job_number?: number | null;
    color?: string | null;
  }) {
    return {
      title: over.title ?? 'Job',
      scheduled_date: over.scheduled_date ?? '2025-04-01',
      start_time: over.start_time ?? '08:00:00',
      assigned_team: over.assigned_team ?? ['emp-dave'],
      job_number: over.job_number ?? 42,
      cost_code: over.cost_code ?? null,
      parent_job_id: over.parent_job_id ?? null,
      parent_job_number: over.parent_job_number ?? null,
      color: over.color ?? null,
      description: over.description ?? null,
      ...over,
    };
  }

  it('builds crew rows × weekday cells; empty days stay empty slots', () => {
    const jobs = [
      chipJob({
        id: 'switchboard',
        title: 'Switchboard',
        scheduled_date: '2025-04-01',
        assigned_team: ['emp-dave'],
        job_number: 42,
        cost_code: '01',
        parent_job_number: 42,
        color: '#8B4513',
      }),
      chipJob({
        id: 'testing',
        title: 'Testing',
        scheduled_date: '2025-04-02',
        assigned_team: ['emp-dave'],
        job_number: 42,
        cost_code: '02',
        parent_job_id: 'quote-42',
        parent_job_number: 42,
        color: '#8B4513',
      }),
      chipJob({
        id: 'warehouse',
        title: 'Warehouse lights',
        scheduled_date: '2025-04-03',
        assigned_team: ['emp-jack'],
        job_number: 48,
        color: '#0A2540',
      }),
    ];

    const rows = weekBoardRows(jobs, [dave, jack, sam], weekAnchor);
    expect(rows.map(row => row.crewName)).toEqual(['Dave', 'Jack', 'Sam', 'Unassigned']);
    expect(rows[0].cells.map(cell => cell.date)).toEqual([
      '2025-03-31',
      '2025-04-01',
      '2025-04-02',
      '2025-04-03',
      '2025-04-04',
      '2025-04-05',
      '2025-04-06',
    ]);
    expect(rows[0].cells[1].chips).toEqual([{
      id: 'switchboard',
      ref: '#0042.01',
      description: 'Switchboard',
      color: '#8B4513',
    }]);
    expect(rows[0].cells[2].chips).toEqual([{
      id: 'testing',
      ref: '#0042.02',
      description: 'Testing',
      color: '#8B4513',
    }]);
    expect(rows[1].cells[3].chips).toEqual([{
      id: 'warehouse',
      ref: '#0048',
      description: 'Warehouse lights',
      color: '#0A2540',
    }]);
    expect(rows[0].cells[0].chips).toEqual([]);
    expect(rows[2].cells.every(cell => cell.chips.length === 0)).toBe(true);
    expect(rows[3].crewId).toBe(WEEK_UNASSIGNED_CREW_ID);
  });

  it('paints sibling cost-code chips with the same job.color', () => {
    const siblings = [
      chipJob({
        id: 'parent',
        title: 'Switchboard',
        job_number: 42,
        color: '#8B4513',
      }),
      chipJob({
        id: 'child-a',
        title: 'Switchboard',
        job_number: 42,
        cost_code: '01',
        parent_job_id: 'parent',
        parent_job_number: 42,
        color: '#8B4513',
      }),
      chipJob({
        id: 'child-b',
        title: 'Testing',
        job_number: 42,
        cost_code: '02',
        parent_job_id: 'parent',
        parent_job_number: 42,
        color: '#8B4513',
      }),
    ];

    expect(siblings.map(job => weekBoardFamilyKey(job))).toEqual(['parent', 'parent', 'parent']);
    expect(siblings.map(job => weekBoardChipColor(job, siblings))).toEqual([
      '#8B4513',
      '#8B4513',
      '#8B4513',
    ]);
    expect(weekBoardChip(siblings[1], siblings)).toEqual({
      id: 'child-a',
      ref: '#0042.01',
      description: 'Switchboard',
      color: '#8B4513',
    });
    expect(weekBoardChip(siblings[2], siblings).ref).toBe('#0042.02');
  });

  it('uses the job title on the chip, not an empty-site line', () => {
    expect(weekBoardChipDescription({
      id: 'bare',
      title: 'Kitchen fit',
      description: null,
    })).toBe('Kitchen fit');
    expect(weekBoardChip({
      id: 'bare',
      title: 'Install 2x new switchboards',
      job_number: 55,
    }).description).toBe('Install 2x new switchboards');
  });

  it('inherits a family colour when a child has no color of its own', () => {
    const family = [
      chipJob({ id: 'parent', color: '#2E75B6', job_number: 42 }),
      chipJob({
        id: 'child',
        color: null,
        job_number: 42,
        cost_code: '01',
        parent_job_id: 'parent',
        parent_job_number: 42,
        title: 'Testing',
      }),
    ];
    expect(weekBoardChipColor(family[1], family)).toBe('#2E75B6');
    expect(weekBoardChipColor(family[1], [family[1]])).toBe(pickJobColor('parent'));
  });

  it('puts dated unassigned jobs on an Unassigned row, not every crew', () => {
    const jobs = [
      chipJob({
        id: 'open',
        title: 'Needs crew',
        scheduled_date: '2025-04-01',
        assigned_team: [],
        job_number: 50,
        color: '#1B7F3A',
      }),
    ];
    const rows = weekBoardRows(jobs, [dave, jack], weekAnchor);
    expect(rows[rows.length - 1].crewId).toBe(WEEK_UNASSIGNED_CREW_ID);
    expect(rows[rows.length - 1].cells[1].chips.map(chip => chip.id)).toEqual(['open']);
    expect(rows[0].cells[1].chips).toEqual([]);
  });
});

describe('schedule layout helpers', () => {
  it('plots a 07:00–10:30 span on the 06:00–20:00 track', () => {
    const track = scheduleTimeTrack('07:00', '10:30');
    expect(track.stored).toBe(true);
    expect(track.left).toBeCloseTo(60 / 900, 5);
    expect(track.width).toBeCloseTo(210 / 900, 5);
    expect(scheduleTimeTrack(null, null)).toEqual({ left: 0, width: 0, stored: false });
  });

  it('prints Now as a 24h clock and the week eyebrow without a year', () => {
    expect(scheduleNowMark(new Date(2026, 9, 19, 13, 40))).toBe('13:40');
    expect(scheduleEyebrow('week', new Date(2026, 9, 19))).toBe('Week of 19 October');
    expect(scheduleEyebrow('day', new Date(2026, 9, 19))).toBe('Monday 19 October');
  });

  it('counts a multi-crew job in every lane and leaves Unassigned last', () => {
    const shared = {
      id: 'two-crew',
      title: 'Switchboard',
      scheduled_date: '2026-10-19',
      start_time: '07:00',
      assigned_team: ['emp-a', 'emp-b'],
      job_number: 36,
    };
    const rows = weekBoardRows([shared], members, new Date(2026, 9, 19));
    expect(rows.map(row => row.crewId)).toEqual(['emp-a', 'emp-b', WEEK_UNASSIGNED_CREW_ID]);
    expect(scheduleLaneJobCount(rows[0])).toBe(1);
    expect(scheduleLaneJobCount(rows[1])).toBe(1);
    expect(scheduleLaneCountLabel(rows[0].crewId, 4)).toBe('4 jobs');
    expect(scheduleLaneCountLabel(WEEK_UNASSIGNED_CREW_ID, 2)).toBe('2 need crew');
    expect(weekHasWeekendJobs(rows)).toBe(false);
  });

  it('widens weekends only when a weekend job exists', () => {
    const sat = {
      id: 'sat',
      title: 'Saturday call',
      scheduled_date: '2026-10-24',
      start_time: '08:00',
      assigned_team: ['emp-a'],
    };
    const rows = weekBoardRows([sat], members, new Date(2026, 9, 19));
    expect(weekHasWeekendJobs(rows)).toBe(true);
  });

  it('uses a saved crew colour as-is and hashes the rest to crew tokens', () => {
    expect(scheduleLaneColor('emp-a', '#1E4A6D')).toBe('#1E4A6D');
    expect(scheduleLaneColor(WEEK_UNASSIGNED_CREW_ID, '#1E4A6D')).toBe('var(--g-line-strong)');
    expect(scheduleLaneColor('emp-a')).toMatch(/^var\(--g-crew-[1-6]\)$/);
  });

  it('drops cancelled and Done no-crew jobs from the need-crew count', () => {
    const jobs = [
      { id: 'open', status: 'scheduled', scheduled_date: '2026-10-19', assigned_team: [] },
      { id: 'live', status: 'in_progress', scheduled_date: '2026-10-19', assigned_team: [] },
      { id: 'undated-live', status: 'in_progress', scheduled_date: null, assigned_team: [] },
      { id: 'crewed', status: 'scheduled', scheduled_date: '2026-10-19', assigned_team: ['emp-a'] },
      { id: 'done', status: 'completed', scheduled_date: '2026-10-19', assigned_team: [] },
      { id: 'cancelled', status: 'cancelled', scheduled_date: '2026-10-19', assigned_team: [] },
    ];
    expect(jobs.filter(isNeedCrewJob).map(job => job.id)).toEqual(['open', 'live']);
    expect(countNeedCrewJobs(jobs)).toBe(2);
    expect(scheduleBoardWhisper({ onBoard: 14, needCrew: 2, needsDate: 3 }))
      .toBe('14 on the board · 2 need crew · 3 without a date');
  });
});

describe('schedule pills and invoiced ids', () => {
  it('marks void-only completed as Ready to invoice and draft as Done', () => {
    const voidOnly = { id: 'job-void', status: 'completed', scheduled_date: '2026-10-19' };
    const drafted = { id: 'job-draft', status: 'completed', scheduled_date: '2026-10-19' };
    const child = { id: 'job-child', status: 'completed', scheduled_date: '2026-10-19', parent_job_id: 'parent' };
    const invoices = [
      { id: 'inv-void', job_id: 'job-void', status: 'void' },
      { id: 'inv-draft', job_id: 'job-draft', status: 'draft' },
      { id: 'inv-parent', job_id: 'parent', status: 'draft' },
    ];
    const invoiced = scheduleInvoicedJobIds(invoices, [voidOnly, drafted, child]);
    expect(scheduleInvoicedQueryIds([voidOnly, drafted, child])).toEqual(
      expect.arrayContaining(['job-void', 'job-draft', 'job-child', 'parent']),
    );
    expect(schedulePill(voidOnly, invoiced)).toEqual({ label: 'Ready to invoice', kind: 'ready' });
    expect(schedulePill(drafted, invoiced)).toEqual({ label: 'Done', kind: 'done' });
    expect(schedulePill(child, invoiced)).toEqual({ label: 'Done', kind: 'done' });
    expect(schedulePill({ id: 'open', status: 'in_progress', scheduled_date: '2026-10-19', assigned_team: ['crew-1'] }))
      .toEqual({ label: 'In progress', kind: 'progress' });
    expect(schedulePill({ id: 'undated', status: 'scheduled', scheduled_date: null }))
      .toEqual({ label: 'No date', kind: 'nodate' });
    expect(schedulePill({ id: 'quoted-open', status: 'quoted', scheduled_date: '2026-10-22', assigned_team: [] }))
      .toEqual({ label: 'Needs crew', kind: 'needcrew' });
    expect(schedulePill({ id: 'quoted-crew', status: 'quoted', scheduled_date: '2026-10-22', assigned_team: ['crew-1'] }))
      .toEqual({ label: 'Quoted', kind: 'status' });
    expect(schedulePill({ id: 'space-crew', status: 'scheduled', scheduled_date: '2026-10-20', assigned_team: [' '] }))
      .toEqual({ label: 'Needs crew', kind: 'needcrew' });
    expect(schedulePill({ id: 'cancel-open', status: 'cancelled', scheduled_date: '2026-10-23', assigned_team: [] }))
      .toEqual({ label: 'Cancelled', kind: 'cancelled' });
    expect(schedulePill({ id: 'empty-status', status: '', scheduled_date: '2026-10-19', assigned_team: [] }))
      .toEqual({ label: 'Needs crew', kind: 'needcrew' });
  });
});
