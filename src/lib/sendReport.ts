import {
  COMPANY_EMAIL_SETTINGS_HREF,
  clientEmailForSend,
  clientPhoneForSms,
  isSmtpReady,
  type SmtpSettingsRow,
} from './sendInvoice';
import {
  escapeHtml,
  missSmsMessage,
  type ReminderEmailSettings,
  type SmsCredentials,
  type SmsDecision,
  decideSmsBeside,
} from './jobReminder';
import { livingJobSite } from './livingJha';

export { COMPANY_EMAIL_SETTINGS_HREF, clientEmailForSend, clientPhoneForSms, isSmtpReady };

export type ReportSendBlocker =
  | 'not_found'
  | 'no_report'
  | 'no_pdf'
  | 'no_client'
  | 'no_email'
  | 'no_smtp';

export type ReportSendQueryTable = 'reports' | 'inspections' | 'clients' | 'email_settings' | 'jobs';

export type ReportSendQueryScope = {
  table: ReportSendQueryTable;
  columns: string;
  eq: Record<string, string>;
};

export type ReportSendDecision =
  | {
      ok: true;
      to: string;
      toName: string;
      subject: string;
      filename: string;
      smsTo: string | null;
      smsMessage: string | null;
    }
  | {
      ok: false;
      blocker: ReportSendBlocker;
      message: string;
      href?: string;
    };

export type ReportSendCompany = {
  name: string;
  abn?: string | null;
  licence_number?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logo_url?: string | null;
};

export type ReportSendReport = {
  id: string;
  company_id: string;
  inspection_id: string;
  report_number: string;
  pdf_storage_path: string | null;
  sent_at?: string | null;
  generated_at?: string | null;
};

export type ReportSendInspection = {
  id: string;
  client_id: string | null;
  crm_job_id: string | null;
  status: string;
  meta?: Record<string, string | null> | null;
  template_snapshot?: { name?: string } | null;
};

export type ReportSendClient = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address?: string | null;
};

export type ReportSendJob = {
  id: string;
  client_id?: string | null;
  address?: string | null;
  title?: string | null;
  job_number?: number | null;
};

export type ReportPdfAttachment = {
  filename: string;
  content: string;
  contentType?: string;
};

export type ReportSendBundle = {
  report: ReportSendReport | null;
  inspection: ReportSendInspection | null;
  client: ReportSendClient | null;
  job: ReportSendJob | null;
  smtp: SmtpSettingsRow | null;
  company: ReportSendCompany;
  existingPdf?: ReportPdfAttachment | null;
};

export const REPORT_SEND_REPORT_COLUMNS =
  'id, company_id, inspection_id, report_number, pdf_storage_path, sent_at, generated_at';

export const REPORT_SEND_INSPECTION_COLUMNS =
  'id, client_id, crm_job_id, status, meta, template_snapshot';

export const REPORT_SEND_CLIENT_COLUMNS = 'id, name, email, phone, address';
export const REPORT_SEND_SMTP_COLUMNS = 'smtp_host, smtp_pass, from_name, from_email';
export const REPORT_SEND_JOB_COLUMNS = 'id, client_id, address, title, job_number';

export const NO_REPORT_MESSAGE = 'No report yet. Generate the PDF before you send.';
export const NO_EMAIL_MESSAGE = 'This client has no email. Add one on the client record before you send.';
export const NO_SMTP_MESSAGE = 'Email is not set up. Add SMTP in Company settings — there is a test send there.';
export const NO_PDF_MESSAGE = 'The report PDF could not be attached — report was not sent.';
export const NO_CLIENT_MESSAGE = 'This job has no client. Add one before you can send the report.';

/**
 * Same pipe as invoice Send / job / due reminders on main.
 * One report by id + company → email_settings + Resend → sent_at only on 2xx.
 */
