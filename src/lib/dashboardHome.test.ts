import { describe, expect, it } from 'vitest';
import {
  dashboardClockLabel,
  dashboardCrewLabel,
  dashboardHeadingDate,
  dashboardJobHref,
  dashboardJobMetaLine,
  dashboardJobPlace,
  dashboardJobSite,
  dashboardJobState,
  dashboardJobStateLabel,
  dashboardJobSuburb,
  dashboardTodayKey,
  isDashboardTodayWork,
  todaysDashboardJobs,
  type DashboardTodayJob,
} from './dashboardHome';

const thursday = new Date(2026, 7, 27, 7, 15); // Thu 27 Aug 2026

function job(over: Partial<DashboardTodayJob> & { id?: string } = {}): DashboardTodayJob & { id: string } {
  return {
    id: 'job-1',
    title: 'Switchboard upgrade',
    scheduled_date: '2026-08-27',
    start_time: '07:30:00',
    end_time: '16:00:00',
    status: 'scheduled',
    address: '12 Workshop Rd, Perth WA 6000',
    client_name: 'Northside Electrical',
    assigned_team: ['emp-a'],
    ...over,
  };
}

describe('dashboardJobHref', () => {
  it('opens the existing job page, not a new home destination', () => {
    expect(dashboardJobHref('job-42')).toBe('/jobs/job-42');
  });
});

describe('dashboard today key and heading', () => {
  it('uses the local calendar day the schedule already uses', () => {
    expect(dashboardTodayKey(thursday)).toBe('2026-08-27');
    expect(dashboardHeadingDate(thursday)).toBe('Thursday 27 August');
  });
});

describe('todaysDashboardJobs', () => {
  it('keeps jobs booked today, including an ISO timestamp', () => {
    const rows = [
      job({ id: 'am', start_time: '07:30:00', title: 'Meter' }),
      job({ id: 'iso', scheduled_date: '2026-08-27T00:00:00.000Z', start_time: '13:00:00', title: 'Board' }),
      job({ id: 'wed', scheduled_date: '2026-08-26', title: 'Yesterday' }),
      job({ id: 'undated', scheduled_date: null, title: 'Needs a date' }),
    ];
    expect(todaysDashboardJobs(rows, thursday).map(j => j.id)).toEqual(['am', 'iso']);
  });

  it('drops cancelled jobs and keeps completed work that was booked today', () => {
    const rows = [
      job({ id: 'live', status: 'scheduled' }),
      job({ id: 'done', status: 'completed', start_time: '15:00:00' }),
      job({ id: 'off', status: 'cancelled' }),
    ];
    expect(todaysDashboardJobs(rows, thursday).map(j => j.id)).toEqual(['live', 'done']);
  });

  it('includes in-progress jobs that are still on site, even if the date is not today', () => {
    const rows = [
      job({ id: 'carry', status: 'in_progress', scheduled_date: '2026-08-26', start_time: '08:00:00' }),
      job({ id: 'other', status: 'scheduled', scheduled_date: '2026-08-28' }),
    ];
    expect(isDashboardTodayWork(rows[0], thursday)).toBe(true);
    expect(todaysDashboardJobs(rows, thursday).map(j => j.id)).toEqual(['carry']);
  });

  it('sorts by start time, then title; all-day after timed', () => {
    const rows = [
      job({ id: 'late', start_time: '15:00:00', title: 'Zebra' }),
      job({ id: 'all-day', start_time: null, title: 'All day' }),
      job({ id: 'early-b', start_time: '08:00:00', title: 'B job' }),
      job({ id: 'early-a', start_time: '08:00:00', title: 'A job' }),
    ];
    expect(todaysDashboardJobs(rows, thursday).map(j => j.id)).toEqual([
      'early-a',
      'early-b',
      'late',
      'all-day',
    ]);
  });
});

describe('dashboard row fields', () => {
  it('prints stored times and All day when the job has no clock', () => {
    expect(dashboardClockLabel('07:30:00', '16:00:00')).toBe('07:30 – 16:00');
    expect(dashboardClockLabel('07:30:00', null)).toBe('07:30');
    expect(dashboardClockLabel(null, '16:00:00')).toBe('All day');
  });

  it('prefers the job site, then the client site, and reads an AU suburb', () => {
    expect(dashboardJobSite(job())).toBe('12 Workshop Rd, Perth WA 6000');
    expect(dashboardJobSuburb('12 Workshop Rd, Perth WA 6000')).toBe('Perth');
    expect(dashboardJobPlace(job())).toBe('Perth');
    expect(dashboardJobSite({
      address: null,
      client_address: '44 George St, Brisbane QLD 4000',
    })).toBe('44 George St, Brisbane QLD 4000');
    expect(dashboardJobSite({ address: 'No site address', client_address: null })).toBe('');
    expect(dashboardJobMetaLine(job())).toBe('Northside Electrical · Perth');
    expect(dashboardJobMetaLine(job({ client_name: null, address: null, client_address: null }))).toBe('');
  });

  it('labels live, on-site, and finished work from existing status fields', () => {
    expect(dashboardJobStateLabel(dashboardJobState(job(), thursday))).toBe('Today');
    expect(dashboardJobStateLabel(dashboardJobState(job({ status: 'in_progress' }), thursday))).toBe('On site');
    expect(dashboardJobStateLabel(dashboardJobState(job({ status: 'completed' }), thursday))).toBe('Done');
    expect(dashboardJobStateLabel(dashboardJobState(
      job({ status: 'scheduled', scheduled_date: '2026-08-26' }),
      thursday,
    ))).toBe('Scheduled');
  });

  it('resolves crew through members the home already loads', () => {
    const members = [
      { id: 'emp-a', name: 'Alex Crew' },
      { id: 'emp-b', name: 'Blair Hand' },
    ];
    expect(dashboardCrewLabel(['emp-a', 'emp-b'], members)).toBe('Alex Crew, Blair Hand');
    expect(dashboardCrewLabel([], members)).toBe('Unassigned');
    expect(dashboardCrewLabel(['ghost'], members)).toBe('Crew');
  });
});
