import { describe, expect, it } from 'vitest';
import {
  applyDropStartTime,
  asTeamIds,
  dayRowHeightPx,
  nextAssignedTeam,
  placeDayRowJobs,
  rescheduleJobPatch,
  rememberDraggedJob,
  readDroppedJobId,
  resizeJobTimes,
  startTimeFromDropOffset,
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
    expect(startTimeFromDropOffset(96)).toBe('07:00:00');
  });

  it('snaps to 15 minutes', () => {
    expect(startTimeFromDropOffset(24)).toBe('06:15:00');
    expect(startTimeFromDropOffset(48)).toBe('06:30:00');
  });

  it('clamps to the visible day', () => {
    expect(startTimeFromDropOffset(-40)).toBe('06:00:00');
    expect(startTimeFromDropOffset(96 * 20)).toBe('20:00:00');
  });
});

describe('applyDropStartTime', () => {
  it('shifts end time to keep duration', () => {
    expect(applyDropStartTime('08:00:00', '10:00:00', '09:00:00')).toEqual({
      start_time: '09:00:00',
      end_time: '11:00:00',
    });
  });

  it('gives a one-hour slot when the job had no end', () => {
    expect(applyDropStartTime('08:00:00', null, '09:30:00')).toEqual({
      start_time: '09:30:00',
      end_time: '10:30:00',
    });
  });

  it('turns an all-day job into a one-hour time slot', () => {
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

  it('gives an untimed job a morning slot when dropped on a person', () => {
    expect(rescheduleJobPatch(
      { assigned_team: [], start_time: null, end_time: null },
      { date: '2026-08-20', employeeId: 'alice' },
    )).toEqual({
      scheduled_date: '2026-08-20',
      assigned_team: ['alice'],
      start_time: '08:00:00',
      end_time: '09:00:00',
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

describe('readDroppedJobId', () => {
  it('falls back to the job remembered at drag start', () => {
    rememberDraggedJob('job-1');
    const empty = { getData: () => '' } as unknown as DataTransfer;
    expect(readDroppedJobId(empty)).toBe('job-1');
    expect(readDroppedJobId(empty)).toBe(null);
  });

  it('prefers dataTransfer when it has a job id', () => {
    rememberDraggedJob('job-1');
    const dt = {
      getData: (type: string) => (type === 'text/plain' ? 'job-2' : ''),
    } as unknown as DataTransfer;
    expect(readDroppedJobId(dt)).toBe('job-2');
  });
});

describe('resizeJobTimes', () => {
  it('drags the finish edge later and snaps to 15 minutes', () => {
    expect(resizeJobTimes('08:00:00', '09:00:00', 'end', 8 * 60 + 40)).toEqual({
      start_time: '08:00:00',
      end_time: '08:45:00',
    });
  });

  it('keeps a 15-minute minimum when dragging start toward finish', () => {
    expect(resizeJobTimes('08:00:00', '10:00:00', 'start', 10 * 60)).toEqual({
      start_time: '09:45:00',
      end_time: '10:00:00',
    });
  });

  it('does not run past the visible day', () => {
    expect(resizeJobTimes('18:00:00', '19:00:00', 'end', 22 * 60).end_time).toBe('20:00:00');
    expect(resizeJobTimes('07:00:00', '08:00:00', 'start', 4 * 60).start_time).toBe('06:00:00');
  });
});
