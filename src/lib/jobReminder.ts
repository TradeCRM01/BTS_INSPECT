import type { JobStatus } from '../types/crm';

export const JOB_REMINDER_COLUMNS =
  'id, company_id, client_id, title, status, scheduled_date, start_time, end_time, address, job_number, client_reminder_sent_at, client_reminder_sent_for_date';

export const JOB_REMINDER_CLIENT_COLUMNS =
  'id, company_id, name, email, phone, contact_person';

export const JOB_REMINDER_SMTP_COLUMNS =
  'company_id, smtp_host, smtp_pass, from_name, from_email';

/** Company-local calendar. Edge runtime is UTC; leftover Perth is cron / ICS only. */
export const COMPANY_TIME_ZONE = 'Australia/Perth';

/** Van / job-sheet “today”. Australia/Brisbane (UTC+10), not UTC and not leftover Perth. */
export const VAN_TIME_ZONE = 'Australia/Brisbane';

export type ReminderMissReason =
  | 'no_email'
  | 'no_scheduled_date'
  | 'not_tomorrow'
  | 'no_smtp'
  | 'closed'
  | 'wrong_company'
  | 'no_job'
  | 'already_sent';

/** SMS is beside email — these never flip email sent-at. */
export type SmsMissReason =
  | 'no_phone'
  | 'no_sms_credentials'
  | 'send_failed';

export type SmsCredentials = {
  accountSid?: string | null;
  authToken?: string | null;
  fromNumber?: string | null;
};

export type SmsDecision =
  | { send: true; to: string }
  | { send: false; reason: SmsMissReason; message: string; to: string | null };

export type SmsSendResult = {
  sent: boolean;
  to: string | null;
  reason?: SmsMissReason;
  message: string;
};

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
  return day === tomorrowYmd(now, VAN_TIME_ZONE);
}

export function isJobDueToday(
  job: Pick<ReminderJob, 'scheduled_date' | 'status'>,
  now = new Date(),
): boolean {
  if (!isOpenJobStatus(job.status)) return false;
  const day = dateOnly(job.scheduled_date);
  return day === todayYmd(now, VAN_TIME_ZONE);
}

/**
 * Same-day arriving Next: booked today in Australia/Brisbane, or already
 * in_progress (not tomorrow — that stays Remind client, not upcoming).
 */
export function isJobArrivingWindow(
  job: Pick<ReminderJob, 'scheduled_date' | 'status'>,
  now = new Date(),
): boolean {
  if (!isOpenJobStatus(job.status)) return false;
  if (isJobDueTomorrow(job, now)) return false;
  if (isJobDueToday(job, now)) return true;
  if (job.status !== 'in_progress') return false;
  const day = dateOnly(job.scheduled_date);
  if (!day) return false;
  return day < todayYmd(now, VAN_TIME_ZONE);
}

export const ARRIVING_PURPOSE = 'arriving';
export const ARRIVING_NEXT_LABEL = 'Arriving shortly';
/** Sheet primary after arriving is sent, or when there is no sendable phone left to write. */
export const CLOCK_IN_NEXT_LABEL = 'Clock In';
/** Sheet primary in the arriving window when jobClientPhoneRow still needs a number. */
export const PHONE_NEXT_LABEL = 'Add phone';

export type ArrivingMissReason =
  | 'no_client'
  | 'no_phone'
  | 'no_sms_credentials'
  | 'closed'
  | 'wrong_company'
  | 'no_job';

export function isArrivingPurpose(purpose: string | null | undefined): boolean {
  return String(purpose ?? '').trim() === ARRIVING_PURPOSE;
}

/**
 * Cron / auto-fire never sends arriving. A due=tomorrow hop with
 * purpose=arriving is ignored — keep the 24h path.
 */
export function cronIgnoresArrivingPurpose(args: {
  purpose?: string | null;
  jobId?: string | null;
  due?: string | null;
}): boolean {
  if (!isArrivingPurpose(args.purpose)) return false;
  return !(args.jobId ?? '').trim();
}

/** User tap on a jobId only. Cron / missing user / no jobId never fire arriving. */
export function shouldSendArriving(args: {
  purpose?: string | null;
  jobId?: string | null;
  due?: string | null;
  hasUser: boolean;
}): boolean {
  if (!isArrivingPurpose(args.purpose)) return false;
  if (cronIgnoresArrivingPurpose(args)) return false;
  if (!args.hasUser) return false;
  return !!(args.jobId ?? '').trim();
}

