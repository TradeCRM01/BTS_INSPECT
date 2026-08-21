import type { TemplateSchema } from '../types/template';
import {
  COMPANY_TIME_ZONE,
  dateOnly,
  emailSettingsReady,
  escapeHtml,
  formatJobDate,
  isCronAuthorized,
  padJobNumber,
  prefillReminderTo,
  prefillSmsTo,
  reminderClientsQuery,
  reminderEmailSettingsQuery,
  todayYmd,
  type ReminderClient,
  type ReminderCompany,
  type ReminderEmailSettings,
} from './jobReminder';

export {
  COMPANY_TIME_ZONE,
  dateOnly,
  emailSettingsReady,
  formatJobDate,
  isCronAuthorized,
  prefillReminderTo,
  prefillSmsTo,
  reminderClientsQuery,
  reminderEmailSettingsQuery,
  todayYmd,
};

export const INSPECTION_DUE_COLUMNS =
  'id, inspector_id, client_id, crm_job_id, status, archived, meta, responses, template_snapshot, completed_at, started_at, due_on, due_reminder_sent_at, due_reminder_sent_for_date';

export const INSPECTION_DUE_JOB_COLUMNS =
  'id, company_id, client_id, title, status, scheduled_date, start_time, address, job_number';

/** Labels that already mean next-test / due on the inspection record. */
export const INSPECTION_DUE_LABEL = /next\s*test|re-?test|next\s*due|due\s*date|next\s*inspection|next\s*service|test\s*due|next\s*check/i;

/** Existing meta keys some templates already write. Not a new product field. */
export const INSPECTION_DUE_META_KEYS = [
  'nextTestDate',
  'next_test_date',
  'nextTest',
  'next_test',
  'dueDate',
  'due_date',
  'retestDate',
  'retest_date',
  'nextDue',
  'next_due',
] as const;

export type InspectionDueMissReason =
  | 'no_email'
  | 'no_due_date'
  | 'not_due'
  | 'no_smtp'
  | 'archived'
  | 'wrong_company'
  | 'no_inspection'
  | 'already_sent';

export type InspectionDueQueryScope = {
  table: 'inspections' | 'jobs' | 'clients' | 'email_settings' | 'profiles';
  columns: string;
  eq: Record<string, string>;
  inFilters: Record<string, string[]>;
  lte?: Record<string, string>;
};

export type DueInspection = {
  id: string;
  inspector_id?: string | null;
  client_id?: string | null;
  crm_job_id?: string | null;
  status: string;
  archived?: boolean | null;
  meta?: Record<string, string | null> | null;
  responses?: Record<string, unknown> | null;
  template_snapshot?: { name?: string; schema?: TemplateSchema } | Record<string, unknown> | null;
  completed_at?: string | null;
  started_at?: string | null;
  due_on?: string | null;
  due_reminder_sent_at?: string | null;
  due_reminder_sent_for_date?: string | null;
};

export type DueInspectionJob = {
  id: string;
  company_id: string;
  client_id?: string | null;
  title?: string | null;
  status?: string | null;
  scheduled_date?: string | null;
  start_time?: string | null;
  address?: string | null;
  job_number?: number | null;
};

type FilterBuilder = {
  eq: (column: string, value: string) => FilterBuilder;
  in: (column: string, values: readonly string[]) => FilterBuilder;
  lte: (column: string, value: string) => FilterBuilder;
};

export function isOpenInspectionStatus(status: string | null | undefined): boolean {
  const s = (status ?? '').trim();
  return s !== 'completed' && s !== 'issued' && s !== 'sent';
}

export function isArchivedInspection(row: Pick<DueInspection, 'archived'>): boolean {
  return row.archived === true;
}

export function inspectionSchema(
  snapshot: DueInspection['template_snapshot'],
): TemplateSchema | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const raw = snapshot as { schema?: TemplateSchema; sections?: TemplateSchema['sections']; meta?: TemplateSchema['meta'] };
  if (raw.schema?.sections) return raw.schema;
  if (Array.isArray(raw.sections) && raw.meta) return raw as TemplateSchema;
  return raw.schema ?? null;
}

