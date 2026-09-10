import { describe, expect, it } from 'vitest';
import {
  bookingWarnings,
  clashingJobIds,
  hoursWarnings,
  jobBookingLabel,
  jobsClash,
  shouldProceedWithBooking,
} from './booking';

const names = new Map([
  ['alice', 'Alice'],
  ['bob', 'Bob'],
]);

function job(partial: Partial<Parameters<typeof jobsClash>[0]> & { id: string }) {
  return {
    title: 'Job',
    status: 'scheduled',
    scheduled_date: '2026-09-11',
    start_time: null,
    end_time: null,
    assigned_team: ['alice'],
    ...partial,
  };
}

describe('jobsClash', () => {
  it('treats two untimed jobs on the same day as a clash', () => {
    expect(jobsClash(job({ id: 'a' }), job({ id: 'b' }))).toBe(true);
  });

  it('ignores a cancelled job', () => {
    expect(jobsClash(job({ id: 'a' }), job({ id: 'b', status: 'cancelled' }))).toBe(false);
  });

  it('ignores a different day', () => {
    expect(jobsClash(job({ id: 'a' }), job({ id: 'b', scheduled_date: '2026-09-12' }))).toBe(false);
  });

  it('detects overlapping clock times', () => {
    expect(jobsClash(
      job({ id: 'a', start_time: '08:00:00', end_time: '10:00:00' }),
      job({ id: 'b', start_time: '09:30:00', end_time: '11:00:00' }),
    )).toBe(true);
  });

  it('allows back-to-back times', () => {
    expect(jobsClash(
      job({ id: 'a', start_time: '08:00:00', end_time: '10:00:00' }),
      job({ id: 'b', start_time: '10:00:00', end_time: '12:00:00' }),
    )).toBe(false);
  });

  it('treats an untimed job as occupying the whole day', () => {
    expect(jobsClash(
      job({ id: 'a' }),
      job({ id: 'b', start_time: '09:00:00', end_time: '10:00:00' }),
    )).toBe(true);
  });
});

describe('bookingWarnings', () => {
  it('names the person and the other job', () => {
    const warnings = bookingWarnings(
      job({ id: 'a', job_number: 5, title: 'Switchboard', assigned_team: ['alice'] }),
      [job({ id: 'b', job_number: 3, title: 'Outlets', assigned_team: ['alice'] })],
      names,
    );
    expect(warnings).toEqual(['Alice is already on #0003 Outlets that day.']);
  });

  it('stays quiet when the crew does not overlap', () => {
    expect(bookingWarnings(
      job({ id: 'a', assigned_team: ['alice'] }),
      [job({ id: 'b', assigned_team: ['bob'] })],
      names,
    )).toEqual([]);
  });

  it('warns on a recorded day off', () => {
    expect(hoursWarnings(
      job({ id: 'a', assigned_team: ['alice'] }),
      [{ memberId: 'alice', date: '2026-09-11', working: false, reason: 'Annual leave' }],
      names,
    )).toEqual(['Alice is marked off on 2026-09-11 (Annual leave).']);
  });

  it('warns when the job sits outside dated hours', () => {
    expect(hoursWarnings(
      job({ id: 'a', assigned_team: ['alice'], start_time: '17:00:00', end_time: '18:00:00' }),
      [{ memberId: 'alice', date: '2026-09-11', working: true, start: '07:00', end: '16:00', reason: 'Early finish' }],
      names,
    )).toEqual(['Alice is only available 07:00–16:00 on 2026-09-11 (Early finish).']);
  });

  it('does not invent hours when nothing is recorded', () => {
    expect(hoursWarnings(job({ id: 'a' }), [], names)).toEqual([]);
  });
});

describe('clashingJobIds', () => {
  it('marks both open jobs that share a person', () => {
    const ids = clashingJobIds([
      job({ id: 'a', assigned_team: ['alice'] }),
      job({ id: 'b', assigned_team: ['alice'] }),
      job({ id: 'c', assigned_team: ['bob'] }),
    ]);
    expect([...ids].sort()).toEqual(['a', 'b']);
  });
});

describe('shouldProceedWithBooking', () => {
  it('skips the prompt when there is nothing to warn about', () => {
    expect(shouldProceedWithBooking([], () => false)).toBe(true);
  });

  it('asks before booking over a warning', () => {
    expect(shouldProceedWithBooking(['clash'], () => false)).toBe(false);
    expect(shouldProceedWithBooking(['clash'], () => true)).toBe(true);
  });
});

describe('jobBookingLabel', () => {
  it('prefers a padded job number', () => {
    expect(jobBookingLabel({ job_number: 5, title: 'Test' })).toBe('#0005 Test');
  });
});
