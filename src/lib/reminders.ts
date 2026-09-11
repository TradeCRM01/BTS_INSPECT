import { addDays, differenceInCalendarDays, format, startOfDay } from 'date-fns';
import { supabase } from './supabase';
import { formatJobRef } from './jobRef';

export const REMINDER_TABLE = 'agent_reminders';

export const REMINDER_COLUMNS =
  'id, company_id, user_id, title, details, due_date, related_type, related_id, completed, completed_at, visibility, tagged_user_ids, created_at, updated_at';

export const REMINDER_EMPTY = 'Write what you need to remember.';
export const REMINDER_NOT_SIGNED_IN = 'Not signed in';
export const REMINDER_NOT_YOURS = 'This reminder is not yours to see.';
export const REMINDER_SAVED = 'Reminder saved';
export const REMINDER_DELETED = 'Reminder deleted';
export const REMINDER_DUE_HOUR = 8;
export const REMINDER_LATER_TODAY_HOURS = 3;

export type ReminderVisibility = 'private' | 'company';

export type ReminderRow = {
  id: string;
  company_id: string;
  user_id: string | null;
  title: string;
  details: string | null;
  due_date: string | null;
  related_type: string | null;
  related_id: string | null;
  completed: boolean;
  completed_at: string | null;
  visibility: ReminderVisibility;
  tagged_user_ids: string[] | null;
  created_at: string;
  updated_at: string;
};

export type Reminder = {
  id: string;
  ownerId: string | null;
  title: string;
  details: string;
  dueAt: string | null;
  jobId: string | null;
  completed: boolean;
  completedAt: string | null;
  visibility: ReminderVisibility;
  taggedUserIds: string[];
  createdAt: string;
};

export type ReminderList = 'upcoming' | 'completed';
export type ReminderScope = 'all' | 'mine' | 'company' | 'tagged';
export type PostponeChoice = 'later_today' | 'tomorrow' | 'next_week';
export type ReminderDueBucket = 'overdue' | 'today' | 'tomorrow' | 'later';

export const REMINDER_LISTS: readonly { key: ReminderList; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
];

export const REMINDER_SCOPES: readonly { key: ReminderScope; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'Mine' },
  { key: 'company', label: 'Company' },
  { key: 'tagged', label: 'Tagged to me' },
];

export const POSTPONE_CHOICES: readonly { key: PostponeChoice; label: string }[] = [
  { key: 'later_today', label: 'Later today' },
  { key: 'tomorrow', label: 'Tomorrow 8:00 am' },
  { key: 'next_week', label: 'Next week' },
];

export const REMINDER_EMPTY_LIST: Record<ReminderList, string> = {
  upcoming: 'Nothing to remember. Add one above.',
  completed: 'Nothing ticked off yet.',
};

export type ReminderQuickCaptureRow = {
  company_id: string;
  user_id: string;
  title: string;
  visibility: 'private';
  tagged_user_ids: string[];
};

export type DecideQuickCapture =
  | { action: 'miss'; reason: 'empty' | 'not_signed_in'; message: string }
  | { action: 'insert'; row: ReminderQuickCaptureRow };

export type ReminderEdit = {
  title: string;
  details: string;
  jobId: string | null;
  dueAt: string | null;
  visibility: ReminderVisibility;
  taggedUserIds: string[];
};

export type ReminderSavePatch = {
  title: string;
  details: string | null;
  related_type: 'job' | null;
  related_id: string | null;
  due_date: string | null;
  visibility: ReminderVisibility;
  tagged_user_ids: string[];
  updated_at: string;
};

function trim(raw: string | null | undefined): string {
  return (raw ?? '').trim();
}

function millis(iso: string | null): number {
  return iso ? new Date(iso).getTime() : Number.NaN;
}

export function reminderFromRow(row: ReminderRow): Reminder {
  return {
    id: row.id,
    ownerId: row.user_id,
    title: row.title,
    details: row.details ?? '',
    dueAt: row.due_date,
    jobId: row.related_type === 'job' ? row.related_id : null,
    completed: row.completed,
    completedAt: row.completed_at,
    visibility: row.visibility,
    taggedUserIds: row.tagged_user_ids ?? [],
    createdAt: row.created_at,
  };
}