export function inspectionTemplateName(snapshot: DueInspection['template_snapshot']): string {
  const name = (snapshot as { name?: string } | null)?.name;
  return (name ?? '').trim() || 'Inspection';
}

export function dueLabelMatches(label: string | null | undefined): boolean {
  return INSPECTION_DUE_LABEL.test((label ?? '').trim());
}

function collectYmd(dates: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const raw of dates) {
    const day = dateOnly(raw);
    if (day && !out.includes(day)) out.push(day);
  }
  return out.sort();
}

function earliestYmd(dates: Array<string | null | undefined>): string | null {
  return collectYmd(dates)[0] ?? null;
}

export function dueDatesFromMetaKeys(meta: Record<string, string | null> | null | undefined): string[] {
  if (!meta) return [];
  return collectYmd(INSPECTION_DUE_META_KEYS.map(key => meta[key]));
}

export function dueDatesFromCustomFields(
  schema: TemplateSchema | null | undefined,
  meta: Record<string, string | null> | null | undefined,
): string[] {
  if (!schema || !meta) return [];
  const dates: Array<string | null | undefined> = [];
  for (const field of schema.meta.customFields ?? []) {
    if (field.type !== 'date') continue;
    if (!dueLabelMatches(field.label) && !dueLabelMatches(field.name)) continue;
    dates.push(meta[`custom_${field.id}`]);
  }
  return collectYmd(dates);
}

export function dueDatesFromDateQuestions(
  schema: TemplateSchema | null | undefined,
  responses: Record<string, unknown> | null | undefined,
): string[] {
  if (!schema || !responses) return [];
  const dates: string[] = [];
  const dueQuestionIds = new Set<string>();
  for (const section of schema.sections ?? []) {
    for (const question of section.questions ?? []) {
      if (question.type !== 'date') continue;
      if (!dueLabelMatches(question.label)) continue;
      dueQuestionIds.add(question.id);
    }
  }
  if (dueQuestionIds.size === 0) return [];
  for (const [key, value] of Object.entries(responses)) {
    const questionId = key.split('__')[0];
    if (!dueQuestionIds.has(questionId)) continue;
    if (typeof value === 'string') dates.push(value);
  }
  return collectYmd(dates);
}

/**
 * Existing inspection/testing due date. Never invents an interval.
 * Explicit next-test / due fields win. Open records may use the linked job date.
 */
export function resolveInspectionDueDate(
  inspection: DueInspection | null | undefined,
  job?: DueInspectionJob | null,
): string | null {
  if (!inspection) return null;
  const schema = inspectionSchema(inspection.template_snapshot);
  const explicit = earliestYmd([
    ...dueDatesFromMetaKeys(inspection.meta),
    ...dueDatesFromCustomFields(schema, inspection.meta),
    ...dueDatesFromDateQuestions(schema, inspection.responses),
  ]);
  if (explicit) return explicit;
  if (!isOpenInspectionStatus(inspection.status)) return null;
  return dateOnly(job?.scheduled_date);
}

export function inspectionDueOnToday(
  inspection: DueInspection,
  job?: DueInspectionJob | null,
  now = new Date(),
): boolean {
  const due = resolveInspectionDueDate(inspection, job);
  return due === todayYmd(now);
}

export function inspectionDueOnOrBeforeToday(
  inspection: DueInspection,
  job?: DueInspectionJob | null,
  now = new Date(),
): boolean {
  const due = resolveInspectionDueDate(inspection, job);
  if (!due) return false;
  return due <= todayYmd(now);
}

export function resolveInspectionClientId(
  inspection: DueInspection | null | undefined,
  job?: DueInspectionJob | null,
): string | null {
  return (inspection?.client_id ?? job?.client_id ?? '').trim() || null;
}

export function resolveInspectionCompanyId(
  _inspection: DueInspection | null | undefined,
  job?: DueInspectionJob | null,
  client?: ReminderClient | null,
  inspectorCompanyId?: string | null,
): string | null {
  return (job?.company_id
    ?? client?.company_id
    ?? inspectorCompanyId
    ?? '').trim() || null;
}

