import { describe, expect, it } from 'vitest';
import {
  applyDropStartTime,
  asTeamIds,
  clipJobToVisibleHours,
  countJobsOutsideVisibleWindow,
  dayRowHeightPx,
  nextAssignedTeam,
  placeDayRowJobs,
  rescheduleJobPatch,
  startTimeFromDropOffset,
  visibleDayHours,
} from './dispatch';

describe('nextAssignedTeam', () => {
  it('assigns the drop target when the job is unassigned', () => {
    expect(nextAssignedTeam([], { employeeId: 'alice' })).toEqual(['alice']);
    expect(nextAssignedTeam(null, { employeeId: 'alice' })).toEqual(['alice']);
  });

  it('adds the drop target without wiping an existing crew', () => {
    expect(nextAssignedTeam(['alice', 'bob', 'cara'], { employeeId: 'dave' })).toEqual([
      'alice', 'bob', 'cara', 'dave',
    ]);
  });

  it('keeps a 3-person crew when dropping onto someone already assigned', () => {
    expect(nextAssignedTeam(['alice', 'bob', 'cara'], { employeeId: 'bob' })).toEqual([
      'alice', 'bob', 'cara',
    ]);
  });

  it('clears crew when dropped on Unassigned', () => {
    expect(nextAssignedTeam(['alice', 'bob', 'cara'], 'unassigned')).toEqual([]);
  });
});

describe('visibleDayHours', () => {
  it('defaults to a 7am–5pm workday and can extend to 6am–8pm', () => {
    expect(visibleDayHours(false)).toEqual({ start: 7, end: 17 });
    expect(visibleDayHours(true)).toEqual({ start: 6, end: 20 });
  });
});

describe('clipJobToVisibleHours', () => {
  it('places a job that ends exactly on the 5pm label inside the workday', () => {
    const box = clipJobToVisibleHours(16 * 60, 17 * 60, 7, 17);
    expect(box.hidden).toBe(false);
    expect(box.clippedEnd).toBe(false);
    expect(box.left).toBe((16 - 7) * 72 + 2);
  });

  it('keeps a job that spans 5pm on the board and marks the clipped end', () => {
    const box = clipJobToVisibleHours(15 * 60, 18 * 60, 7, 17);
    expect(box.hidden).toBe(false);
    expect(box.clippedEnd).toBe(true);
    expect(box.left + box.width).toBeLessThanOrEqual(11 * 72);
  });

  it('does not draw past the actual end when the job ends on the 5pm label', () => {
    const box = clipJobToVisibleHours(16 * 60, 17 * 60, 7, 17);
    expect(box.width).toBe(72 - 4);
    expect(box.left + box.width).toBeLessThanOrEqual((17 - 7) * 72);
  });

  it('clips a start before 7am to the first visible column', () => {
    const box = clipJobToVisibleHours(5 * 60 + 30, 7 * 60 + 30, 7, 17);
    expect(box.hidden).toBe(false);
    expect(box.clippedStart).toBe(true);
    expect(box.left).toBe(2);
  });

  it('keeps a stub for a job that starts after the extended window', () => {
    const box = clipJobToVisibleHours(21 * 60, 22 * 60, 6, 20);
    expect(box.hidden).toBe(true);
    expect(box.clippedEnd).toBe(true);
    expect(box.width).toBe(60);
  });
});

describe('countJobsOutsideVisibleWindow', () => {
  it('counts each timed job with any portion outside the selected window once', () => {
    const jobs = [
      { start_time: '16:00:00', end_time: '17:00:00' },
      { start_time: '15:00:00', end_time: '18:00:00' },
      { start_time: '05:30:00', end_time: '07:30:00' },
      { start_time: '21:00:00', end_time: '22:00:00' },
      { start_time: '07:30:00', end_time: '08:30:00' },
      { start_time: null, end_time: null },
    ];
    expect(countJobsOutsideVisibleWindow(jobs, 7, 17)).toBe(3);
    expect(countJobsOutsideVisibleWindow(jobs, 6, 20)).toBe(2);
  });
});

describe('asTeamIds', () => {
  it('ignores non-arrays and empty ids', () => {
    expect(asTeamIds(undefined)).toEqual([]);
    expect(asTeamIds('alice')).toEqual([]);
    expect(asTeamIds(['alice', '', 1, 'bob'] as unknown[])).toEqual(['alice', 'bob']);
  });
});