export function decideQuickCapture(input: {
  companyId: string | null | undefined;
  userId: string | null | undefined;
  title: string | null | undefined;
}): DecideQuickCapture {
  const title = trim(input.title);
  if (!title) return { action: 'miss', reason: 'empty', message: REMINDER_EMPTY };
  const companyId = trim(input.companyId);
  const userId = trim(input.userId);
  if (!companyId || !userId) {
    return { action: 'miss', reason: 'not_signed_in', message: REMINDER_NOT_SIGNED_IN };
  }
  return {
    action: 'insert',
    row: { company_id: companyId, user_id: userId, title, visibility: 'private', tagged_user_ids: [] },
  };
}

export function reminderSavePatch(edit: ReminderEdit, now = new Date()): ReminderSavePatch {
  const title = trim(edit.title);
  if (!title) throw new Error(REMINDER_EMPTY);
  const jobId = trim(edit.jobId) || null;
  return {
    title,
    details: trim(edit.details) || null,
    related_type: jobId ? 'job' : null,
    related_id: jobId,
    due_date: edit.dueAt,
    visibility: edit.visibility,
    tagged_user_ids: [...new Set(edit.taggedUserIds.map(id => trim(id)).filter(Boolean))],
    updated_at: now.toISOString(),
  };
}

/** Same predicate as the RLS SELECT policy, minus the company match the query already applies. */
export function canSeeReminder(r: Pick<Reminder, 'visibility' | 'ownerId' | 'taggedUserIds'>, userId: string): boolean {
  return r.visibility === 'company' || r.ownerId === userId || r.taggedUserIds.includes(userId);
}

/** Mirrors the UPDATE policy: the owner or a tagged teammate may tick it done. Company viewers read. */
export function canTickReminder(r: Pick<Reminder, 'ownerId' | 'taggedUserIds'>, userId: string): boolean {
  return r.ownerId === userId || r.taggedUserIds.includes(userId);
}

/** Mirrors the tick-only trigger: text, job, details, date, visibility and tags are the owner's. */
export function canEditReminder(r: Pick<Reminder, 'ownerId'>, userId: string): boolean {
  return r.ownerId === userId;
}

export type ReminderAccess = 'owner' | 'tagged' | 'viewer';

export function reminderAccess(r: Pick<Reminder, 'ownerId' | 'taggedUserIds'>, userId: string): ReminderAccess {
  if (canEditReminder(r, userId)) return 'owner';
  if (canTickReminder(r, userId)) return 'tagged';
  return 'viewer';
}

export const REMINDER_ACCESS_NOTE: Record<Exclude<ReminderAccess, 'owner'>, (ownerName: string) => string> = {
  tagged: owner => `${owner} tagged you. You can mark it done; only ${owner} can edit it.`,
  viewer: owner => `${owner} shared this with the company. Only ${owner} can edit or tick it.`,
};

const SCOPE_PREDICATE: Record<ReminderScope, (r: Reminder, userId: string) => boolean> = {
  all: canSeeReminder,
  mine: (r, userId) => r.ownerId === userId,
  company: r => r.visibility === 'company',
  tagged: (r, userId) => r.taggedUserIds.includes(userId),
};

export function reminderInScope(r: Reminder, scope: ReminderScope, userId: string): boolean {
  return SCOPE_PREDICATE[scope](r, userId);
}

function byDueAsc(a: Reminder, b: Reminder): number {
  return millis(a.dueAt) - millis(b.dueAt);
}

function byCreatedDesc(a: Reminder, b: Reminder): number {
  return millis(b.createdAt) - millis(a.createdAt);
}

function byCompletedDesc(a: Reminder, b: Reminder): number {
  return millis(b.completedAt) - millis(a.completedAt);
}

function compareUpcoming(a: Reminder, b: Reminder): number {
  if (a.dueAt && b.dueAt) return byDueAsc(a, b);
  if (a.dueAt) return -1;
  if (b.dueAt) return 1;
  return byCreatedDesc(a, b);
}

export function splitReminderLists(list: Reminder[]): { upcoming: Reminder[]; completed: Reminder[] } {
  return {
    upcoming: list.filter(r => !r.completed).sort(compareUpcoming),
    completed: list.filter(r => r.completed).sort(byCompletedDesc),
  };
}

