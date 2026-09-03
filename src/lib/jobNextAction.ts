import type { JobStatus } from '../types/crm';
import { effectiveInvoiceStatus } from './invoiceStatus';
import {
  ARRIVING_NEXT_LABEL,
  CLOCK_IN_NEXT_LABEL,
  PHONE_NEXT_LABEL,
  VAN_TIME_ZONE,
  isJobArrivingWindow,
  todayYmd,
  withReminderNext,
} from './jobReminder';

export type JobActionKey =
  | 'schedule'
  | 'crew'
  | 'arriving'
  | 'phone'
  | 'jha'
  | 'inspect'
  | 'invoice'
  | 'send'
  | 'clock'
  | 'none';

export type JobPhoneRowKind = 'none' | 'tel' | 'edit';

export type JobListBucket = 'needs_date' | 'on_board' | 'upcoming' | 'closed';

export type JobActionContext = {
  status: JobStatus;
  scheduledDate: string | null | undefined;
  crewCount: number;
  jhaCount: number;
  inspectionCount: number;
  invoiceCount: number;
  /** Draft on this job, and none sent / paid / overdue. Optional for older callers. */
  hasDraftInvoice?: boolean;
  /** Sent, paid, or overdue already exists on this job. Optional for older callers. */
  hasIssuedInvoice?: boolean;
  hasAcceptedQuote: boolean;
  hasBillLines: boolean;
  clockedOn: boolean;
  /** Closed timesheet on this job — the van has clocked off. Optional for older callers. */
  clockedOff?: boolean;
  /** Same-day / in_progress arriving window. Optional — derived from Australia/Brisbane today. */
  arrivingWindow?: boolean;
  /** Session: arriving tap already sent on this sheet. Optional. */
  arrivingSent?: boolean;
  /** jobClientPhoneRow kind. Optional — missing phone only matters in arrivingWindow. */
  phoneRowKind?: JobPhoneRowKind;
  /** Stored phone on that row. Empty = still to write; non-empty invalid = not sendable. */
  phoneStored?: string | null;
};

export type JobInvoiceNextRow = {
  id?: string;
  status: string;
  due_date?: string | null;
};

export type JobInvoiceActionFlags = {
  invoiceCount: number;
  hasDraftInvoice: boolean;
  hasIssuedInvoice: boolean;
};

/** Draft vs already-issued for job-sheet Next. Overdue counts as issued — chase stays off this control. */
export function jobInvoiceActionFlags(
  invoices: JobInvoiceNextRow[] | null | undefined,
  now = new Date(),
): JobInvoiceActionFlags {
  const rows = invoices ?? [];
  let hasDraftInvoice = false;
  let hasIssuedInvoice = false;
  for (const inv of rows) {
    const status = effectiveInvoiceStatus(inv, now);
    if (status === 'draft') hasDraftInvoice = true;
    else if (status === 'sent' || status === 'paid' || status === 'overdue') hasIssuedInvoice = true;
  }
  return { invoiceCount: rows.length, hasDraftInvoice, hasIssuedInvoice };
}

/**
 * The draft this job-sheet Send should deliver. Null when none, or when
 * a sent / paid / overdue invoice already exists (chase stays on the invoice sheet).
 */
export function pickJobDraftToSend<T extends JobInvoiceNextRow & { id: string }>(
  invoices: T[] | null | undefined,
  now = new Date(),
): T | null {
  const rows = invoices ?? [];
  const flags = jobInvoiceActionFlags(rows, now);
  if (flags.hasIssuedInvoice || !flags.hasDraftInvoice) return null;
  return rows.find(inv => effectiveInvoiceStatus(inv, now) === 'draft') ?? null;
}

function jobHasUnsentDraftOnly(ctx: JobActionContext): boolean {
  return ctx.hasDraftInvoice === true && ctx.hasIssuedInvoice !== true;
}

/** After the van clocked off (not still clocked on). JHA / Take 5 stay on the job — they are not the Next gate. */
function jobHasClockedOff(ctx: JobActionContext): boolean {
  return ctx.clockedOff === true && ctx.clockedOn !== true;
}

