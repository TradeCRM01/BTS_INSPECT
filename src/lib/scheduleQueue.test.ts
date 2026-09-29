import { describe, expect, it } from 'vitest';
import { buildScheduleQueue, scheduleQueueCount, type ScheduleQueueJob } from './scheduleQueue';

describe('buildScheduleQueue', () => {
  it('groups by priority and does not duplicate a job', () => {
    const undated: ScheduleQueueJob[] = [{ id: 'a', scheduled_date: null, assigned_team: [] }];
    const groups = buildScheduleQueue(
      undated,
      [
        { id: 'b', scheduled_date: '2026-09-15', assigned_team: ['jack'], dispatchTone: 'hard', dispatchBadge: 'Needs qualified crew' },
        { id: 'c', scheduled_date: '2026-09-15', assigned_team: [] },
        { id: 'd', scheduled_date: '2026-09-15', assigned_team: ['jack'], dispatchTone: 'override', dispatchBadge: 'Override recorded' },
      ],
    );
    expect(groups.map(g => [g.kind, g.jobs.map(j => j.id)])).toEqual([
      ['no_date', ['a']],
      ['hard', ['b']],
      ['unassigned', ['c']],
      ['needs_resources', ['d']],
    ]);
    expect(scheduleQueueCount(groups)).toBe(4);
  });
});
