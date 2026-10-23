import { describe, expect, it } from 'vitest';
import type { DashboardTodayJob } from './dashboardHome';
import {
  pickTodayNowJob,
  todayBandFromWidth,
  todayClockLabel,
  todayClockLines,
  todayClockRange,
  todayCrewMeta,
  todayCrewOut,
  todayDirectionsHref,
  todayDueLabel,
  todayEyebrow,
  todayJobMeta,
  todayJobPill,
  todayNowEyebrow,
  todayShowsPlace,
  todayWhisperCrew,
  todayWhisperJobs,
  TODAY_CREW_NONE,
  TODAY_PILL_READY,
  TODAY_PILL_SET_DATE,
} from './todayLayout';

const monday = new Date(2026, 9, 19, 13, 40, 0);

function job(over: Partial<DashboardTodayJob> & { id: string }): DashboardTodayJob & { id: string } {
  return {
    title: 'Backflow test, annual',
    scheduled_date: '2026-10-19',
    start_time: '13:00:00',
    end_time: '14:00:00',
    status: 'in_progress',
    address: '12 Kedron Rd, Kedron QLD 4031',
    client_name: 'Kedron Medical Centre',
    assigned_team: ['dean'],
    ...over,
  };
}

describe('today type and clock', () => {
  it('prints the eyebrow with a 24h time and no spaces around the clock en dash', () => {
    expect(todayEyebrow(monday, false)).toBe('Mon 19 Oct · 13:40');
    expect(todayEyebrow(monday, true)).toBe('Monday 19 October · 13:40');
    expect(todayClockLabel('07:00:00', '10:30:00')).toBe('07:00–10:30');
    expect(todayClockRange('07:00:00', '10:30:00')).toBe('07:00–10:30');
    expect(todayClockLines('07:00:00', '10:30:00')).toEqual(['07:00', '10:30']);
    expect(todayClockLabel(null, '10:30:00')).toBe('All day');
  });

  it('builds a directions URL from the site address', () => {
    expect(todayDirectionsHref('12 Kedron Rd, Kedron QLD 4031')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=12%20Kedron%20Rd%2C%20Kedron%20QLD%204031',
    );
  });
});

describe('D2 crew out', () => {
  it('counts distinct crew once and includes completed jobs, not cancelled', () => {
    const rows = [
      job({ id: 'a', assigned_team: ['dean', 'tom'] }),
      job({ id: 'b', assigned_team: ['dean'], status: 'completed' }),
      job({ id: 'c', assigned_team: ['kayla'], status: 'cancelled' }),
      job({ id: 'd', assigned_team: ['', null as unknown as string] }),
    ];
    expect(todayCrewOut(rows)).toBe(2);
  });
});

describe('D3 NOW pick', () => {
  const rows = [
    job({ id: 'early', start_time: '07:00:00', end_time: '10:30:00', status: 'scheduled', assigned_team: ['dean'] }),
    job({ id: 'now', start_time: '13:00:00', end_time: '14:00:00', status: 'scheduled' }),
    job({ id: 'late', start_time: '14:30:00', end_time: '16:00:00', status: 'scheduled' }),
  ];

  it('picks NEXT before the first start, NOW inside the window, and drops the job at the exclusive end', () => {
    expect(pickTodayNowJob(rows, new Date(2026, 9, 19, 6, 59)).job?.id).toBe('early');
    expect(todayNowEyebrow(pickTodayNowJob(rows, new Date(2026, 9, 19, 6, 59)))).toBe('Next · 07:00–10:30');
    expect(pickTodayNowJob(rows, monday).job?.id).toBe('now');
    expect(todayNowEyebrow(pickTodayNowJob(rows, monday))).toBe('Now · 13:00–14:00');
    expect(pickTodayNowJob(rows, new Date(2026, 9, 19, 14, 0)).job?.id).toBe('late');
    expect(pickTodayNowJob(rows, new Date(2026, 9, 19, 23, 0)).kind).toBe('empty');
  });

  it('uses start+1h when end is missing, and never treats an untimed job as NOW', () => {
    const untimed = [job({ id: 'site', start_time: null, end_time: null, status: 'in_progress' })];
    expect(pickTodayNowJob(untimed, monday)).toEqual({ kind: 'on_site', job: untimed[0] });
    expect(todayNowEyebrow(pickTodayNowJob(untimed, monday))).toBe('Now · On site');
    const openEnd = [job({ id: 'hour', start_time: '13:00:00', end_time: null, status: 'scheduled' })];
    expect(pickTodayNowJob(openEnd, new Date(2026, 9, 19, 13, 59)).job?.id).toBe('hour');
    expect(pickTodayNowJob(openEnd, new Date(2026, 9, 19, 14, 0)).kind).toBe('empty');
  });
});

