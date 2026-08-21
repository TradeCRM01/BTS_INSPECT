import type { JobStatus } from '../types/crm';

export const JOB_REMINDER_COLUMNS =
  'id, company_id, client_id, title, status, scheduled_date, start_time, end_time, address, job_number, client_reminder_sent_at, client_reminder_sent_for_date';

export const JOB_REMINDER_CLIENT_COLUMNS =
  'id, company_id, name, email, phone, contact_person';

export const JOB_REMINDER_SMTP_COLUMNS =
  'company_id, smtp_host, smtp_pass, from_name, from_email';

/** Company-local calendar. Edge runtime is UTC; Perth is UTC+8 year-round. */
export const COMPANY_TIME_ZONE = 'Australia/Perth';

export type ReminderMissReason =
  | 'no_email'
  | 'no_scheduled_date'
  | 'not_tomorrow'
  | 'no_smtp'
  | 'closed'
  | 'wrong_company'
  | 'no_job'
  | 'already_sent';

export type ReminderQueryScope = {
  table: 'jobs' | 'clients' | 'email_settings';
  columns: string;
  eq: Record<string, string>;
  inFilters: Record<string, string[]>;
};

export type ReminderJob = {
  id: string;
  company_id: string;
  client_id: string | null;
  title: string;
  status: JobStatus | string;
  scheduled_date: string | null | undefined;
  start_time?: string | null;
  end_time?: string | null;
  address?: string | null;
  job_number?: number | null;
  client_reminder_sent_at?: string | null;
  client_reminder_sent_for_date?: string | null;
};

export type ReminderClient = {
  id: string;
  company_id?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  contact_person?: string | null;
};

export type ReminderEmailSettings = {
  smtp_host?: string | null;
  smtp_pass?: string | null;
  from_name?: string | null;
  from_email?: string | null;
};

export type ReminderCompany = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
};

type FilterBuilder = {
  eq: (column: string, value: string) => FilterBuilder;
  in: (column: string, values: readonly string[]) => FilterBuilder;
};