describe('startTimeFromDropOffset', () => {
  it('maps the left edge of the grid to 06:00', () => {
    expect(startTimeFromDropOffset(0)).toBe('06:00:00');
  });

  it('maps one hour column to 07:00', () => {
    expect(startTimeFromDropOffset(72)).toBe('07:00:00');
  });

  it('snaps to 15 minutes', () => {
    expect(startTimeFromDropOffset(18)).toBe('06:15:00');
    expect(startTimeFromDropOffset(36)).toBe('06:30:00');
  });

  it('clamps to the visible day', () => {
    expect(startTimeFromDropOffset(-40)).toBe('06:00:00');
    expect(startTimeFromDropOffset(72 * 20)).toBe('20:00:00');
  });
});

describe('applyDropStartTime', () => {
  it('shifts end time to keep duration', () => {
    expect(applyDropStartTime('08:00:00', '10:00:00', '09:00:00')).toEqual({
      start_time: '09:00:00',
      end_time: '11:00:00',
    });
  });

  it('sets start only when the job had no end', () => {
    expect(applyDropStartTime('08:00:00', null, '09:30:00')).toEqual({
      start_time: '09:30:00',
      end_time: null,
    });
  });

  it('turns an all-day job into a one-hour timed slot', () => {
    expect(applyDropStartTime(null, null, '07:00:00')).toEqual({
      start_time: '07:00:00',
      end_time: '08:00:00',
    });
  });
});

describe('placeDayRowJobs', () => {
  it('stacks all-day jobs so they do not overlap', () => {
    const { placements, allDayCount, timedLaneCount } = placeDayRowJobs([
      { id: 'a', start_time: null, end_time: null },
      { id: 'b', start_time: null, end_time: null },
    ]);
    expect(allDayCount).toBe(2);
    expect(timedLaneCount).toBe(0);
    expect(placements).toEqual([
      { id: 'a', allDay: true, lane: 0 },
      { id: 'b', allDay: true, lane: 1 },
    ]);
  });

  it('puts overlapping timed jobs on separate lanes', () => {
    const { placements, timedLaneCount } = placeDayRowJobs([
      { id: 'early', start_time: '08:00:00', end_time: '10:00:00' },
      { id: 'overlap', start_time: '09:00:00', end_time: '11:00:00' },
      { id: 'later', start_time: '10:00:00', end_time: '12:00:00' },
    ]);
    const lane = Object.fromEntries(placements.map(p => [p.id, p.lane]));
    expect(timedLaneCount).toBe(2);
    expect(lane.early).toBe(0);
    expect(lane.overlap).toBe(1);
    expect(lane.later).toBe(0);
  });
});

describe('dayRowHeightPx', () => {
  it('grows when unassigned all-day jobs stack', () => {
    expect(dayRowHeightPx(0, 1)).toBe(72);
    expect(dayRowHeightPx(3, 0)).toBeGreaterThan(72);
  });
});

describe('rescheduleJobPatch', () => {
  const crewJob = {
    assigned_team: ['a', 'b', 'c'],
    start_time: '08:00:00',
    end_time: '10:00:00',
  };

  it('never replaces a 3-person crew with the drop target', () => {
    expect(rescheduleJobPatch(crewJob, { date: '2026-08-21', employeeId: 'd' })).toEqual({
      scheduled_date: '2026-08-21',
      assigned_team: ['a', 'b', 'c', 'd'],
    });
  });

  it('clears crew on Unassigned without dropping the date', () => {
    expect(rescheduleJobPatch(crewJob, { date: '2026-08-20', employeeId: null })).toEqual({
      scheduled_date: '2026-08-20',
      assigned_team: [],
    });
  });

  it('leaves crew alone on a date-only move (week/month)', () => {
    expect(rescheduleJobPatch(crewJob, { date: '2026-08-22' })).toEqual({
      scheduled_date: '2026-08-22',
    });
  });

  it('assigns a single tech when moving off Unassigned', () => {
    expect(rescheduleJobPatch(
      { assigned_team: [], start_time: null, end_time: null },
      { date: '2026-08-20', employeeId: 'alice' },
    )).toEqual({
      scheduled_date: '2026-08-20',
      assigned_team: ['alice'],
    });
  });

  it('gives an undated job a date when dropped on Unassigned', () => {
    expect(rescheduleJobPatch(
      { assigned_team: [], start_time: null, end_time: null },
      { date: '2026-08-21', employeeId: null },
    )).toEqual({
      scheduled_date: '2026-08-21',
      assigned_team: [],
    });
  });

  it('updates time and keeps crew when dropped on the day grid', () => {
    expect(rescheduleJobPatch(crewJob, {
      date: '2026-08-20',
      employeeId: 'b',
      startTime: '13:00:00',
    })).toEqual({
      scheduled_date: '2026-08-20',
      assigned_team: ['a', 'b', 'c'],
      start_time: '13:00:00',
      end_time: '15:00:00',
    });
  });
});