function jobInvoiceNext(ctx: JobActionContext): RecommendedJobAction {
  return {
    key: 'invoice',
    label: 'Invoice',
    detail: ctx.hasAcceptedQuote
      ? 'Accepted quote is ready to invoice.'
      : 'Invoice from the job bill.',
  };
}

function jobSendNext(): RecommendedJobAction {
  return {
    key: 'send',
    label: 'Send',
    detail: 'Email this invoice to the client. Status becomes sent only if it delivers.',
  };
}

export type RecommendedJobAction = {
  key: JobActionKey;
  label: string;
  detail: string;
};

function dateOnly(isoDate: string): string {
  return isoDate.slice(0, 10);
}

function vanTodayYmd(now = new Date()): string {
  return todayYmd(now, VAN_TIME_ZONE);
}

export function jobListBucket(
  job: { status: JobStatus; scheduled_date: string | null | undefined },
  now = new Date(),
): JobListBucket {
  if (job.status === 'completed' || job.status === 'cancelled') return 'closed';
  if (!job.scheduled_date) return 'needs_date';
  const day = dateOnly(job.scheduled_date);
  const today = vanTodayYmd(now);
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
  const today = vanTodayYmd(now);
  if (day === today) return 'Today';
  if (day < today) return 'Still open';
  return 'Scheduled';
}

export type JobListNext = {
  href: string;
  label: string;
  /** Closed / done labels stay on the card; they are not a Next control. */
  actionable: boolean;
};