export function arrivingMissMessage(reason: ArrivingMissReason): string {
  switch (reason) {
    case 'no_client':
      return 'This job has no client. Add one below before you send.';
    case 'no_phone':
      return missSmsMessage('no_phone');
    case 'no_sms_credentials':
      return missSmsMessage('no_sms_credentials');
    case 'closed':
      return missMessage('closed');
    case 'wrong_company':
      return missMessage('wrong_company');
    case 'no_job':
      return missMessage('no_job');
  }
}

/** Client To: trimmed email or empty. Never invent an address. */
export function prefillReminderTo(client: ReminderClient | null | undefined): string {
  const email = (client?.email ?? '').trim();
  if (!email || !email.includes('@')) return '';
  return email;
}

/**
 * Client SMS To: E.164 from clients.phone, or empty. Never invent a number.
 * AU national 0XXXXXXXXX becomes +61XXXXXXXXX. Already-international stays as-is.
 */
export function prefillSmsTo(phone: string | null | undefined): string {
  const raw = (phone ?? '').trim();
  if (!raw) return '';
  const compact = raw.replace(/[^\d+]/g, '');
  if (!compact || compact === '+') return '';
  const digits = compact.startsWith('+') ? compact.slice(1).replace(/\D/g, '') : compact.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return '';
  if (digits.length === 10 && digits.startsWith('0')) return `+61${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith('4')) return `+61${digits}`;
  return `+${digits}`;
}

export function smsCredentialsReady(creds: SmsCredentials | null | undefined): boolean {
  const sid = (creds?.accountSid ?? '').trim();
  const token = (creds?.authToken ?? '').trim();
  const from = prefillSmsTo(creds?.fromNumber);
  return !!sid && !!token && !!from;
}

export function missSmsMessage(reason: SmsMissReason): string {
  switch (reason) {
    case 'no_phone':
      return 'This client has no phone — SMS was not sent.';
    case 'no_sms_credentials':
      return 'SMS is not set up.';
    case 'send_failed':
      return 'SMS was not sent.';
  }
}

export function decideSmsBeside(args: {
  phone?: string | null;
  credentials?: SmsCredentials | null;
}): SmsDecision {
  const to = prefillSmsTo(args.phone);
  if (!to) {
    return { send: false, reason: 'no_phone', message: missSmsMessage('no_phone'), to: null };
  }
  if (!smsCredentialsReady(args.credentials)) {
    return { send: false, reason: 'no_sms_credentials', message: missSmsMessage('no_sms_credentials'), to };
  }
  return { send: true, to };
}

export function smsResultFromMiss(reason: SmsMissReason, to: string | null = null): SmsSendResult {
  return { sent: false, to, reason, message: missSmsMessage(reason) };
}

export function smsResultFromSend(ok: boolean, to: string, providerMessage?: string): SmsSendResult {
  if (ok) return { sent: true, to, message: `SMS sent to ${to}` };
  const detail = (providerMessage ?? '').trim();
  return {
    sent: false,
    to,
    reason: 'send_failed',
    message: detail ? `SMS was not sent: ${detail}` : missSmsMessage('send_failed'),
  };
}

/** Email line first; SMS outcome is appended. Email sent-at is not this string. */
export function formatEmailAndSmsMessage(
  emailMessage: string,
  sms: SmsSendResult | null | undefined,
): string {
  const email = emailMessage.trim();
  if (!sms?.message) return email;
  return `${email} ${sms.message}`;
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

export function jobRescheduleUrl(appUrl: string, jobId: string): string {
  const base = appUrl.replace(/\/$/, '');
  return `${base}${jobRescheduleQueryHref(jobId)}`;
}

/** Office link: ?reschedule=1 on the existing job page — not a new route. */
export function isJobRescheduleQuery(
  search: string | { get: (key: string) => string | null } | null | undefined,
): boolean {
  if (search == null) return false;
  if (typeof search === 'string') {
    const q = search.startsWith('?') ? search.slice(1) : search;
    return new URLSearchParams(q).get('reschedule') === '1';
  }
  return search.get('reschedule') === '1';
}

export type JobOfficeRescheduleBanner = {
  kind: 'dated' | 'empty';
  message: string;
  booked: string | null;
};

/** Honest office banner on #job-schedule. Empty when the job has no date. */
export function jobOfficeRescheduleBanner(
  job: Pick<ReminderJob, 'scheduled_date'>,
): JobOfficeRescheduleBanner {
  const day = dateOnly(job.scheduled_date);
  if (!day) {
    return {
      kind: 'empty',
      booked: null,
      message: 'This visit needs a new date. No day is booked yet.',
    };
  }
  const booked = formatJobDate(day);
  return {
    kind: 'dated',
    booked,
    message: `This visit needs a new date. Currently booked ${booked}. Pick the new day on the schedule below.`,
  };
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
    jobRescheduleUrl(args.appUrl, args.job.id),
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
          <div style="font-size:12px;opacity:.7;letter-spacing:1px;text-transform:uppercase">Grafter</div>
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

export function buildReminderSms(args: {
  job: ReminderJob;
  company: ReminderCompany;
}): string {
  const day = dateOnly(args.job.scheduled_date) ?? '';
  const when = day ? formatJobDate(day) : 'tomorrow';
  const start = (args.job.start_time ?? '').slice(0, 5);
  const whenLine = start ? `${when} at ${start}` : when;
  const label = jobLabel(args.job);
  const site = (args.job.address ?? '').trim();
  const companyName = (args.company.name ?? '').trim() || 'us';
  const companyPhone = (args.company.phone ?? '').trim();
  return [
    `Reminder: ${label} is booked for tomorrow (${whenLine}).`,
    site ? `Site: ${site}.` : null,
    `Need to reschedule? Reply or call ${companyPhone || companyName}.`,
  ].filter(line => line !== null).join(' ');
}

export function buildArrivingSms(args: {
  job: Pick<ReminderJob, 'job_number' | 'title' | 'address'>;
  company: ReminderCompany;
}): string {
  const label = jobLabel(args.job);
  const site = (args.job.address ?? '').trim();
  const companyName = (args.company.name ?? '').trim() || 'us';
  return [
    `${companyName} is arriving shortly for ${label}.`,
    site ? `${site}.` : null,
  ].filter(line => line !== null).join(' ');
}

export function buildArrivingEmail(args: {
  job: Pick<ReminderJob, 'job_number' | 'title' | 'address'>;
  client: ReminderClient;
  company: ReminderCompany;
  to: string;
}): {
  to: string;
  subject: string;
  html: string;
  text: string;
} {
  const label = jobLabel(args.job);
  const site = (args.job.address ?? '').trim();
  const companyName = (args.company.name ?? '').trim() || 'us';
  const companyPhone = (args.company.phone ?? '').trim();
  const greetingName = (args.client.contact_person || args.client.name || 'there').trim();
  const subject = `${companyName} is arriving shortly — ${label}`;
  const text = [
    `Hi ${greetingName},`,
    '',
    `${companyName} is arriving shortly for ${label}.`,
    site ? `Site: ${site}` : null,
    '',
    companyPhone ? `Call: ${companyPhone}` : null,
  ].filter(line => line !== null).join('\n');
  const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A">
        <div style="background:#0A2540;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
          <div style="font-size:12px;opacity:.7;letter-spacing:1px;text-transform:uppercase">Grafter</div>
          <h1 style="margin:8px 0 0;font-size:20px">Arriving shortly</h1>
        </div>
        <div style="border:1px solid #E5E7EB;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p>Hi ${escapeHtml(greetingName)},</p>
          <p>${escapeHtml(companyName)} is arriving shortly for <strong>${escapeHtml(label)}</strong>.</p>
          ${site ? `<p style="color:#4A5568;font-size:14px;line-height:1.6"><strong>Site:</strong> ${escapeHtml(site)}</p>` : ''}
          ${companyPhone ? `<p style="font-size:13px;color:#6B7280">Or call ${escapeHtml(companyPhone)}.</p>` : ''}
        </div>
      </div>`;
  return { to: args.to, subject, html, text };
}