describe('D7 pills and wording', () => {
  it('uses Ready to invoice, Done, In progress, Needs crew, Booked, and No date', () => {
    const ready = new Set(['ready']);
    expect(todayJobPill(job({ id: 'ready', status: 'completed' }), ready).label).toBe(TODAY_PILL_READY);
    expect(todayJobPill(job({ id: 'done', status: 'completed' }), new Set()).label).toBe('Done');
    expect(todayJobPill(job({ id: 'live', status: 'in_progress' }), new Set()).label).toBe('In progress');
    expect(todayJobPill(job({
      id: 'crew',
      status: 'scheduled',
      assigned_team: [],
    }), new Set()).label).toBe('Needs crew');
    expect(todayJobPill(job({
      id: 'booked',
      status: 'scheduled',
      assigned_team: ['dean'],
    }), new Set()).label).toBe('Booked');
    expect(todayJobPill(job({
      id: 'undated',
      status: 'scheduled',
      scheduled_date: null,
    }), new Set())).toMatchObject({ label: 'No date', kind: 'no_date' });
    expect(TODAY_PILL_SET_DATE).toBe('Set a date');
  });

  it('writes No crew yet in meta and keeps the client on the phone line', () => {
    expect(todayCrewMeta([], [])).toBe(TODAY_CREW_NONE);
    expect(todayJobMeta(job({
      id: 'row',
      job_number: 36,
      assigned_team: [],
      client_name: 'Stafford Bowls',
    }), [], 390)).toEqual(['#0036', 'Stafford Bowls', TODAY_CREW_NONE]);
  });
});

describe('whisper and due copy', () => {
  it('uses jobs, never bookings, and singular forms', () => {
    expect(todayWhisperJobs(0)).toBe('No jobs today');
    expect(todayWhisperJobs(1)).toBe('1 job');
    expect(todayWhisperJobs(5)).toBe('5 jobs');
    expect(todayWhisperCrew(0)).toBe('No crew out');
    expect(todayWhisperCrew(1)).toBe('1 crew out');
    expect(todayWhisperCrew(4)).toBe('4 crew out');
    expect(todayWhisperJobs(2)).not.toMatch(/booking/i);
  });

  it('prints Due Fri 30 Oct or N days overdue', () => {
    expect(todayDueLabel('2026-10-30', false, monday)).toBe('Due Fri 30 Oct');
    expect(todayDueLabel('2026-10-09', true, monday)).toBe('10 days overdue');
  });
});

describe('bands', () => {
  it('snaps 375/390 to phone, 768 to tablet, 1024+ to desk, Place at 1200', () => {
    expect(todayBandFromWidth(375)).toBe('p');
    expect(todayBandFromWidth(390)).toBe('p');
    expect(todayBandFromWidth(768)).toBe('t');
    expect(todayBandFromWidth(1024)).toBe('d');
    expect(todayShowsPlace(1024)).toBe(false);
    expect(todayShowsPlace(1280)).toBe(true);
  });
});
