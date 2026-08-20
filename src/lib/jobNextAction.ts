import type { JobStatus } from '../types/crm';

export type JobActionKey = 'schedule' | 'crew' | 'jha' | 'inspect' | 'invoice' | 'clock' | 'none';

export type JobListBucket = 'needs_date' | 'on_board' | 'upcoming' | 'closed';

export type JobActionContext = {
  status: JobStatus;
  scheduledDate: string | null | undefined;
  crewCount: number;
  jhaCount: number;
  inspectionCount: number;
  invoiceCount: number;
  hasAcceptedQuote: boolean;
  hasBillLines: boolean;
  clockedOn: boolean;
};

export type RecommendedJobAction = {
  key: JobActionKey;
  label: string;
  detail: string;
};

function dateOnly(isoDate: string): string {
  return isoDate.slice(0, 10);
}

function todayYmd(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function jobListBucket(
  job: { status: JobStatus; scheduled_date: string | null | undefined },
  now = new Date(),
): JobListBucket {
  if (job.status === 'completed' || job.status === 'cancelled') return 'closed';
  if (!job.scheduled_date) return 'needs_date';
  const day = dateOnly(job.scheduled_date);
  const today = todayYmd(now);
  if (day > today) return 'upcoming';
  return 'on_board';
}

/** Short hint for jobs list cards — uses only fields already on the job row. */
export function jobCardHint(
  job: {
    status: JobStatus;
    scheduled_date: string | null | undefined;
    assigned_team?: string[] | null;
  },
  now = new Date(),
): string {
  if (job.status === 'cancelled') return 'Cancelled';
  if (job.status === 'completed') return 'Completed';
  if (!job.scheduled_date) return 'Set a date';
  if (!job.assigned_team?.length) return 'Assign crew';
  if (job.status === 'in_progress') return 'On site';
  const day = dateOnly(job.scheduled_date);
  const today = todayYmd(now);
  if (day === today) return 'Today';
  if (day < today) return 'Still open';
  return 'Scheduled';
}

/** Schedule-board chips only — date and crew, not JHA / inspect / invoice. */
export function boardDispatchHint(
  job: {
    status: JobStatus;
    scheduled_date: string | null | undefined;
    assigned_team?: string[] | null;
  },
  now = new Date(),
): 'Set a date' | 'Assign crew' | null {
  const hint = jobCardHint(job, now);
  if (hint === 'Set a date' || hint === 'Assign crew') return hint;
  return null;
}

export function partitionScheduleJobs<T extends {
  status: JobStatus;
  scheduled_date: string | null | undefined;
}>(jobs: T[], now = new Date()): { needsDate: T[]; onBoard: T[] } {
  const needsDate: T[] = [];
  const onBoard: T[] = [];
  for (const job of jobs) {
    const bucket = jobListBucket(job, now);
    if (bucket === 'needs_date') needsDate.push(job);
    else if (job.scheduled_date) onBoard.push(job);
  }
  return { needsDate, onBoard };
}

export function recommendJobAction(ctx: JobActionContext): RecommendedJobAction {
  if (ctx.status === 'cancelled') {
    return { key: 'none', label: 'Cancelled', detail: 'This job is cancelled.' };
  }
  if (ctx.status === 'completed' && ctx.invoiceCount > 0) {
    return { key: 'none', label: 'Invoiced', detail: 'This job is complete and invoiced.' };
  }
  if (!ctx.scheduledDate) {
    return { key: 'schedule', label: 'Set a date', detail: 'Put it on the board so the crew can see it.' };
  }
  if (ctx.crewCount === 0) {
    return { key: 'crew', label: 'Assign crew', detail: 'Who is going to this job?' };
  }
  if (ctx.jhaCount === 0 && ctx.status !== 'completed') {
    return { key: 'jha', label: 'Start JHA', detail: 'Do the JHA before anyone starts on site.' };
  }
  if (ctx.inspectionCount === 0 && ctx.status !== 'completed') {
    return { key: 'inspect', label: 'Start inspection', detail: 'Start the inspection for this job.' };
  }
  if (ctx.invoiceCount === 0 && (ctx.hasAcceptedQuote || ctx.hasBillLines || ctx.status === 'completed')) {
    return { key: 'invoice', label: 'Invoice', detail: ctx.hasAcceptedQuote
      ? 'Accepted quote is ready to invoice.'
      : 'Invoice from the job bill.' };
  }
  if (!ctx.clockedOn && (ctx.status === 'scheduled' || ctx.status === 'in_progress')) {
    return { key: 'clock', label: 'Clock on', detail: 'Clock on when you start work.' };
  }
  if (ctx.status === 'completed') {
    return { key: 'none', label: 'Complete', detail: 'Work is marked complete.' };
  }
  return { key: 'none', label: 'On track', detail: 'Crew and paperwork are in place.' };
}