export const REPORT_SEND_PIPE = [
  'supabase.functions.invoke job-reminder',
  'reportId (one report, company_id scoped — not the drive ledger)',
  'email_settings where Resend is ready (companies without SMTP are not mailed)',
  'To = client.email on this inspection/job (never invented)',
  'attach existing report PDF (reports.pdf_storage_path in reports bucket)',
  'POST https://api.resend.com/emails with email_settings.smtp_pass',
  'SMS beside: clients.phone via Twilio edge secrets on job-reminder (email sent_at unchanged if SMS misses)',
  'UPDATE reports.sent_at only when Resend returns 2xx',
] as const;

/** Live job site when a job is bound; otherwise the inspection snapshot. Honest empty → 'Site'. */
export function reportSiteName(
  meta: Record<string, string | null> | null | undefined,
  job?: Pick<ReportSendJob, 'address' | 'title'> | null,
): string {
  if (job) return livingJobSite({ id: '', address: job.address, title: job.title }) || 'Site';
  return (meta?.siteName ?? '').trim() || 'Site';
}

export function reportTemplateName(snapshot: { name?: string } | null | undefined): string {
  return (snapshot?.name ?? '').trim() || 'Inspection';
}

export function reportSendSubject(opts: {
  siteName: string;
  reportNumber: string;
  companyName: string;
}): string {
  const site = opts.siteName.trim() || 'Site';
  const number = opts.reportNumber.trim() || 'report';
  const who = opts.companyName.trim() || 'your contractor';
  return `Inspection Report — ${site} — ${number} from ${who}`;
}

