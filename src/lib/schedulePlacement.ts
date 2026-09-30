export type PlacementWrite = {
  jobId: string;
  scheduled_date: string;
  start_time: string | null;
  end_time: string | null;
  assigned_team: string[];
};

export type PlacementDraftInput = PlacementWrite & {
  title?: string;
  start_time: string | null;
  end_time: string | null;
};

export const SCHEDULE_PLACEMENT_INVALIDATE_KEYS = [
  ['jobs'],
  ['job'],
  ['jobs-all'],
  ['jha-documents'],
  ['job-take5s'],
  ['jha-take5-all'],
  ['jha-take5-list'],
  ['schedule-job-search'],
  ['inspections'],
  ['inspection'],
  ['job-inspections'],
] as const;

export function placementWriteFromDraft(draft: PlacementDraftInput): PlacementWrite {
  return {
    jobId: draft.jobId,
    scheduled_date: draft.scheduled_date,
    start_time: draft.start_time || null,
    end_time: draft.end_time || null,
    assigned_team: [...draft.assigned_team],
  };
}

export function canSubmitPlacement(pending: boolean): boolean {
  return !pending;
}

export function applyPlacementToJobList<T extends { id: string }>(
  list: T[] | undefined,
  write: PlacementWrite,
): T[] {
  return (list ?? []).map(job => (
    job.id === write.jobId
      ? { ...job, ...write }
      : job
  ));
}

export function placementDraftAfterWrite<T>(ok: boolean, draft: T): T | null {
  return ok ? null : draft;
}

export async function runPlacementMutation<TJob extends { id: string }>(opts: {
  pending: boolean;
  list: TJob[] | undefined;
  draft: PlacementWrite;
  write: () => Promise<void>;
}): Promise<{
  submitted: boolean;
  list: TJob[] | undefined;
  closeDraft: boolean;
}> {
  if (!canSubmitPlacement(opts.pending)) {
    return { submitted: false, list: opts.list, closeDraft: false };
  }
  const snapshot = opts.list ? opts.list.map(job => ({ ...job })) : opts.list;
  const optimistic = applyPlacementToJobList(opts.list, opts.draft);
  try {
    await opts.write();
    return { submitted: true, list: optimistic, closeDraft: true };
  } catch {
    return { submitted: true, list: snapshot, closeDraft: false };
  }
}
