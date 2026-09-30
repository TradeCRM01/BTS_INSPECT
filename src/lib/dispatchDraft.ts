export type DispatchDraft = {
  date: string;
  start: string;
  end: string;
  team: string[];
};

export function toDispatchTimeInput(value: string | null | undefined): string {
  return (value ?? '').slice(0, 5);
}

export function dispatchDraftFromJob(job: {
  scheduled_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  assigned_team?: string[] | null;
}): DispatchDraft {
  return {
    date: job.scheduled_date ?? '',
    start: toDispatchTimeInput(job.start_time),
    end: toDispatchTimeInput(job.end_time),
    team: [...(job.assigned_team ?? [])],
  };
}

export function dispatchDraftsEqual(a: DispatchDraft, b: DispatchDraft): boolean {
  return a.date === b.date
    && a.start === b.start
    && a.end === b.end
    && a.team.join('\0') === b.team.join('\0');
}

export function reconcileDispatchDraft(args: {
  jobId: string;
  prevJobId: string;
  live: DispatchDraft;
  prevLive: DispatchDraft;
  draft: DispatchDraft;
}): { draft: DispatchDraft; baseline: DispatchDraft; conflict: boolean } {
  if (args.jobId !== args.prevJobId) {
    return { draft: args.live, baseline: args.live, conflict: false };
  }
  const dirty = !dispatchDraftsEqual(args.draft, args.prevLive);
  const liveChanged = !dispatchDraftsEqual(args.live, args.prevLive);
  if (!dirty) {
    return { draft: args.live, baseline: args.live, conflict: false };
  }
  if (liveChanged && !dispatchDraftsEqual(args.draft, args.live)) {
    return { draft: args.draft, baseline: args.prevLive, conflict: true };
  }
  return { draft: args.draft, baseline: args.prevLive, conflict: false };
}