export type ArrivingDecision =
  | {
      send: true;
      to: string;
      emailTo: string | null;
      sendEmail: boolean;
      smsBody: string;
      email: ReturnType<typeof buildArrivingEmail> | null;
      scheduleHref: string;
    }
  | {
      send: false;
      reason: ArrivingMissReason;
      message: string;
      to: string | null;
      scheduleHref: string | null;
    };

/**
 * Arriving is SMS-required. Email rides beside when To + SMTP are ready.
 * 24h gates (not_tomorrow, already_sent, no_email, no_smtp) do not apply.
 * Omit credentials to skip the Twilio check (tray enablement); the edge always checks.
 */
export function decideArrivingSend(args: {
  job: ReminderJob | null | undefined;
  client: ReminderClient | null | undefined;
  settings?: ReminderEmailSettings | null;
  company: ReminderCompany;
  companyId: string;
  appUrl?: string;
  now?: Date;
  credentials?: SmsCredentials | null;
}): ArrivingDecision {
  const { job, client, settings, company, companyId } = args;
  const now = args.now ?? new Date();
  const scheduleHref = job ? jobScheduleHref(job.id) : null;
  if (!job) {
    return { send: false, reason: 'no_job', message: arrivingMissMessage('no_job'), to: null, scheduleHref };
  }
  if (job.company_id !== companyId) {
    return { send: false, reason: 'wrong_company', message: arrivingMissMessage('wrong_company'), to: null, scheduleHref };
  }
  if (!isOpenJobStatus(job.status)) {
    return {
      send: false,
      reason: 'closed',
      message: arrivingMissMessage('closed'),
      to: prefillSmsTo(client?.phone) || null,
      scheduleHref,
    };
  }
  if (!isJobArrivingWindow(job, now)) {
    return {
      send: false,
      reason: 'closed',
      message: arrivingMissMessage('closed'),
      to: prefillSmsTo(client?.phone) || null,
      scheduleHref,
    };
  }
  if (!job.client_id || !client) {
    return { send: false, reason: 'no_client', message: arrivingMissMessage('no_client'), to: null, scheduleHref };
  }
  const smsTo = prefillSmsTo(client.phone);
  if (!smsTo) {
    return { send: false, reason: 'no_phone', message: arrivingMissMessage('no_phone'), to: null, scheduleHref };
  }
  if (args.credentials !== undefined && !smsCredentialsReady(args.credentials)) {
    return {
      send: false,
      reason: 'no_sms_credentials',
      message: arrivingMissMessage('no_sms_credentials'),
      to: smsTo,
      scheduleHref,
    };
  }
  const emailTo = prefillReminderTo(client);
  const sendEmail = !!emailTo && emailSettingsReady(settings);
  return {
    send: true,
    to: smsTo,
    emailTo: emailTo || null,
    sendEmail,
    smsBody: buildArrivingSms({ job, company }),
    email: sendEmail
      ? buildArrivingEmail({ job, client, company, to: emailTo })
      : null,
    scheduleHref: scheduleHref!,
  };
}

