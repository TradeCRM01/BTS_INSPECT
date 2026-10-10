import { telHref } from './clientRecords';
import { supabase } from './supabase';
import { formatEnquiryTime, tenantTodayYmd } from './tenantTimeZone';

export const ENQUIRIES_VIEW = 'enquiries';
export const ENQUIRIES_HREF = '/jobs?view=enquiries';
export const ENQUIRY_LOOK = 'enquiries';
export const ENQUIRY_EMPTY_LOOK = 'enquiries-empty';
export const ENQUIRY_ONE_LOOK = 'enquiries-one';
export const ENQUIRY_HIDDEN_LOOK = 'jobs-prod-schema';
/** Off until PR-J applies the enquiry schema in production. */
export const ENQUIRY_SURFACE_LIVE = false;
export const ALLOWED_ENQUIRY_PHONE = '+61418893602';
export const ALREADY_APPROVED_TOAST = 'Already approved — opening the job';

export const ENQUIRY_STATES = ['no_reply', 'draft', 'approved', 'dismissed'] as const;
export type EnquiryState = (typeof ENQUIRY_STATES)[number];

export const ENQUIRY_STATE_LABELS: Record<EnquiryState, string> = {
  no_reply: 'No reply yet',
  draft: 'Draft',
  approved: 'Approved',
  dismissed: 'Dismissed',
};

export const DISMISS_REASONS = [
  { key: 'wrong_number', label: 'Wrong number' },
  { key: 'spam', label: 'Spam' },
  { key: 'already_handled', label: 'Already handled' },
  { key: 'other', label: 'Other' },
] as const;

export type DismissReason = (typeof DISMISS_REASONS)[number]['key'];

export type EnquiryStatus = 'draft' | 'approved' | 'dismissed';

export type EnquiryRow = {
  id: string;
  callerPhone: string;
  clientId: string | null;
  clientName: string | null;
  missedCallAt: string;
  excerpt: string;
  suburb: string;
  transcript: string;
  state: EnquiryState;
  enquiryStatus: EnquiryStatus;
  approvedJobId: string | null;
};

export type EnquiryJobDraft = {
  title: string;
  description: string | null;
  client_id: string | null;
  address: string | null;
};

export function isEnquiriesView(view: string | null | undefined): boolean {
  return view === ENQUIRIES_VIEW;
}

export function enquiryLookKind(
  look: string | null | undefined,
): 'list' | 'empty' | 'one' | null {
  if (!import.meta.env.DEV) return null;
  if (look === ENQUIRY_LOOK) return 'list';
  if (look === ENQUIRY_EMPTY_LOOK) return 'empty';
  if (look === ENQUIRY_ONE_LOOK) return 'one';
  return null;
}

export function formatAuMobileDisplay(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.startsWith('61') && digits.length === 11) {
    const local = `0${digits.slice(2)}`;
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
  }
  if (digits.startsWith('04') && digits.length === 10) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  return null;
}

export function enquiryCallback(
  phone: string | null | undefined,
): { href: string; label: string } | null {
  const raw = phone?.trim() ?? '';
  if (!raw) return null;
  const href = telHref(raw);
  const label = formatAuMobileDisplay(raw);
  if (!href || !label) return null;
  return { href, label };
}

export function enquirySurfaceOpen(look: string | null | undefined): boolean {
  return enquiryLookKind(look) != null || ENQUIRY_SURFACE_LIVE;
}

export function shouldQueryLiveEnquiries(input: {
  look?: string | null;
  view?: string | null;
}): boolean {
  if (enquiryLookKind(input.look)) return false;
  if (!enquirySurfaceOpen(input.look)) return false;
  return isEnquiriesView(input.view);
}

export function enquiryJobPath(jobId: string | null | undefined): string | null {
  const id = jobId?.trim() ?? '';
  if (!id || id === '/' || id === 'jobs' || id === '/jobs' || id === '/jobs/') return null;
  return `/jobs/${id}`;
}

export function countEnquiriesToReview(
  rows: Array<{ enquiryStatus: string | null | undefined }>,
): number {
  return rows.filter((row) => row.enquiryStatus === 'draft').length;
}

