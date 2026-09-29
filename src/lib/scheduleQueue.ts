export type ScheduleQueueKind = 'no_date' | 'hard' | 'unassigned' | 'needs_resources';

export type ScheduleQueueJob = {
  id: string;
  scheduled_date?: string | null;
  assigned_team?: string[] | null;
  dispatchTone?: 'hard' | 'soft' | 'override' | null;
  dispatchBadge?: string | null;
};

export type ScheduleQueueGroup<T extends ScheduleQueueJob> = {
  kind: ScheduleQueueKind;
  label: string;
  jobs: T[];
};

/** One group per job. Priority: no date, hard block, unassigned, then soft/override. */
export function buildScheduleQueue<T extends ScheduleQueueJob>(
  needsDate: T[],
  onBoard: T[],
): ScheduleQueueGroup<T>[] {
  const seen = new Set<string>();
  const take = (jobs: T[]) => jobs.filter(j => {
    if (seen.has(j.id)) return false;
    seen.add(j.id);
    return true;
  });

  const noDate = take(needsDate);
  const hard = take(onBoard.filter(j => j.dispatchTone === 'hard'));
  const unassigned = take(onBoard.filter(j => !(j.assigned_team ?? []).length));
  const needsResources = take(onBoard.filter(j =>
    j.dispatchTone === 'soft' || j.dispatchTone === 'override' || !!j.dispatchBadge,
  ));

  return [
    { kind: 'no_date', label: 'No date', jobs: noDate },
    { kind: 'hard', label: 'Blocked', jobs: hard },
    { kind: 'unassigned', label: 'Unassigned', jobs: unassigned },
    { kind: 'needs_resources', label: 'Needs resources', jobs: needsResources },
  ];
}

export function scheduleQueueCount<T extends ScheduleQueueJob>(groups: ScheduleQueueGroup<T>[]): number {
  return groups.reduce((n, g) => n + g.jobs.length, 0);
}
