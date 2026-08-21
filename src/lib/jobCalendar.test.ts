import { describe, expect, it } from 'vitest';
import {
  JOB_CALENDAR_MISS,
  JOB_CALENDAR_TZ,
  buildJobCalendar,
  calendarCrewNames,
  calendarSite,
  type CalendarJob,
} from './jobCalendar';

const now = new Date('2026-08-21T08:00:00.000Z');

function job(over: Partial<CalendarJob> = {}): CalendarJob {
  return {
    id: 'job-1',
    title: 'Switchboard test',
    address: '12 Smith St, Midland',
    assigned_team: ['emp-a', 'emp-b'],
    scheduled_date: '2026-08-22',
    start_time: '08:30:00',
    end_time: '16:00:00',
    job_number: 42,
    ...over,
  };
}

const members = [
  { id: 'emp-a', name: 'Alex Crew' },
  { id: 'emp-b', name: 'Blair Hand' },
];

describe('calendar field helpers', () => {
  it('uses the first existing site field and skips empties', () => {
    expect(calendarSite('', '  ', '12 Smith St')).toBe('12 Smith St');
    expect(calendarSite(null, undefined, '  ')).toBe('');
  });

  it('resolves crew from assigned_team through the existing member list', () => {
    expect(calendarCrewNames(['emp-b', 'missing'], members)).toEqual(['Blair Hand']);
    expect(calendarCrewNames([], members)).toEqual([]);
  });
});

describe('buildJobCalendar', () => {
  it('misses honestly when the job has no date', () => {
    const miss = buildJobCalendar(job({ scheduled_date: null }));
    expect(miss).toEqual({ ok: false, reason: 'no_date', message: JOB_CALENDAR_MISS });
    expect(JOB_CALENDAR_MISS).toBe('Needs a date on the board.');
    expect(buildJobCalendar(job({ scheduled_date: '  ' })).ok).toBe(false);
  });

  it('builds a Perth timed event from existing job title, site, and crew', () => {
    const built = buildJobCalendar(job(), { members, now });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    expect(JOB_CALENDAR_TZ).toBe('Australia/Perth');
    expect(built.title).toBe('Switchboard test');
    expect(built.site).toBe('12 Smith St, Midland');
    expect(built.crew).toEqual(['Alex Crew', 'Blair Hand']);
    expect(built.filename).toBe('job-0042.ics');
    expect(built.href.startsWith('data:text/calendar;charset=utf-8,')).toBe(true);

    expect(built.ics).toContain('BEGIN:VCALENDAR');
    expect(built.ics).toContain('TZID:Australia/Perth');
    expect(built.ics).toContain('TZOFFSETTO:+0800');
    expect(built.ics).toContain('DTSTART;TZID=Australia/Perth:20260822T083000');
    expect(built.ics).toContain('DTEND;TZID=Australia/Perth:20260822T160000');
    expect(built.ics).toContain('SUMMARY:Switchboard test');
    expect(built.ics).toContain('LOCATION:12 Smith St\\, Midland');
    expect(built.ics).toContain('DESCRIPTION:Crew: Alex Crew\\, Blair Hand');
    expect(built.ics).toContain('UID:job-job-1@bts-inspect');
    expect(built.ics).toContain('DTSTAMP:20260821T080000Z');
    expect(built.ics).not.toContain('DTSTART:20260822T003000Z');
  });

  it('accepts a site override from the hub/board (address or client address)', () => {
    const built = buildJobCalendar(job({ address: null }), {
      site: '88 Client Rd, Perth',
      crewNames: ['Alex Crew'],
      now,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.site).toBe('88 Client Rd, Perth');
    expect(built.ics).toContain('LOCATION:88 Client Rd\\, Perth');
    expect(built.ics).toContain('DESCRIPTION:Crew: Alex Crew');
  });

  it('uses an all-day Perth date when there is a date but no start time', () => {
    const built = buildJobCalendar(job({ start_time: null, end_time: null }), { now });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.ics).toContain('DTSTART;VALUE=DATE:20260822');
    expect(built.ics).toContain('DTEND;VALUE=DATE:20260823');
    expect(built.ics).not.toContain('DTSTART;TZID=');
  });

  it('defaults a missing end to one hour, matching the board', () => {
    const built = buildJobCalendar(job({ end_time: null }), { now });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.ics).toContain('DTSTART;TZID=Australia/Perth:20260822T083000');
    expect(built.ics).toContain('DTEND;TZID=Australia/Perth:20260822T093000');
  });

  it('says Unassigned when the job has a date and no crew', () => {
    const built = buildJobCalendar(job({ assigned_team: [] }), { now });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.crew).toEqual([]);
    expect(built.ics).toContain('DESCRIPTION:Crew: Unassigned');
  });

  it('escapes ICS specials in title and site', () => {
    const built = buildJobCalendar(job({
      title: 'Test; comma, slash\\',
      address: '1 Oak St\nMidland',
    }), { crewNames: [], now });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.ics).toContain('SUMMARY:Test\\; comma\\, slash\\\\');
    expect(built.ics).toContain('LOCATION:1 Oak St\\nMidland');
  });

  it('reads scheduled_date as a calendar day, not a UTC instant', () => {
    const built = buildJobCalendar(job({ scheduled_date: '2026-08-22T00:00:00.000Z' }), { now });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.ics).toContain('DTSTART;TZID=Australia/Perth:20260822T083000');
  });
});