export function reportPdfFilename(opts: { siteName: string; reportNumber: string }): string {
  const site = (opts.siteName.trim() || 'Site').replace(/[<>:"/\\|?*]/g, '_');
  const number = opts.reportNumber.trim() || 'report';
  return `${site} - ${number}.pdf`;
}

export function reportSmsBody(opts: {
  companyName: string;
  reportNumber: string;
  siteName: string;
}): string {
  const who = opts.companyName.trim() || 'your contractor';
  const number = opts.reportNumber.trim() || 'report';
  const site = opts.siteName.trim() || 'the site';
  return `${who} sent inspection report ${number} for ${site}. The PDF is in your email.`;
}

export function reportSendHtml(opts: {
  clientName: string;
  companyName: string;
  reportNumber: string;
  siteName: string;
  attachedPdf: boolean;
}): string {
  const client = escapeHtml(opts.clientName.trim() || 'there');
  const company = escapeHtml(opts.companyName.trim() || 'us');
  const number = escapeHtml(opts.reportNumber.trim() || 'report');
  const site = escapeHtml(opts.siteName.trim() || 'the site');
  const pdfLine = opts.attachedPdf
    ? '<p>The inspection report PDF is attached. Reply to this email if you have a question.</p>'
    : '<p>Reply to this email if you have a question about this report.</p>';
  return `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A">
        <div style="background:#0A2540;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
          <div style="font-size:12px;opacity:.7;letter-spacing:1px;text-transform:uppercase">Inspection report</div>
          <h1 style="margin:8px 0 0;font-size:20px">${number}</h1>
        </div>
        <div style="border:1px solid #E5E7EB;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p>Hi ${client},</p>
          <p>${company} has sent you the inspection report for <strong>${site}</strong>.</p>
          <p style="color:#4A5568;font-size:15px;line-height:1.6;">Report number: <strong>${number}</strong></p>
          ${pdfLine}
        </div>
      </div>`;
}

export function decideReportSms(args: {
  phone?: string | null;
  credentials?: SmsCredentials | null;
}): SmsDecision {
  return decideSmsBeside({ phone: args.phone, credentials: args.credentials });
}

/** Status write after a send attempt. Failure must not invent sent_at. */
export function reportSentAtAfterSend(
  sendSucceeded: boolean,
  currentSentAt: string | null | undefined,
  now = new Date(),
): string | null {
  if (!sendSucceeded) return currentSentAt ?? null;
  return now.toISOString();
}

export function reportStatusPatchAfterSend(sendSucceeded: boolean, now = new Date()): { sent_at: string } | null {
  return sendSucceeded ? { sent_at: now.toISOString() } : null;
}

export function shouldRecordReportSent(sendOk: boolean): boolean {
  return sendOk === true;
}

export function reportIsSent(sentAt: string | null | undefined): boolean {
  return !!(sentAt ?? '').trim();
}

export function reportByIdQuery(args: { companyId: string; reportId: string }): ReportSendQueryScope | null {
  const companyId = args.companyId.trim();
  const reportId = args.reportId.trim();
  if (!companyId || !reportId) return null;
  return {
    table: 'reports',
    columns: REPORT_SEND_REPORT_COLUMNS,
    eq: { id: reportId, company_id: companyId },
  };
}

export function reportSendQueries(args: { companyId: string; reportId: string }): {
  report: ReportSendQueryScope;
  smtp: ReportSendQueryScope;
} {
  return {
    report: {
      table: 'reports',
      columns: REPORT_SEND_REPORT_COLUMNS,
      eq: { id: args.reportId, company_id: args.companyId },
    },
    smtp: {
      table: 'email_settings',
      columns: REPORT_SEND_SMTP_COLUMNS,
      eq: { company_id: args.companyId },
    },
  };
}

export function reportSendInspectionQuery(inspectionId: string | null | undefined): ReportSendQueryScope | null {
  const id = (inspectionId ?? '').trim();
  if (!id) return null;
  return { table: 'inspections', columns: REPORT_SEND_INSPECTION_COLUMNS, eq: { id } };
}

export function reportSendClientQuery(clientId: string | null | undefined): ReportSendQueryScope | null {
  const id = (clientId ?? '').trim();
  if (!id) return null;
  return { table: 'clients', columns: REPORT_SEND_CLIENT_COLUMNS, eq: { id } };
}

export function reportSendJobQuery(jobId: string | null | undefined): ReportSendQueryScope | null {
  const id = (jobId ?? '').trim();
  if (!id) return null;
  return { table: 'jobs', columns: REPORT_SEND_JOB_COLUMNS, eq: { id } };
}

export function reportsForInspectionsQuery(args: {
  companyId: string;
  inspectionIds: Array<string | null | undefined>;
}): { table: 'reports'; columns: string; eq: Record<string, string>; inFilters: Record<string, string[]> } | null {
  const companyId = args.companyId.trim();
  const ids = [...new Set(args.inspectionIds.map(v => (v ?? '').trim()).filter(Boolean))];
  if (!companyId || ids.length === 0) return null;
  return {
    table: 'reports',
    columns: 'id, inspection_id, report_number, pdf_storage_path, sent_at',
    eq: { company_id: companyId },
    inFilters: { inspection_id: ids },
  };
}

export function isReportSendScoped(scope: ReportSendQueryScope): boolean {
  if (scope.table === 'reports') return !!scope.eq.id && !!scope.eq.company_id;
  if (scope.table === 'inspections' || scope.table === 'clients' || scope.table === 'jobs') return !!scope.eq.id;
  if (scope.table === 'email_settings') return !!scope.eq.company_id;
  return false;
}

/** True when a fetch would read more than this one report / its inspection / client / company SMTP. */
export function wouldScanLedgerToSendReport(scope: ReportSendQueryScope | null): boolean {
  if (scope == null) return false;
  return !isReportSendScoped(scope);
}

type FilterBuilder = {
  eq: (column: string, value: string) => FilterBuilder;
  in: (column: string, values: readonly string[]) => FilterBuilder;
  maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
};

export function applyReportSendScope<T>(
  fromBuilder: { select: (columns: string) => T },
  scope: ReportSendQueryScope,
): T & FilterBuilder {
  let q = fromBuilder.select(scope.columns) as T & FilterBuilder;
  for (const [column, value] of Object.entries(scope.eq)) {
    q = q.eq(column, value) as typeof q;
  }
  return q;
}

/** Bound job client wins. No job → inspection client. Do not invent an id. */
export function resolveReportClientId(
  inspection: Pick<ReportSendInspection, 'client_id'> | null | undefined,
  job: Pick<ReportSendJob, 'client_id'> | null | undefined,
): string | null {
  if (job) return (job.client_id ?? '').trim() || null;
  return (inspection?.client_id ?? '').trim() || null;
}

export function decideReportSend(bundle: ReportSendBundle): ReportSendDecision {
  const report = bundle.report;
  if (!report) {
    return { ok: false, blocker: 'no_report', message: NO_REPORT_MESSAGE };
  }
  if (!report.pdf_storage_path?.trim() && !bundle.existingPdf?.content) {
    return { ok: false, blocker: 'no_pdf', message: NO_PDF_MESSAGE };
  }
  const clientId = resolveReportClientId(bundle.inspection, bundle.job);
  if (!clientId) {
    return { ok: false, blocker: 'no_client', message: NO_CLIENT_MESSAGE };
  }
  if (!isSmtpReady(bundle.smtp as ReminderEmailSettings | null)) {
    return {
      ok: false,
      blocker: 'no_smtp',
      message: NO_SMTP_MESSAGE,
      href: COMPANY_EMAIL_SETTINGS_HREF,
    };
  }
  const to = clientEmailForSend(bundle.client?.email);
  if (!to) {
    return {
      ok: false,
      blocker: 'no_email',
      message: NO_EMAIL_MESSAGE,
      href: `/clients/${clientId}`,
    };
  }
  const siteName = reportSiteName(bundle.inspection?.meta, bundle.job);
  const smsTo = clientPhoneForSms(bundle.client?.phone);
  return {
    ok: true,
    to,
    toName: (bundle.client?.name ?? '').trim() || 'Client',
    subject: reportSendSubject({
      siteName,
      reportNumber: report.report_number,
      companyName: bundle.company.name,
    }),
    filename: reportPdfFilename({ siteName, reportNumber: report.report_number }),
    smsTo,
    smsMessage: smsTo ? null : missSmsMessage('no_phone'),
  };
}

/**
 * Prefer the stored report PDF. Do not invent a second document.
 */
export function pickReportPdfAttachment(args: {
  existing?: ReportPdfAttachment | null;
}): ReportPdfAttachment | null {
  if (args.existing?.content && args.existing.filename) {
    return {
      filename: args.existing.filename,
      content: args.existing.content,
      contentType: args.existing.contentType || 'application/pdf',
    };
  }
  return null;
}

export function reportAttachmentOrMiss(
  attachment: ReportPdfAttachment | null | undefined,
): { ok: true; attachment: ReportPdfAttachment } | { ok: false; reason: 'no_pdf'; message: string } {
  if (!attachment?.content || !attachment.filename) {
    return { ok: false, reason: 'no_pdf', message: NO_PDF_MESSAGE };
  }
  return {
    ok: true,
    attachment: {
      filename: attachment.filename,
      content: attachment.content,
      contentType: attachment.contentType || 'application/pdf',
    },
  };
}

/** Honest empty when the inspection surface points at a report that is not there. */
export function reportSendSurface(
  report: { id: string; sent_at?: string | null } | null | undefined,
): { kind: 'send'; reportId: string; sent: boolean } | { kind: 'empty'; message: string } {
  const id = (report?.id ?? '').trim();
  if (!id) return { kind: 'empty', message: NO_REPORT_MESSAGE };
  return { kind: 'send', reportId: id, sent: reportIsSent(report?.sent_at) };
}

/**
 * Defence in depth: even if a mixed drive is passed, only this company's
 * report with this id is selected.
 */
export function pickReportByIdAndCompany(
  rows: Array<{ id: string; company_id: string }>,
  reportId: string,
  companyId: string,
): { id: string; company_id: string } | null {
  const id = reportId.trim();
  const company = companyId.trim();
  if (!id || !company) return null;
  for (const row of rows) {
    if (row.id === id && row.company_id === company) return row;
  }
  return null;
}

export function inspectionDisplayStatus(
  inspectionStatus: string,
  reportSentAt?: string | null,
): string {
  if (reportIsSent(reportSentAt)) return 'sent';
  return inspectionStatus;
}