export function missInspectionDueMessage(reason: InspectionDueMissReason): string {
  switch (reason) {
    case 'no_email':
      return 'This client has no email — reminder was not sent.';
    case 'no_due_date':
      return 'This inspection has no due date — reminder was not sent.';
    case 'not_due':
      return 'Reminder is for inspections due today.';
    case 'no_smtp':
      return 'Email is not set up.';
    case 'archived':
      return 'This inspection is archived — reminder was not sent.';
    case 'wrong_company':
      return 'This inspection is not in this company.';
    case 'no_inspection':
      return 'Inspection not found.';
    case 'already_sent':
      return 'Already reminded for this due date.';
  }
}

export function alreadyRemindedForDueDate(row: {
  due_on?: string | null;
  due_reminder_sent_at?: string | null;
  due_reminder_sent_for_date?: string | null;
  scheduled_date?: string | null;
}, dueDate?: string | null): boolean {
  const day = dateOnly(dueDate ?? row.due_on ?? row.scheduled_date);
  if (!day || !row.due_reminder_sent_at) return false;
  const sentFor = dateOnly(row.due_reminder_sent_for_date);
  if (sentFor) return sentFor === day;
  return true;
}

export function inspectionDueEligibility(args: {
  inspection: DueInspection | null | undefined;
  job?: DueInspectionJob | null;
  client: ReminderClient | null | undefined;
  settings: ReminderEmailSettings | null | undefined;
  companyId: string;
  now?: Date;
  /** Cron auto-fire is today only. Manual override may send overdue. */
  mode?: 'auto' | 'manual';
}): { ok: true; to: string; dueOn: string } | { ok: false; reason: InspectionDueMissReason; message: string; to: string | null; dueOn: string | null } {
  const { inspection, job, client, settings, companyId } = args;
  const now = args.now ?? new Date();
  const mode = args.mode ?? 'manual';
  const to = prefillReminderTo(client);
  if (!inspection) {
    return { ok: false, reason: 'no_inspection', message: missInspectionDueMessage('no_inspection'), to: null, dueOn: null };
  }
  const resolvedCompany = resolveInspectionCompanyId(inspection, job, client);
  if (resolvedCompany && resolvedCompany !== companyId) {
    return { ok: false, reason: 'wrong_company', message: missInspectionDueMessage('wrong_company'), to: to || null, dueOn: null };
  }
  if (isArchivedInspection(inspection)) {
    return { ok: false, reason: 'archived', message: missInspectionDueMessage('archived'), to: to || null, dueOn: null };
  }
  const dueOn = resolveInspectionDueDate(inspection, job);
  if (!dueOn) {
    return { ok: false, reason: 'no_due_date', message: missInspectionDueMessage('no_due_date'), to: to || null, dueOn: null };
  }
  const today = todayYmd(now);
  if (mode === 'auto' && dueOn !== today) {
    return { ok: false, reason: 'not_due', message: missInspectionDueMessage('not_due'), to: to || null, dueOn };
  }
  if (mode === 'manual' && dueOn > today) {
    return { ok: false, reason: 'not_due', message: missInspectionDueMessage('not_due'), to: to || null, dueOn };
  }
  if (alreadyRemindedForDueDate(inspection, dueOn) && mode === 'auto') {
    return { ok: false, reason: 'already_sent', message: missInspectionDueMessage('already_sent'), to: to || null, dueOn };
  }
  if (!to) {
    return { ok: false, reason: 'no_email', message: missInspectionDueMessage('no_email'), to: null, dueOn };
  }
  if (!emailSettingsReady(settings)) {
    return { ok: false, reason: 'no_smtp', message: missInspectionDueMessage('no_smtp'), to, dueOn };
  }
  return { ok: true, to, dueOn };
}

export function inspectionDueHref(inspectionId: string): string {
  return `/inspections/${encodeURIComponent(inspectionId)}#inspection-due`;
}