export function enquiryState(input: {
  enquiryStatus: string | null | undefined;
  hasReply: boolean;
}): EnquiryState {
  if (input.enquiryStatus === 'approved') return 'approved';
  if (input.enquiryStatus === 'dismissed') return 'dismissed';
  return input.hasReply ? 'draft' : 'no_reply';
}

export function enquiryCallerLabel(input: {
  clientName?: string | null;
  callerPhone?: string | null;
}): string {
  const name = input.clientName?.trim();
  if (name) return name;
  return formatAuMobileDisplay(input.callerPhone) ?? 'Number withheld';
}

export function enquiryExcerpt(input: {
  replyBody?: string | null;
  jobService?: string | null;
}): string {
  const reply = input.replyBody?.trim();
  if (reply) return reply;
  return input.jobService?.trim() || '';
}

export function enquiryTitle(row: Pick<EnquiryRow, 'excerpt' | 'suburb'>): string {
  const excerpt = row.excerpt.trim();
  if (excerpt) return excerpt.slice(0, 80);
  const suburb = row.suburb.trim();
  if (suburb) return `Missed-call enquiry · ${suburb}`;
  return 'Missed-call enquiry';
}

export function countEnquiriesToday(
  rows: Array<{ missedCallAt: string }>,
  now: Date,
  timeZone?: string | null,
): number {
  const today = tenantTodayYmd(now, timeZone);
  return rows.filter((row) => tenantTodayYmd(new Date(row.missedCallAt), timeZone) === today).length;
}

export function enquiryWhisper(input: {
  busy: boolean;
  reviewCount: number;
  todayCount: number;
}): string {
  if (input.busy) return 'Loading…';
  return `${input.reviewCount} to review · ${input.todayCount} today`;
}

export function matchEnquiryClient(
  callerPhone: string | null | undefined,
  clients: Array<{ id: string; name: string | null; phone: string | null }>,
): { id: string; name: string } | null {
  const phone = callerPhone?.trim();
  if (!phone) return null;
  const matches = clients.filter((client) => (client.phone ?? '').trim() === phone);
  if (matches.length !== 1) return null;
  const name = matches[0].name?.trim();
  return name ? { id: matches[0].id, name } : { id: matches[0].id, name: phone };
}

export function reminderRelatedHref(
  relatedType: string | null | undefined,
  relatedId: string | null | undefined,
): string | null {
  if (relatedType === 'job' && relatedId) return `/jobs/${relatedId}`;
  if (relatedType === 'missed_call_sms_thread') return ENQUIRIES_HREF;
  return null;
}

export function approveEnquiryIdempotencyKey(threadId: string): string {
  return `approve:${threadId}`;
}

export function dismissEnquiryIdempotencyKey(threadId: string): string {
  return `dismiss:${threadId}`;
}

export async function approveMissedCallEnquiry(
  threadId: string,
  job: EnquiryJobDraft,
  idempotencyKey = approveEnquiryIdempotencyKey(threadId),
): Promise<{ jobId: string; replay?: boolean; alreadyDecided?: boolean }> {
  const { data, error } = await supabase.rpc('approve_missed_call_enquiry', {
    p_thread_id: threadId,
    p_job: job,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw error;
  const row = (data ?? {}) as {
    job_id?: string | null;
    replay?: boolean;
    already_decided?: boolean;
  };
  if (row.already_decided) {
    return { jobId: row.job_id ?? '', alreadyDecided: true };
  }
  if (!row.job_id) throw new Error('Approve did not return a job');
  return { jobId: row.job_id, replay: row.replay === true };
}

export async function dismissMissedCallEnquiry(
  threadId: string,
  reason: DismissReason,
  idempotencyKey = dismissEnquiryIdempotencyKey(threadId),
): Promise<void> {
  const { data, error } = await supabase.rpc('dismiss_missed_call_enquiry', {
    p_thread_id: threadId,
    p_reason: reason,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw error;
  const row = (data ?? {}) as { dismissed?: boolean; already_decided?: boolean };
  if (!row.dismissed && !row.already_decided) {
    throw new Error('Dismiss did not complete');
  }
}

export function formatEnquiryRowTime(
  missedCallAt: string,
  timeZone?: string | null,
): string {
  return formatEnquiryTime(missedCallAt, timeZone);
}