/** Where list Next (and the row) should land for this job. */
export function jobListNext(
  job: {
    id: string;
    status: JobStatus;
    scheduled_date: string | null | undefined;
    assigned_team?: string[] | null;
  },
  now = new Date(),
): JobListNext {
  const label = jobCardHint(job, now);
  if (label === 'Cancelled' || label === 'Completed') {
    return { href: `/jobs/${job.id}`, label, actionable: false };
  }
  if (label === 'Set a date' || label === 'Assign crew') {
    return { href: `/jobs/${job.id}#job-schedule`, label, actionable: true };
  }
  return { href: `/jobs/${job.id}`, label, actionable: true };
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

/**
 * Van Next in the arriving window: Arriving shortly when the number is
 * sendable; write the number via jobClientPhoneRow when it is empty;
 * Clock In after send or when there is no sendable phone left to write.
 * Date / crew stay first. Does not invent a second Next stack.
 */
export function recommendArrivingSheetNext(
  ctx: JobActionContext,
  now = new Date(),
): RecommendedJobAction | null {
  const arrivingWindow = ctx.arrivingWindow ?? isJobArrivingWindow({
    status: ctx.status,
    scheduled_date: ctx.scheduledDate,
  }, now);
  if (jobHasClockedOff(ctx)) return null;
  if (!arrivingWindow) return null;
  if (ctx.status !== 'scheduled' && ctx.status !== 'in_progress') return null;
  const kind = ctx.phoneRowKind;
  const stored = (ctx.phoneStored ?? '').trim();
  if (!ctx.arrivingSent) {
    if (kind === 'edit' && !stored) {
      return {
        key: 'phone',
        label: PHONE_NEXT_LABEL,
        detail: 'Write the client number so Arriving shortly can send.',
      };
    }
    if (kind === 'tel') {
      return {
        key: 'arriving',
        label: ARRIVING_NEXT_LABEL,
        detail: 'Tell the client you are arriving shortly.',
      };
    }
  }
  if (!ctx.clockedOn) {
    return {
      key: 'clock',
      label: CLOCK_IN_NEXT_LABEL,
      detail: 'Clock in when you start work.',
    };
  }
  return null;
}

export function recommendJobAction(ctx: JobActionContext, now = new Date()): RecommendedJobAction {
  if (ctx.status === 'cancelled') {
    return { key: 'none', label: 'Cancelled', detail: 'This job is cancelled.' };
  }
  if (ctx.status === 'completed' && ctx.invoiceCount > 0 && !jobHasUnsentDraftOnly(ctx)) {
    return { key: 'none', label: 'Invoiced', detail: 'This job is complete and invoiced.' };
  }
  if (!ctx.scheduledDate) {
    return { key: 'schedule', label: 'Set a date', detail: 'Put it on the board so the crew can see it.' };
  }
  if (ctx.crewCount === 0) {
    return { key: 'crew', label: 'Assign crew', detail: 'Who is going to this job?' };
  }
  const arrivingNext = recommendArrivingSheetNext(ctx, now);
  if (arrivingNext) return arrivingNext;
  if (jobHasClockedOff(ctx) && jobHasUnsentDraftOnly(ctx)) {
    return jobSendNext();
  }
  if (jobHasClockedOff(ctx) && ctx.invoiceCount === 0) {
    return jobInvoiceNext(ctx);
  }
  if (ctx.jhaCount === 0 && ctx.status !== 'completed' && !jobHasClockedOff(ctx)) {
    return { key: 'jha', label: 'Start JHA', detail: 'Do the JHA before anyone starts on site.' };
  }
  if (ctx.inspectionCount === 0 && ctx.status !== 'completed' && !jobHasClockedOff(ctx)) {
    return { key: 'inspect', label: 'Start inspection', detail: 'Start the inspection for this job.' };
  }
  if (ctx.invoiceCount === 0 && (ctx.hasAcceptedQuote || ctx.hasBillLines || ctx.status === 'completed')) {
    return jobInvoiceNext(ctx);
  }
  if (jobHasUnsentDraftOnly(ctx)) {
    return jobSendNext();
  }
  if (!ctx.clockedOn && !jobHasClockedOff(ctx) && (ctx.status === 'scheduled' || ctx.status === 'in_progress')) {
    return { key: 'clock', label: 'Clock on', detail: 'Clock on when you start work.' };
  }
  if (ctx.status === 'completed') {
    return { key: 'none', label: 'Complete', detail: 'Work is marked complete.' };
  }
  return { key: 'none', label: 'On track', detail: 'Crew and paperwork are in place.' };
}

export type JobOpenNextJob = {
  id: string;
  status: JobStatus;
  scheduled_date: string | null | undefined;
  assigned_team?: string[] | null;
};

export type JobOpenNextSheet = Omit<JobActionContext, 'status' | 'scheduledDate' | 'crewCount'>;

export type JobOpenNext = JobListNext & { action: RecommendedJobAction };

/**
 * One Next for the jobs list card and the open job sheet.
 * Card is the source of truth. Scheduled today (Australia/Brisbane) is
 * Arriving shortly, then Clock In. After the van clocked off, Next is Invoice
 * (or Send if a draft exists) — JHA / Take 5 stay on the job.
 */
export function jobOpenNext(
  job: JobOpenNextJob,
  sheet?: JobOpenNextSheet,
  now = new Date(),
): JobOpenNext {
  const list = withReminderNext(job, jobListNext(job, now), now);
  const arrivingWindow = sheet?.arrivingWindow ?? isJobArrivingWindow(job, now);
  const action = recommendJobAction({
    status: job.status,
    scheduledDate: job.scheduled_date,
    crewCount: (job.assigned_team ?? []).length,
    jhaCount: sheet?.jhaCount ?? 0,
    inspectionCount: sheet?.inspectionCount ?? 0,
    invoiceCount: sheet?.invoiceCount ?? 0,
    hasDraftInvoice: sheet?.hasDraftInvoice,
    hasIssuedInvoice: sheet?.hasIssuedInvoice,
    hasAcceptedQuote: sheet?.hasAcceptedQuote ?? false,
    hasBillLines: sheet?.hasBillLines ?? false,
    clockedOn: sheet?.clockedOn ?? false,
    clockedOff: sheet?.clockedOff,
    arrivingWindow,
    arrivingSent: sheet?.arrivingSent,
    phoneRowKind: sheet?.phoneRowKind,
    phoneStored: sheet?.phoneStored,
  }, now);
  const wrapped = withReminderNext(job, {
    href: `/jobs/${job.id}`,
    label: action.label,
    actionable: action.key !== 'none',
  }, now);

  if (!sheet) return { ...list, action };

  if (
    (action.key === 'jha' || action.key === 'inspect')
    && wrapped.label !== list.label
  ) {
    const remind = list.label === 'Remind client';
    return {
      ...list,
      action: {
        key: remind ? 'schedule' : 'none',
        label: list.label,
        detail: remind
          ? 'Remind the client they are booked tomorrow.'
          : 'This job is not today\'s van work.',
      },
    };
  }

  return { ...wrapped, action };
}