export function reminderDueBucket(dueAt: string | null, now: Date): ReminderDueBucket | null {
  if (!dueAt) return null;
  const days = differenceInCalendarDays(new Date(dueAt), now);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return 'later';
}

const DUE_LABEL: Record<ReminderDueBucket, (due: Date) => string> = {
  overdue: due => `Overdue · ${format(due, 'EEE d MMM')}`,
  today: due => `Today · ${format(due, 'h:mm aaa')}`,
  tomorrow: due => `Tomorrow · ${format(due, 'h:mm aaa')}`,
  later: due => `${format(due, 'EEE d MMM')} · ${format(due, 'h:mm aaa')}`,
};

export function reminderDueLabel(dueAt: string | null, now: Date): string | null {
  const bucket = reminderDueBucket(dueAt, now);
  return bucket && dueAt ? DUE_LABEL[bucket](new Date(dueAt)) : null;
}

function atDueHour(day: Date): Date {
  const at = startOfDay(day);
  at.setHours(REMINDER_DUE_HOUR, 0, 0, 0);
  return at;
}

const POSTPONE: Record<PostponeChoice, (now: Date) => Date> = {
  later_today: now => {
    const at = new Date(now.getTime());
    at.setHours(at.getHours() + REMINDER_LATER_TODAY_HOURS);
    if (at.getMinutes() || at.getSeconds() || at.getMilliseconds()) {
      at.setHours(at.getHours() + 1, 0, 0, 0);
    }
    return at;
  },
  tomorrow: now => atDueHour(addDays(now, 1)),
  next_week: now => atDueHour(addDays(now, 7)),
};

export function postponeTo(choice: PostponeChoice, now: Date): Date {
  return POSTPONE[choice](now);
}

/** Overdue first, then due today, then undated newest first. Nothing dated past today. */
export function todayReminders(upcoming: Reminder[], now: Date, limit = 5): Reminder[] {
  const overdue: Reminder[] = [];
  const today: Reminder[] = [];
  const undated: Reminder[] = [];
  for (const r of upcoming) {
    const bucket = reminderDueBucket(r.dueAt, now);
    if (bucket === null) undated.push(r);
    else if (bucket === 'overdue') overdue.push(r);
    else if (bucket === 'today') today.push(r);
  }
  return [
    ...overdue.sort(byDueAsc),
    ...today.sort(byDueAsc),
    ...undated.sort(byCreatedDesc),
  ].slice(0, limit);
}

export function reminderVisibilityNote(
  r: Pick<Reminder, 'visibility' | 'taggedUserIds'>,
  companyName: string | null | undefined,
): string {
  if (r.visibility === 'company') {
    const name = trim(companyName);
    return name
      ? `Everyone at ${name} can see this reminder`
      : 'Everyone in your company can see this reminder';
  }
  const tagged = r.taggedUserIds.length;
  if (tagged === 0) return 'Only you can see this reminder';
  const teammates = tagged === 1 ? '1 tagged teammate' : `${tagged} tagged teammates`;
  return `Only you and ${teammates} can see this reminder`;
}

export function formatReminderJobOption(job: { job_number: number | null; title: string }): string {
  return `${formatJobRef(job)} · ${job.title}`;
}

/** One meta line under the title: job, due, owner when not mine, and the Company word. */
export function reminderMetaLine(parts: {
  jobLabel: string | null | undefined;
  dueLabel: string | null | undefined;
  ownerName: string | null | undefined;
  isMine: boolean;
  visibility: ReminderVisibility;
}): string {
  return [
    trim(parts.jobLabel),
    trim(parts.dueLabel),
    parts.isMine ? '' : trim(parts.ownerName),
    parts.visibility === 'company' ? 'Company' : '',
  ].filter(Boolean).join(' · ');
}

export function reminderInitials(name: string | null | undefined): string {
  const words = trim(name).split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words.slice(0, 2).map(word => word[0].toUpperCase()).join('');
}