/** Arriving does not lock on client_reminder_sent_at and does not write it. */
export function shouldRecordArrivingSent(_sendOk: boolean): false {
  return false;
}

export const ARRIVING_SHORTLY_PIPE = [
  "supabase.functions.invoke job-reminder { jobId, purpose: arriving, appUrl }",
  'user tap only — cron / due=tomorrow ignores purpose arriving',
  'SMS required via same Twilio path; email optional beside when SMTP is ready',
  'does not write client_reminder_sent_at; can send again the same day',
] as const;

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
 * How auto-fire actually runs — no tray click, no new cron stack.
 * pg_cron → invoke_job_client_reminders() → pg_net job-reminder due=tomorrow.
 * SMS rides the same hop. SQL-only Resend (058) is retired.
 */
export const AUTO_FIRE_CLICK_PATH = [
  'pg_cron job-client-reminder-perth-morning (0 23 * * * UTC = 07:00 Australia/Perth)',
  'pg_cron job-client-reminder-perth-afternoon (0 8 * * * UTC = 16:00 Australia/Perth)',
  'SELECT public.invoke_job_client_reminders()',
  'pg_net POST /functions/v1/job-reminder due=tomorrow source=cron',
  'vault project_url + service_role_key / job_reminder_cron_secret (same 057 secrets)',
  'perth_tomorrow = (timezone(Australia/Perth, now()))::date + 1',
  'email_settings where Resend is ready (companies without SMTP are not scanned)',
  'jobs where company_id = settings.company_id and scheduled_date = perth_tomorrow and status in (scheduled, in_progress)',
  'skip already_sent for this scheduled_date; skip no client email',
  'POST https://api.resend.com/emails with email_settings.smtp_pass',
  'POST https://api.twilio.com SMS beside email — miss does not flip sent-at',
  'UPDATE client_reminder_sent_at / client_reminder_sent_for_date only when Resend returns 2xx',
] as const;

