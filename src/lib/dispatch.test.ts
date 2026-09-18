import { describe, expect, it } from 'vitest';
import {
  applyDropStartTime,
  asTeamIds,
  clipJobToVisibleHours,
  countJobsOutsideVisibleWindow,
  dayBoardHoursFit,
  dayBoardHourWidthPx,
  dayRowHeightPx,
  nextAssignedTeam,
  placeDayRowJobs,
  placePickedHint,
  placePickedOnCell,
  rescheduleJobPatch,
  rememberDraggedJob,
  readDroppedJobId,
  resizeJobTimes,
  startTimeFromDropOffset,
} from './dispatch';

describe('nextAssignedTeam', () => {
  it('assigns the drop target', () => {
    expect(nextAssignedTeam({ employeeId: 'alice' })).toEqual(['alice']);
    expect(nextAssignedTeam({ employeeId: 'dave' })).toEqual(['dave']);
  });

  it('clears crew when dropped on Unassigned', () => {
    expect(nextAssignedTeam('unassigned')).toEqual([]);
  });
});

describe('placePickedHint', () => {
  const today = new Date(2026, 8, 8);

  it('names today when the board is on today', () => {
    expect(placePickedHint('Switchboard', today, null, today)).toBe(
      'Switchboard — drop it on a crew and day, or tap a person to place it today at 8:00',
    );
  });

  it('names the selected day, not today, when the board moved', () => {
    expect(placePickedHint('Switchboard', new Date(2026, 8, 10), null, today)).toBe(
      'Switchboard — drop it on a crew and day, or tap a person to place it Thu 10 Sep at 8:00',
    );
  });

  it('does not invent 8:00 when the job already has a time', () => {
    expect(placePickedHint('Switchboard', today, '07:30:00', today)).toBe(
      'Switchboard — drop it on a crew and day, or tap a person to place it today',
    );
  });
});

describe('placePickedOnCell', () => {
  it('places an unscheduled job on that day and crew without inventing a second job', () => {
    expect(placePickedOnCell(
      { id: 'audit-undated-job' },
      '2026-08-25',
      'audit-crew-sam',
    )).toEqual({
      jobId: 'audit-undated-job',
      date: '2026-08-25',
      employeeId: 'audit-crew-sam',
    });
  });

  it('clears crew when the cell is Unassigned', () => {
    expect(placePickedOnCell(
      { id: 'job-1' },
      '2026-08-26',
      null,
    )).toEqual({
      jobId: 'job-1',
      date: '2026-08-26',
      employeeId: null,
    });
  });

  it('is the same update as a board drop', () => {
    const clicked = placePickedOnCell({ id: 'job-1' }, '2026-08-25', 'sam');
    expect(rescheduleJobPatch(
      { assigned_team: [], start_time: null, end_time: null },
      clicked,
    )).toEqual({
      scheduled_date: '2026-08-25',
      assigned_team: ['sam'],
      start_time: '08:00:00',
      end_time: '09:00:00',
    });
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

describe('dayBoardHourWidthPx', () => {
  it('fits a normal work day at laptop width and keeps phone at 96', () => {
    expect(dayBoardHourWidthPx(952)).toBe(63);
    expect(dayBoardHoursFit(952)).toBe(true);
    expect(dayBoardHourWidthPx(238)).toBe(96);
    expect(dayBoardHoursFit(238)).toBe(false);
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

  it('board drop does not stack a second crew member', () => {
    expect(rescheduleJobPatch(
      { assigned_team: ['field-audit'], start_time: '07:30:00', end_time: '16:00:00' },
      { date: '2026-08-25', employeeId: 'sam' },
    ).assigned_team).toEqual(['sam']);
  });

  it('replaces a 3-person crew with the drop target', () => {
    expect(rescheduleJobPatch(crewJob, { date: '2026-08-21', employeeId: 'd' })).toEqual({
      scheduled_date: '2026-08-21',
      assigned_team: ['d'],
    });
  });

  it('uses the same replace crew from board drop and search drop', () => {
    const board = rescheduleJobPatch(crewJob, { date: '2026-08-26', employeeId: 'dave' });
    const search = rescheduleJobPatch(crewJob, { date: '2026-08-26', employeeId: 'dave' });
    expect(board).toEqual(search);
    expect(board.assigned_team).toEqual(['dave']);
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

  it('moves an already-scheduled job onto the drop target from search', () => {
    expect(rescheduleJobPatch(crewJob, {
      date: '2026-08-26',
      employeeId: 'dave',
    })).toEqual({
      scheduled_date: '2026-08-26',
      assigned_team: ['dave'],
    });
  });

  it('keeps duration when an already-timed job is dropped on a time from search', () => {
    expect(rescheduleJobPatch(crewJob, {
      date: '2026-08-26',
      employeeId: 'dave',
      startTime: '09:00:00',
    })).toEqual({
      scheduled_date: '2026-08-26',
      assigned_team: ['dave'],
      start_time: '09:00:00',
      end_time: '11:00:00',
    });
  });

  it('clears crew when search-dropped on Unassigned', () => {
    expect(rescheduleJobPatch(crewJob, {
      date: '2026-08-26',
      employeeId: null,
    })).toEqual({
      scheduled_date: '2026-08-26',
      assigned_team: [],
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

  it('updates time and assigns the drop-row person', () => {
    expect(rescheduleJobPatch(crewJob, {
      date: '2026-08-20',
      employeeId: 'b',
      startTime: '13:00:00',
    })).toEqual({
      scheduled_date: '2026-08-20',
      assigned_team: ['b'],
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

describe('clipJobToVisibleHours', () => {
  it('places a job that ends exactly on the 5pm label inside the workday', () => {
    const box = clipJobToVisibleHours(16 * 60, 17 * 60, 7, 17, 96);
    expect(box.hidden).toBe(false);
    expect(box.clippedEnd).toBe(false);
    expect(box.left).toBe((16 - 7) * 96 + 2);
    expect(box.width).toBe(96 - 4);
    expect(box.left + box.width).toBeLessThanOrEqual((17 - 7) * 96);
  });

  it('keeps a job that spans 5pm on the board and marks the clipped end', () => {
    const box = clipJobToVisibleHours(15 * 60, 18 * 60, 7, 17, 96);
    expect(box.hidden).toBe(false);
    expect(box.clippedEnd).toBe(true);
    expect(box.left + box.width).toBeLessThanOrEqual(11 * 96);
  });

  it('clips a start before 7am to the first visible column', () => {
    const box = clipJobToVisibleHours(5 * 60 + 30, 7 * 60 + 30, 7, 17, 96);
    expect(box.hidden).toBe(false);
    expect(box.clippedStart).toBe(true);
    expect(box.left).toBe(2);
  });

  it('keeps a stub for a job that starts after the extended window', () => {
    const box = clipJobToVisibleHours(21 * 60, 22 * 60, 6, 20, 96);
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