export function inspectionDueUrl(appUrl: string, inspectionId: string): string {
  return `${appUrl.replace(/\/$/, '')}${inspectionDueHref(inspectionId)}`;
}

export function isExistingInspectionDueSurface(href: string): boolean {
  return /^\/inspections\/[^/]+(?:#inspection-due)?$/.test(href);
}

export function inspectionDueLabel(
  inspection: DueInspection,
  job?: DueInspectionJob | null,
): string {
  const name = inspectionTemplateName(inspection.template_snapshot);
  const n = job?.job_number;
  return n != null ? `#${padJobNumber(n)} ${name}` : name;
}

export function buildInspectionDueEmail(args: {
  inspection: DueInspection;
  job?: DueInspectionJob | null;
  client: ReminderClient;
  company: ReminderCompany;
  settings: ReminderEmailSettings;
  appUrl: string;
  to: string;
  dueOn: string;
}): {
  to: string;
  subject: string;
  html: string;
  text: string;
  dueHref: string;
  dueUrl: string;
} {
  const when = formatJobDate(args.dueOn);
  const label = inspectionDueLabel(args.inspection, args.job);
  const site = (args.job?.address ?? args.inspection.meta?.siteAddress ?? args.inspection.meta?.siteName ?? '').trim();
  const companyName = (args.company.name ?? '').trim() || 'us';
  const companyPhone = (args.company.phone ?? '').trim();
  const greetingName = (args.client.contact_person || args.client.name || 'there').trim();
  const dueHref = inspectionDueHref(args.inspection.id);
  const dueUrl = inspectionDueUrl(args.appUrl, args.inspection.id);
  const open = isOpenInspectionStatus(args.inspection.status);
  const duePhrase = open ? 'is due today' : 'next test is due today';

  const subject = `Reminder: ${label} ${duePhrase} (${when})`;
  const text = [
    `Hi ${greetingName},`,
    '',
    `This is a reminder that your ${label.toLowerCase().startsWith('#') ? label : label.toLowerCase()} ${duePhrase}.`,
    `Due: ${when}`,
    site ? `Site: ${site}` : null,
    '',
    'Reply to this email to book it in — the inspection and date are already on the job. No retype.',
    args.job?.id ? `Job: ${inspectionDueUrl(args.appUrl, args.inspection.id).replace(/\/inspections\/.*/, `/jobs/${args.job.id}`)}` : `Open: ${dueUrl}`,
    '',
    companyPhone ? `Call: ${companyPhone}` : null,
  ].filter(line => line !== null).join('\n');

  const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A">
        <div style="background:#0A2540;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
          <div style="font-size:12px;opacity:.7;letter-spacing:1px;text-transform:uppercase">BTS Inspect</div>
          <h1 style="margin:8px 0 0;font-size:20px">Test due today</h1>
        </div>
        <div style="border:1px solid #E5E7EB;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p>Hi ${escapeHtml(greetingName)},</p>
          <p>${escapeHtml(companyName)} — your <strong>${escapeHtml(label)}</strong> ${duePhrase}.</p>
          <div style="margin:20px 0;padding:16px;background:#F9FAFB;border-radius:8px">
            <p style="margin:0;color:#4A5568;font-size:14px;line-height:1.6">
              <strong>Inspection:</strong> ${escapeHtml(label)}<br/>
              <strong>Due:</strong> ${escapeHtml(when)}
              ${site ? `<br/><strong>Site:</strong> ${escapeHtml(site)}` : ''}
            </p>
          </div>
          <p>Reply to book it in — the inspection, job, and date are already filled in.</p>
          ${companyPhone ? `<p style="font-size:13px;color:#6B7280">Or call ${escapeHtml(companyPhone)}.</p>` : ''}
          <p style="font-size:12px;color:#6B7280">You're receiving this because this test is due on the inspection record.</p>
        </div>
      </div>`;

  return { to: args.to, subject, html, text, dueHref, dueUrl };
}

export function buildInspectionDueSms(args: {
  inspection: DueInspection;
  job?: DueInspectionJob | null;
  company: ReminderCompany;
  dueOn: string;
}): string {
  const when = formatJobDate(args.dueOn);
  const label = inspectionDueLabel(args.inspection, args.job);
  const site = (args.job?.address ?? args.inspection.meta?.siteAddress ?? args.inspection.meta?.siteName ?? '').trim();
  const companyPhone = (args.company.phone ?? '').trim();
  const open = isOpenInspectionStatus(args.inspection.status);
  const duePhrase = open ? 'is due today' : 'next test is due today';
  return [
    `Reminder: ${label} ${duePhrase} (${when}).`,
    site ? `Site: ${site}.` : null,
    `Reply to book it in${companyPhone ? ` or call ${companyPhone}` : ''}.`,
  ].filter(line => line !== null).join(' ');
}

export type InspectionDueDecision =
  | ({ send: true; dueOn: string } & ReturnType<typeof buildInspectionDueEmail>)
  | {
      send: false;
      reason: InspectionDueMissReason;
      message: string;
      to: string | null;
      dueOn: string | null;
      dueHref: string | null;
    };

export function decideInspectionDueSend(args: {
  inspection: DueInspection | null | undefined;
  job?: DueInspectionJob | null;
  client: ReminderClient | null | undefined;
  settings: ReminderEmailSettings | null | undefined;
  company: ReminderCompany;
  companyId: string;
  appUrl: string;
  now?: Date;
  mode?: 'auto' | 'manual';
}): InspectionDueDecision {
  const gate = inspectionDueEligibility(args);
  const dueHref = args.inspection ? inspectionDueHref(args.inspection.id) : null;
  if (!gate.ok) {
    return { send: false, reason: gate.reason, message: gate.message, to: gate.to, dueOn: gate.dueOn, dueHref };
  }
  return {
    send: true,
    dueOn: gate.dueOn,
    ...buildInspectionDueEmail({
      inspection: args.inspection!,
      job: args.job,
      client: args.client ?? { id: '', email: gate.to },
      company: args.company,
      settings: args.settings ?? {},
      appUrl: args.appUrl,
      to: gate.to,
      dueOn: gate.dueOn,
    }),
  };
}

export function inspectionDueSuccessPatch(
  dueOn: string,
  sentAt = new Date(),
): { due_reminder_sent_at: string; due_reminder_sent_for_date: string | null } {
  return {
    due_reminder_sent_at: sentAt.toISOString(),
    due_reminder_sent_for_date: dateOnly(dueOn),
  };
}

export function shouldRecordInspectionDueSent(sendOk: boolean): boolean {
  return sendOk === true;
}

/** Perth today — same calendar the SQL cron uses. */
export function perthTodaySqlDate(now = new Date()): string {
  return todayYmd(now, COMPANY_TIME_ZONE);
}

export function todayInspectionDueQuery(args: {
  companyId: string;
  now?: Date;
}): InspectionDueQueryScope | null {
  const companyId = args.companyId.trim();
  if (!companyId) return null;
  return {
    table: 'inspections',
    columns: INSPECTION_DUE_COLUMNS,
    eq: { due_on: perthTodaySqlDate(args.now) },
    inFilters: {},
  };
}

export function inspectionDueJobsQuery(
  companyId: string,
  jobIds: Array<string | null | undefined>,
): InspectionDueQueryScope | null {
  const id = companyId.trim();
  const ids = [...new Set(jobIds.map(v => (v ?? '').trim()).filter(Boolean))];
  if (!id || ids.length === 0) return null;
  return {
    table: 'jobs',
    columns: INSPECTION_DUE_JOB_COLUMNS,
    eq: { company_id: id },
    inFilters: { id: ids },
  };
}

export function inspectionDueCompanyFilter(companyId: string, now = new Date()) {
  const id = companyId.trim();
  if (!id) return null;
  return {
    table: 'inspections' as const,
    company_id: id,
    due_on: perthTodaySqlDate(now),
    timeZone: COMPANY_TIME_ZONE,
  };
}

export function applyInspectionDueScope<T>(
  fromBuilder: { select: (columns: string) => T },
  scope: InspectionDueQueryScope,
): T {
  let q = fromBuilder.select(scope.columns) as T & FilterBuilder;
  for (const [column, value] of Object.entries(scope.eq)) {
    q = q.eq(column, value) as typeof q;
  }
  for (const [column, values] of Object.entries(scope.inFilters)) {
    q = q.in(column, values) as typeof q;
  }
  for (const [column, value] of Object.entries(scope.lte ?? {})) {
    q = q.lte(column, value) as typeof q;
  }
  return q;
}

export function isInspectionDueQueryScoped(scope: InspectionDueQueryScope | null): boolean {
  if (!scope) return false;
  if (scope.columns.trim() === '' || scope.columns.trim() === '*') return false;
  if (scope.table === 'inspections') return !!scope.eq.due_on;
  if (scope.table === 'jobs' || scope.table === 'clients' || scope.table === 'email_settings') {
    return !!scope.eq.company_id;
  }
  return !!scope.eq.company_id;
}

export function wouldScanUnscopedInspections(scope: InspectionDueQueryScope | null): boolean {
  if (scope == null) return false;
  if (scope.table !== 'inspections') return false;
  return !scope.eq.due_on;
}

/**
 * How auto-fire actually runs — same Perth cron as the 24h job ping.
 * No tray click. No new notify module. No new cron stack.
 * pg_cron job-client-reminder-* → invoke_job_client_reminders() → job-reminder due=today.
 * SQL-only Resend (060) is retired so cron cannot double-send or stay email-only.
 */
export const INSPECTION_DUE_AUTO_FIRE_PATH = [
  'pg_cron job-client-reminder-perth-morning (0 23 * * * UTC = 07:00 Australia/Perth)',
  'pg_cron job-client-reminder-perth-afternoon (0 8 * * * UTC = 16:00 Australia/Perth)',
  'SELECT public.invoke_job_client_reminders()',
  'pg_net POST /functions/v1/job-reminder due=today source=cron',
  'perth_today = (timezone(Australia/Perth, now()))::date',
  'email_settings where Resend is ready (companies without SMTP are not scanned)',
  'inspections where due_on = perth_today and archived is not true, company via job / client / inspector',
  'skip already_sent for this due_on; skip no client email; skip no due date',
  'POST https://api.resend.com/emails with email_settings.smtp_pass',
  'POST https://api.twilio.com SMS beside email — miss does not flip sent-at',
  'UPDATE due_reminder_sent_at / due_reminder_sent_for_date only when Resend returns 2xx',
] as const;

export type InspectionDuePick = {
  selected: Array<{ inspection: DueInspection; job: DueInspectionJob | null; client: ReminderClient; to: string; dueOn: string }>;
  missed: Array<{ inspection: DueInspection; reason: InspectionDueMissReason; message: string }>;
};

export function belongsToCompany(
  inspection: DueInspection,
  job: DueInspectionJob | null | undefined,
  client: ReminderClient | null | undefined,
  companyId: string,
  inspectorCompanyById?: Map<string, string>,
): boolean {
  const inspectorCo = inspection.inspector_id
    ? inspectorCompanyById?.get(inspection.inspector_id) ?? null
    : null;
  const resolved = resolveInspectionCompanyId(inspection, job, client, inspectorCo);
  if (resolved) return resolved === companyId;
  return false;
}

/**
 * Cron auto-select. SMTP must be ready or nothing is mailed.
 * Defence in depth: even if a mixed ledger is passed, only this company's
 * inspections due today with a client email are selected.
 */
export function selectDueInspections(
  inspections: DueInspection[],
  jobs: Map<string, DueInspectionJob> | DueInspectionJob[],
  clients: Map<string, ReminderClient> | ReminderClient[],
  settings: ReminderEmailSettings | null | undefined,
  companyId: string,
  now = new Date(),
  inspectorCompanyById?: Map<string, string>,
): InspectionDuePick {
  const jobMap = jobs instanceof Map ? jobs : new Map(jobs.map(j => [j.id, j]));
  const clientMap = clients instanceof Map ? clients : new Map(clients.map(c => [c.id, c]));
  const today = perthTodaySqlDate(now);
  const selected: InspectionDuePick['selected'] = [];
  const missed: InspectionDuePick['missed'] = [];

  for (const inspection of inspections) {
    const job = inspection.crm_job_id ? jobMap.get(inspection.crm_job_id) ?? null : null;
    const clientId = resolveInspectionClientId(inspection, job);
    const client = clientId ? clientMap.get(clientId) ?? null : null;
    if (!belongsToCompany(inspection, job, client, companyId, inspectorCompanyById)) continue;
    const dueOn = resolveInspectionDueDate(inspection, job);
    if (dueOn !== today) continue;
    if (isArchivedInspection(inspection)) {
      missed.push({ inspection, reason: 'archived', message: missInspectionDueMessage('archived') });
      continue;
    }
    if (alreadyRemindedForDueDate(inspection, dueOn)) {
      missed.push({ inspection, reason: 'already_sent', message: missInspectionDueMessage('already_sent') });
      continue;
    }
    if (!emailSettingsReady(settings)) {
      missed.push({ inspection, reason: 'no_smtp', message: missInspectionDueMessage('no_smtp') });
      continue;
    }
    const to = prefillReminderTo(client);
    if (!to) {
      missed.push({ inspection, reason: 'no_email', message: missInspectionDueMessage('no_email') });
      continue;
    }
    selected.push({ inspection, job, client: client!, to, dueOn });
  }

  return { selected, missed };
}

export function selectAutoFireInspections(
  inspections: DueInspection[],
  jobs: Map<string, DueInspectionJob> | DueInspectionJob[],
  clients: Map<string, ReminderClient> | ReminderClient[],
  settings: ReminderEmailSettings | null | undefined,
  companyId: string,
  now = new Date(),
  inspectorCompanyById?: Map<string, string>,
): InspectionDuePick {
  return selectDueInspections(inspections, jobs, clients, settings, companyId, now, inspectorCompanyById);
}

export type InspectionDueCaller =
  | { kind: 'user'; companyId: string }
  | { kind: 'cron' };

export function resolveInspectionDueCaller(args: {
  hasUser: boolean;
  userCompanyId?: string | null;
  cronAuthorized: boolean;
  inspectionId?: string;
  due?: string;
}): { ok: true; caller: InspectionDueCaller } | { ok: false; error: string } {
  const inspectionId = (args.inspectionId ?? '').trim();
  const due = (args.due ?? '').trim();
  if (inspectionId) {
    if (!args.hasUser || !args.userCompanyId) return { ok: false, error: 'Unauthorized' };
    return { ok: true, caller: { kind: 'user', companyId: args.userCompanyId } };
  }
  if (due === 'today') {
    if (args.cronAuthorized) return { ok: true, caller: { kind: 'cron' } };
    if (args.hasUser && args.userCompanyId) {
      return { ok: true, caller: { kind: 'user', companyId: args.userCompanyId } };
    }
    return { ok: false, error: 'Unauthorized' };
  }
  return { ok: false, error: 'inspectionId or due=today is required' };
}

/**
 * Keep site/fill Next first. When the inspection is due today, Next is the
 * existing fill tray (where the reminder lives) — not a new route.
 */
export function withInspectionDueNext<T extends {
  id: string;
  status: string;
  archived?: boolean | null;
  meta?: Record<string, string | null> | null;
  responses?: Record<string, unknown> | null;
  template_snapshot?: DueInspection['template_snapshot'];
  crm_job_id?: string | null;
  due_on?: string | null;
}>(
  inspection: T,
  job: DueInspectionJob | null | undefined,
  current: { href: string; label: string; actionable: boolean },
  now = new Date(),
): { href: string; label: string; actionable: boolean } {
  if (current.label === 'Add site' || current.label === 'Continue' || current.label === 'Save') {
    return current;
  }
  if (!current.actionable) return current;
  if (isArchivedInspection(inspection)) return current;
  if (!inspectionDueOnOrBeforeToday(inspection, job, now)) return current;
  return { href: inspectionDueHref(inspection.id), label: 'Remind client', actionable: true };
}