/**
 * SMS rides the same job-reminder invoke as email (tray, invoice Send, due=tomorrow, due=today, due=overdue).
 * Twilio secrets stay on the edge. Email sent-at / chased_at is unchanged if SMS misses.
 */
export const JOB_REMINDER_SMS_PIPE = [
  'supabase.functions.invoke job-reminder (same body as email: jobId / inspectionId / invoiceId / reportId / quoteId / purchaseOrderId / contractId / due=tomorrow / due=today / due=contract / due=overdue)',
  'To = clients.phone (never invented; AU 0… → +61…)',
  'POST https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json with TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER',
  'honest miss: no_phone / no_sms_credentials / send_failed — email still sends',
  'client_reminder_sent_at / invoice status / invoices.chased_at / reports.sent_at / due_reminder_sent_at / service_reminder_sent_at follow email 2xx only',
] as const;

/** Same calendar rule the SQL cron uses: (timezone('Australia/Perth', now()))::date + 1 */
export function perthTomorrowSqlDate(now = new Date()): string {
  return tomorrowYmd(now, COMPANY_TIME_ZONE);
}

export function autoFireJobFilter(companyId: string, now = new Date()) {
  const id = companyId.trim();
  if (!id) return null;
  return {
    table: 'jobs' as const,
    company_id: id,
    scheduled_date: perthTomorrowSqlDate(now),
    status: ['scheduled', 'in_progress'] as const,
    timeZone: COMPANY_TIME_ZONE,
  };
}

/**
 * Cron auto-select. SMTP must be ready or nothing is mailed.
 * Still only tomorrow + this company + open jobs — not the ledger.
 */
export function selectAutoFireJobs(
  jobs: ReminderJob[],
  clients: Map<string, ReminderClient> | ReminderClient[],
  settings: ReminderEmailSettings | null | undefined,
  companyId: string,
  now = new Date(),
): TomorrowReminderPick {
  const tomorrow = perthTomorrowSqlDate(now);
  const scoped = jobs.filter(job => (
    job.company_id === companyId && dateOnly(job.scheduled_date) === tomorrow
  ));
  if (!emailSettingsReady(settings)) {
    return {
      selected: [],
      missed: scoped.map(job => ({
        job,
        reason: 'no_smtp' as const,
        message: missMessage('no_smtp'),
      })),
    };
  }
  return selectTomorrowReminderJobs(scoped, clients, companyId, now);
}

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
 * Keep date/crew Next first. Today (or in_progress) takes Arriving shortly.
 * Clock In / Add phone from the sheet recommendation stay — arriving already
 * sent, or the number still has to be written / is not sendable.
 * Tomorrow stays Remind client. Both land on the existing schedule tray.
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
  if (current.label === CLOCK_IN_NEXT_LABEL || current.label === PHONE_NEXT_LABEL) return current;
  if (!current.actionable) return current;
  if (isJobArrivingWindow(job, now)) {
    return { href: jobScheduleHref(job.id), label: ARRIVING_NEXT_LABEL, actionable: true };
  }
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
 * purpose=arriving is user+jobId only — cron ignores that purpose.
 */
export function resolveReminderCaller(args: {
  hasUser: boolean;
  userCompanyId?: string | null;
  cronAuthorized: boolean;
  jobId?: string;
  due?: string;
  purpose?: string;
}): { ok: true; caller: ReminderCaller } | { ok: false; error: string } {
  const jobId = (args.jobId ?? '').trim();
  const due = (args.due ?? '').trim();
  if (shouldSendArriving({
    purpose: args.purpose,
    jobId,
    due,
    hasUser: args.hasUser && !!args.userCompanyId,
  })) {
    return { ok: true, caller: { kind: 'user', companyId: args.userCompanyId! } };
  }
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