/** The edit page's date + time inputs as one ISO instant. Date alone lands at 08:00 local. */
export function reminderDueFromInputs(date: string, time: string): string | null {
  const day = trim(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [y, m, d] = day.split('-').map(Number);
  const clock = /^(\d{2}):(\d{2})/.exec(trim(time));
  const hours = clock ? Number(clock[1]) : REMINDER_DUE_HOUR;
  const minutes = clock ? Number(clock[2]) : 0;
  return new Date(y, m - 1, d, hours, minutes, 0, 0).toISOString();
}

export function reminderDueInputs(dueAt: string | null): { date: string; time: string } {
  if (!dueAt) return { date: '', time: '' };
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return { date: '', time: '' };
  return { date: format(due, 'yyyy-MM-dd'), time: format(due, 'HH:mm') };
}

export type ReminderJobOption = { id: string; job_number: number | null; title: string };
export type ReminderCrewMember = { id: string; name: string };

export function reminderJobLabels(jobs: ReminderJobOption[] | null | undefined): Map<string, string> {
  return new Map((jobs ?? []).map(job => [job.id, formatReminderJobOption(job)]));
}

export function reminderCrewNames(crew: { id: string; name?: string | null }[] | null | undefined): Map<string, string> {
  return new Map((crew ?? []).map(member => [member.id, trim(member.name) || 'Teammate']));
}

export async function listReminderJobs(companyId: string): Promise<ReminderJobOption[]> {
  const { data, error } = await supabase
    .from('jobs')
    .select('id, job_number, title')
    .eq('company_id', companyId)
    .order('job_number', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ReminderJobOption[];
}

export async function listReminderJobsById(ids: string[]): Promise<ReminderJobOption[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('jobs')
    .select('id, job_number, title')
    .in('id', ids);
  if (error) throw error;
  return (data ?? []) as ReminderJobOption[];
}

export async function listReminderCrew(companyId: string): Promise<ReminderCrewMember[]> {
  const { data, error } = await supabase.rpc('get_company_members', { p_company_id: companyId });
  if (error) throw error;
  return ((data ?? []) as { id: string; name: string | null }[]).map(member => ({
    id: member.id,
    name: (member.name ?? '').trim() || 'Teammate',
  }));
}

export async function listReminders(companyId: string): Promise<Reminder[]> {
  const { data, error } = await supabase
    .from(REMINDER_TABLE)
    .select(REMINDER_COLUMNS)
    .eq('company_id', companyId)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as ReminderRow[]).map(reminderFromRow);
}

export async function getReminder(id: string): Promise<Reminder | null> {
  const { data, error } = await supabase
    .from(REMINDER_TABLE)
    .select(REMINDER_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? reminderFromRow(data as unknown as ReminderRow) : null;
}

export async function quickCaptureReminder(input: {
  companyId: string | null | undefined;
  userId: string | null | undefined;
  title: string | null | undefined;
}): Promise<Reminder> {
  const decision = decideQuickCapture(input);
  if (decision.action === 'miss') throw new Error(decision.message);
  const { data, error } = await supabase
    .from(REMINDER_TABLE)
    .insert(decision.row as never)
    .select(REMINDER_COLUMNS)
    .single();
  if (error) throw error;
  return reminderFromRow(data as unknown as ReminderRow);
}

export async function saveReminder(id: string, edit: ReminderEdit): Promise<Reminder> {
  const { data, error } = await supabase
    .from(REMINDER_TABLE)
    .update(reminderSavePatch(edit) as never)
    .eq('id', id)
    .select(REMINDER_COLUMNS)
    .single();
  if (error) throw error;
  return reminderFromRow(data as unknown as ReminderRow);
}

export async function setReminderDone(id: string, done: boolean): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from(REMINDER_TABLE)
    .update({ completed: done, completed_at: done ? now : null, updated_at: now } as never)
    .eq('id', id);
  if (error) throw error;
}

export async function postponeReminder(id: string, choice: PostponeChoice, now = new Date()): Promise<void> {
  const { error } = await supabase
    .from(REMINDER_TABLE)
    .update({ due_date: postponeTo(choice, now).toISOString(), updated_at: now.toISOString() } as never)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteReminder(id: string): Promise<void> {
  const { error } = await supabase.from(REMINDER_TABLE).delete().eq('id', id);
  if (error) throw error;
}