export function dateOnly(isoDate: string | null | undefined): string | null {
  const day = (isoDate ?? '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

export function ymdInTimeZone(now: Date, timeZone = COMPANY_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  if (!y || !m || !d) {
    throw new Error(`Could not read calendar day in ${timeZone}`);
  }
  return `${y}-${m}-${d}`;
}

export function todayYmd(now = new Date(), timeZone = COMPANY_TIME_ZONE): string {
  return ymdInTimeZone(now, timeZone);
}

/** Perth calendar tomorrow — not the UTC date, not the runtime's local date. */
export function tomorrowYmd(now = new Date(), timeZone = COMPANY_TIME_ZONE): string {
  const today = ymdInTimeZone(now, timeZone);
  const [y, m, d] = today.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

export function formatJobDate(ymd: string): string {
  const day = dateOnly(ymd);
  if (!day) return ymd;
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function padJobNumber(n: number | null | undefined): string {
  return String(n ?? 0).padStart(4, '0');
}

export function jobLabel(job: Pick<ReminderJob, 'job_number' | 'title'>): string {
  const title = (job.title ?? '').trim() || 'Job';
  return job.job_number != null ? `#${padJobNumber(job.job_number)} ${title}` : title;
}

export function isOpenJobStatus(status: string | null | undefined): boolean {
  return status === 'scheduled' || status === 'in_progress';
}

export function isJobDueTomorrow(
  job: Pick<ReminderJob, 'scheduled_date' | 'status'>,
  now = new Date(),
): boolean {
  if (!isOpenJobStatus(job.status)) return false;
  const day = dateOnly(job.scheduled_date);
  return day === tomorrowYmd(now);
}

/** Client To: trimmed email or empty. Never invent an address. */
export function prefillReminderTo(client: ReminderClient | null | undefined): string {
  const email = (client?.email ?? '').trim();
  if (!email || !email.includes('@')) return '';
  return email;
}

export function emailSettingsReady(settings: ReminderEmailSettings | null | undefined): boolean {
  return !!settings
    && String(settings.smtp_host ?? '').toLowerCase().includes('resend')
    && !!(settings.smtp_pass ?? '').trim()
    && !!(settings.from_email ?? '').trim();
}

export function missMessage(reason: ReminderMissReason): string {
  switch (reason) {
    case 'no_email':
      return 'This client has no email — reminder was not sent.';
    case 'no_scheduled_date':
      return 'This job has no scheduled date — reminder was not sent.';
    case 'not_tomorrow':
      return 'Reminder is for jobs booked tomorrow.';
    case 'no_smtp':
      return 'Email is not set up.';
    case 'closed':
      return 'This job is closed — reminder was not sent.';
    case 'wrong_company':
      return 'This job is not in this company.';
    case 'no_job':
      return 'Job not found.';
    case 'already_sent':
      return 'Already reminded for this scheduled date.';
  }
}

export function reminderEligibility(args: {
  job: ReminderJob | null | undefined;
  client: ReminderClient | null | undefined;
  settings: ReminderEmailSettings | null | undefined;
  companyId: string;
  now?: Date;
}): { ok: true; to: string } | { ok: false; reason: ReminderMissReason; message: string; to: string | null } {
  const { job, client, settings, companyId } = args;
  const now = args.now ?? new Date();
  if (!job) return { ok: false, reason: 'no_job', message: missMessage('no_job'), to: null };
  if (job.company_id !== companyId) {
    return { ok: false, reason: 'wrong_company', message: missMessage('wrong_company'), to: null };
  }
  if (!isOpenJobStatus(job.status)) {
    return { ok: false, reason: 'closed', message: missMessage('closed'), to: prefillReminderTo(client) || null };
  }
  if (!dateOnly(job.scheduled_date)) {
    return { ok: false, reason: 'no_scheduled_date', message: missMessage('no_scheduled_date'), to: prefillReminderTo(client) || null };
  }
  if (!isJobDueTomorrow(job, now)) {
    return { ok: false, reason: 'not_tomorrow', message: missMessage('not_tomorrow'), to: prefillReminderTo(client) || null };
  }
  const to = prefillReminderTo(client);
  if (!to) {
    return { ok: false, reason: 'no_email', message: missMessage('no_email'), to: null };
  }
  if (!emailSettingsReady(settings)) {
    return { ok: false, reason: 'no_smtp', message: missMessage('no_smtp'), to };
  }
  return { ok: true, to };
}

/** Existing job schedule surface — not a new route. */
export function jobScheduleHref(jobId: string): string {
  return `/jobs/${encodeURIComponent(jobId)}#job-schedule`;
}

export function jobScheduleUrl(appUrl: string, jobId: string): string {
  const base = appUrl.replace(/\/$/, '');
  return `${base}${jobScheduleHref(jobId)}`;
}

export function jobRescheduleQueryHref(jobId: string): string {
  return `/jobs/${encodeURIComponent(jobId)}?reschedule=1#job-schedule`;
}

export function isExistingScheduleSurface(href: string): boolean {
  return /^\/jobs\/[^/]+(?:\?reschedule=1)?#job-schedule$/.test(href);
}

export function clientRescheduleMailto(args: {
  to: string;
  job: Pick<ReminderJob, 'id' | 'title' | 'job_number' | 'scheduled_date' | 'address'>;
  clientName?: string | null;
  appUrl: string;
}): string {
  const day = dateOnly(args.job.scheduled_date) ?? '';
  const when = day ? formatJobDate(day) : 'the booked day';
  const label = jobLabel(args.job);
  const site = (args.job.address ?? '').trim();
  const subject = `Reschedule request — ${label} on ${when}`;
  const body = [
    `Hi, I need to reschedule this visit.`,
    '',
    `Job: ${label}`,
    `Booked: ${when}`,
    site ? `Site: ${site}` : null,
    '',
    'Open the job schedule (no retype — the date is already on the job):',
    jobScheduleUrl(args.appUrl, args.job.id),
  ].filter(line => line !== null).join('\n');
  return `mailto:${encodeURIComponent(args.to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildReminderEmail(args: {
  job: ReminderJob;
  client: ReminderClient;
  company: ReminderCompany;
  settings: ReminderEmailSettings;
  appUrl: string;
  to: string;
}): {
  to: string;
  subject: string;
  html: string;
  text: string;
  rescheduleMailto: string;
  scheduleHref: string;
  scheduleUrl: string;
} {
  const day = dateOnly(args.job.scheduled_date) ?? '';
  const when = day ? formatJobDate(day) : 'tomorrow';
  const start = (args.job.start_time ?? '').slice(0, 5);
  const whenLine = start ? `${when} at ${start}` : when;
  const label = jobLabel(args.job);
  const site = (args.job.address ?? '').trim();
  const companyName = (args.company.name ?? '').trim() || 'us';
  const companyPhone = (args.company.phone ?? '').trim();
  const replyTo = (args.settings.from_email ?? args.company.email ?? '').trim();
  const greetingName = (args.client.contact_person || args.client.name || 'there').trim();
  const scheduleHref = jobScheduleHref(args.job.id);
  const scheduleUrl = jobScheduleUrl(args.appUrl, args.job.id);
  const rescheduleMailto = clientRescheduleMailto({
    to: replyTo || args.to,
    job: args.job,
    clientName: args.client.name,
    appUrl: args.appUrl,
  });

  const subject = `Reminder: ${label} is booked for tomorrow (${when})`;
  const text = [
    `Hi ${greetingName},`,
    '',
    `This is a reminder that ${companyName} is booked with you tomorrow.`,
    `Job: ${label}`,
    `When: ${whenLine}`,
    site ? `Site: ${site}` : null,
    '',
    'Need to reschedule? Reply and say you need a new day — the job number and date are already in this email.',
    `Or open: ${rescheduleMailto}`,
    '',
    companyPhone ? `Call: ${companyPhone}` : null,
  ].filter(line => line !== null).join('\n');

  const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A">
        <div style="background:#0A2540;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
          <div style="font-size:12px;opacity:.7;letter-spacing:1px;text-transform:uppercase">BTS Inspect</div>
          <h1 style="margin:8px 0 0;font-size:20px">Visit tomorrow</h1>
        </div>
        <div style="border:1px solid #E5E7EB;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p>Hi ${escapeHtml(greetingName)},</p>
          <p>${escapeHtml(companyName)} is booked with you <strong>tomorrow</strong>.</p>
          <div style="margin:20px 0;padding:16px;background:#F9FAFB;border-radius:8px">
            <p style="margin:0;color:#4A5568;font-size:14px;line-height:1.6">
              <strong>Job:</strong> ${escapeHtml(label)}<br/>
              <strong>When:</strong> ${escapeHtml(whenLine)}
              ${site ? `<br/><strong>Site:</strong> ${escapeHtml(site)}` : ''}
            </p>
          </div>
          <p>Need to reschedule? Tell us — the job and date are already filled in.</p>
          <p style="margin:24px 0">
            <a href="${escapeHtml(rescheduleMailto)}" style="background:#0A2540;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px;display:inline-block">
              I need to reschedule
            </a>
          </p>
          ${companyPhone ? `<p style="font-size:13px;color:#6B7280">Or call ${escapeHtml(companyPhone)}.</p>` : ''}
          <p style="font-size:12px;color:#6B7280">Reply to this email. The office will update the date on the job schedule.</p>
        </div>
      </div>`;

  return { to: args.to, subject, html, text, rescheduleMailto, scheduleHref, scheduleUrl };
}

export type ReminderDecision =
  | ({ send: true } & ReturnType<typeof buildReminderEmail>)
  | {
      send: false;
      reason: ReminderMissReason;
      message: string;
      to: string | null;
      scheduleHref: string | null;
    };

export function decideReminderSend(args: {
  job: ReminderJob | null | undefined;
  client: ReminderClient | null | undefined;
  settings: ReminderEmailSettings | null | undefined;
  company: ReminderCompany;
  companyId: string;
  appUrl: string;
  now?: Date;
}): ReminderDecision {
  const gate = reminderEligibility(args);
  const scheduleHref = args.job ? jobScheduleHref(args.job.id) : null;
  if (!gate.ok) {
    return { send: false, reason: gate.reason, message: gate.message, to: gate.to, scheduleHref };
  }
  return {
    send: true,
    ...buildReminderEmail({
      job: args.job!,
      client: args.client ?? { id: '', email: gate.to },
      company: args.company,
      settings: args.settings ?? {},
      appUrl: args.appUrl,
      to: gate.to,
    }),
  };
}

/**
 * Skip auto-mail when a successful send already covers this scheduled_date.
 * A later date change (sent_for_date !== scheduled_date) may send again.
 */
export function alreadyRemindedForScheduledDate(job: {
  scheduled_date?: string | null;
  client_reminder_sent_at?: string | null;
  client_reminder_sent_for_date?: string | null;
}): boolean {
  const day = dateOnly(job.scheduled_date);
  if (!day || !job.client_reminder_sent_at) return false;
  const sentFor = dateOnly(job.client_reminder_sent_for_date);
  if (sentFor) return sentFor === day;
  return true;
}

/** Status/sent only after a successful send. Tied to the booked date. */
export function reminderSuccessPatch(
  scheduledDate: string,
  sentAt = new Date(),
): { client_reminder_sent_at: string; client_reminder_sent_for_date: string | null } {
  return {
    client_reminder_sent_at: sentAt.toISOString(),
    client_reminder_sent_for_date: dateOnly(scheduledDate),
  };
}

export function shouldRecordReminderSent(sendOk: boolean): boolean {
  return sendOk === true;
}

export function tomorrowReminderQuery(args: {
  companyId: string;
  now?: Date;
}): ReminderQueryScope | null {
  const companyId = args.companyId.trim();
  if (!companyId) return null;
  return {
    table: 'jobs',
    columns: JOB_REMINDER_COLUMNS,
    eq: {
      company_id: companyId,
      scheduled_date: tomorrowYmd(args.now),
    },
    inFilters: { status: ['scheduled', 'in_progress'] },
  };
}

export function reminderClientsQuery(
  companyId: string,
  clientIds: Array<string | null | undefined>,
): ReminderQueryScope | null {
  const id = companyId.trim();
  const ids = [...new Set(clientIds.map(v => (v ?? '').trim()).filter(Boolean))];
  if (!id || ids.length === 0) return null;
  return {
    table: 'clients',
    columns: JOB_REMINDER_CLIENT_COLUMNS,
    eq: { company_id: id },
    inFilters: { id: ids },
  };
}

export function reminderEmailSettingsQuery(companyId: string): ReminderQueryScope | null {
  const id = companyId.trim();
  if (!id) return null;
  return {
    table: 'email_settings',
    columns: JOB_REMINDER_SMTP_COLUMNS,
    eq: { company_id: id },
    inFilters: {},
  };
}

export function applyReminderScope<T>(
  fromBuilder: { select: (columns: string) => T },
  scope: ReminderQueryScope,
): T {
  let q = fromBuilder.select(scope.columns) as T & FilterBuilder;
  for (const [column, value] of Object.entries(scope.eq)) {
    q = q.eq(column, value) as typeof q;
  }
  for (const [column, values] of Object.entries(scope.inFilters)) {
    q = q.in(column, values) as typeof q;
  }
  return q;
}

export function isReminderQueryScoped(scope: ReminderQueryScope | null): boolean {
  if (!scope) return false;
  if (!scope.eq.company_id) return false;
  if (scope.columns.trim() === '' || scope.columns.trim() === '*') return false;
  if (scope.table === 'jobs') return !!scope.eq.scheduled_date;
  return true;
}

/** True when a fetch would read the company ledger instead of tomorrow's jobs. */
export function wouldScanUnscopedJobs(scope: ReminderQueryScope | null): boolean {
  if (scope == null) return false;
  return !scope.eq.company_id || !scope.eq.scheduled_date;
}

export type TomorrowReminderPick = {
  selected: Array<{ job: ReminderJob; client: ReminderClient; to: string }>;
  missed: Array<{ job: ReminderJob; reason: ReminderMissReason; message: string }>;
};

/**
 * Who gets mailed. Defence in depth: even if a mixed ledger is passed,
 * only this company's open jobs due tomorrow with a client email are selected.
 */
export function selectTomorrowReminderJobs(
  jobs: ReminderJob[],
  clients: Map<string, ReminderClient> | ReminderClient[],
  companyId: string,
  now = new Date(),
): TomorrowReminderPick {
  const clientMap = clients instanceof Map
    ? clients
    : new Map(clients.map(c => [c.id, c]));
  const selected: TomorrowReminderPick['selected'] = [];
  const missed: TomorrowReminderPick['missed'] = [];
  const tomorrow = tomorrowYmd(now);

  for (const job of jobs) {
    if (job.company_id !== companyId) continue;
    if (dateOnly(job.scheduled_date) !== tomorrow) continue;
    if (!isOpenJobStatus(job.status)) {
      missed.push({ job, reason: 'closed', message: missMessage('closed') });
      continue;
    }
    if (alreadyRemindedForScheduledDate(job)) {
      missed.push({ job, reason: 'already_sent', message: missMessage('already_sent') });
      continue;
    }
    const client = job.client_id ? clientMap.get(job.client_id) ?? null : null;
    const to = prefillReminderTo(client);
    if (!to) {
      missed.push({ job, reason: 'no_email', message: missMessage('no_email') });
      continue;
    }
    selected.push({ job, client: client!, to });
  }

  return { selected, missed };
}

/**
 * Keep date/crew Next first. When the job is booked tomorrow, Next is the
 * existing schedule tray (where the reminder lives) — not a new route.
 */
export function withReminderNext<T extends {
  id: string;
  status: JobStatus | string;
  scheduled_date: string | null | undefined;
  assigned_team?: string[] | null;
}>(
  job: T,
  current: { href: string; label: string; actionable: boolean },
  now = new Date(),
): { href: string; label: string; actionable: boolean } {
  if (current.label === 'Set a date' || current.label === 'Assign crew') return current;
  if (!current.actionable) return current;
  if (!isJobDueTomorrow(job, now)) return current;
  return { href: jobScheduleHref(job.id), label: 'Remind client', actionable: true };
}

export type ReminderCaller =
  | { kind: 'user'; companyId: string }
  | { kind: 'cron' };

export function isCronAuthorized(args: {
  authHeader?: string | null;
  cronHeader?: string | null;
  serviceRoleKey?: string | null;
  cronSecret?: string | null;
}): boolean {
  const bearer = (args.authHeader ?? '').replace(/^Bearer\s+/i, '').trim();
  const service = (args.serviceRoleKey ?? '').trim();
  const secret = (args.cronSecret ?? '').trim();
  const cronH = (args.cronHeader ?? '').trim();
  if (service && bearer && bearer === service) return true;
  if (secret && bearer && bearer === secret) return true;
  if (secret && cronH && cronH === secret) return true;
  return false;
}

/**
 * jobId (manual tray) always needs a logged-in member.
 * due=tomorrow may be cron (no user JWT) or a member sending their company.
 */
export function resolveReminderCaller(args: {
  hasUser: boolean;
  userCompanyId?: string | null;
  cronAuthorized: boolean;
  jobId?: string;
  due?: string;
}): { ok: true; caller: ReminderCaller } | { ok: false; error: string } {
  const jobId = (args.jobId ?? '').trim();
  const due = (args.due ?? '').trim();
  if (jobId) {
    if (!args.hasUser || !args.userCompanyId) return { ok: false, error: 'Unauthorized' };
    return { ok: true, caller: { kind: 'user', companyId: args.userCompanyId } };
  }
  if (due === 'tomorrow') {
    if (args.cronAuthorized) return { ok: true, caller: { kind: 'cron' } };
    if (args.hasUser && args.userCompanyId) {
      return { ok: true, caller: { kind: 'user', companyId: args.userCompanyId } };
    }
    return { ok: false, error: 'Unauthorized' };
  }
  return { ok: false, error: 'jobId or due=tomorrow is required' };
}

export function cronEmailSettingsQuery(): ReminderQueryScope {
  return {
    table: 'email_settings',
    columns: JOB_REMINDER_SMTP_COLUMNS,
    eq: {},
    inFilters: {},
  };
}

export function parseMailto(href: string): { to: string; subject: string; body: string } | null {
  if (!href.startsWith('mailto:')) return null;
  try {
    const parsed = new URL(href);
    return {
      to: decodeURIComponent(parsed.pathname),
      subject: parsed.searchParams.get('subject') ?? '',
      body: parsed.searchParams.get('body') ?? '',
    };
  } catch {
    return null;
  }
}
