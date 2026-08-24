import { supabase } from './supabase';
import {
  applyReportSendScope,
  decideReportSend,
  pickReportPdfAttachment,
  reportAttachmentOrMiss,
  reportByIdQuery,
  reportPdfFilename,
  reportSendClientQuery,
  reportSendInspectionQuery,
  reportSendJobQuery,
  reportSendQueries,
  reportSiteName,
  resolveReportClientId,
  type ReportPdfAttachment,
  type ReportSendBundle,
  type ReportSendCompany,
} from './sendReport';
import { blobToBase64, type SmtpSettingsRow } from './sendInvoice';
import { getAuditReportSendBundle } from './devFieldAuditDocs';
import { formatEmailAndSmsMessage, type SmsSendResult } from './jobReminder';

export type DeliverReportResult =
  | { ok: true; to: string; markedSent: true; message: string; sms: SmsSendResult | null }
  | { ok: false; message: string; markedSent: false; href?: string };

export async function loadReportSendBundle(
  reportId: string,
  company: ReportSendCompany & { id: string },
): Promise<ReportSendBundle> {
  const mock = getAuditReportSendBundle(reportId, company);
  if (mock) return mock;
  const scopes = reportSendQueries({ companyId: company.id, reportId });
  const reportRes = await applyReportSendScope(supabase.from(scopes.report.table), scopes.report).maybeSingle();
  if (reportRes.error) throw reportRes.error;
  const report = (reportRes.data ?? null) as ReportSendBundle['report'];

  const inspectionScope = reportSendInspectionQuery(report?.inspection_id);
  const smtpScope = scopes.smtp;

  const [inspectionRes, smtpRes, existingPdf] = await Promise.all([
    inspectionScope
      ? applyReportSendScope(supabase.from(inspectionScope.table), inspectionScope).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    applyReportSendScope(supabase.from(smtpScope.table), smtpScope).maybeSingle(),
    loadExistingReportPdf(report),
  ]);
  if (inspectionRes.error) throw inspectionRes.error;
  if (smtpRes.error) throw smtpRes.error;

  const inspection = (inspectionRes.data ?? null) as ReportSendBundle['inspection'];
  const jobScope = reportSendJobQuery(inspection?.crm_job_id);
  const jobRes = jobScope
    ? await applyReportSendScope(supabase.from(jobScope.table), jobScope).maybeSingle()
    : { data: null, error: null };
  if (jobRes.error) throw jobRes.error;
  const job = (jobRes.data ?? null) as ReportSendBundle['job'];

  const clientScope = reportSendClientQuery(resolveReportClientId(inspection, job));
  const clientRes = clientScope
    ? await applyReportSendScope(supabase.from(clientScope.table), clientScope).maybeSingle()
    : { data: null, error: null };
  if (clientRes.error) throw clientRes.error;

  return {
    report,
    inspection,
    client: (clientRes.data ?? null) as ReportSendBundle['client'],
    job,
    smtp: (smtpRes.data ?? null) as SmtpSettingsRow | null,
    company,
    existingPdf,
  };
}

export async function loadExistingReportPdf(
  report: { pdf_storage_path?: string | null; report_number?: string | null; inspection_id?: string } | null | undefined,
): Promise<ReportPdfAttachment | null> {
  const path = (report?.pdf_storage_path ?? '').trim();
  if (!path) return null;
  const { data, error } = await supabase.storage.from('reports').download(path);
  if (error || !data) return null;
  try {
    const filename = path.split('/').pop()
      || reportPdfFilename({ siteName: 'Site', reportNumber: report?.report_number ?? 'report' });
    return {
      filename,
      content: await blobToBase64(data),
      contentType: 'application/pdf',
    };
  } catch {
    return null;
  }
}

async function readFunctionError(error: { context?: unknown }): Promise<{ error?: string; message?: string; href?: string } | null> {
  const ctx = error.context;
  if (!ctx || typeof ctx !== 'object' || !('json' in ctx) || typeof (ctx as Response).json !== 'function') {
    return null;
  }
  try {
    return await (ctx as Response).json() as { error?: string; message?: string; href?: string };
  } catch {
    return null;
  }
}

/**
 * Email the inspection report through the job-reminder Resend pipe, then treat
 * sent as true only if that function reports delivery.
 * Callers must not flip sent_at themselves on a failed result.
 * Attaches the existing stored report PDF. Does not invent a report.
 */
export async function deliverReport(args: {
  reportId: string;
  company: ReportSendCompany & { id: string };
}): Promise<DeliverReportResult> {
  const bundle = await loadReportSendBundle(args.reportId, args.company);
  const decision = decideReportSend(bundle);
  if (!decision.ok) {
    return { ok: false, message: decision.message, markedSent: false, href: decision.href };
  }

  const picked = reportAttachmentOrMiss(pickReportPdfAttachment({
    existing: bundle.existingPdf,
  }));
  if (!picked.ok) {
    return { ok: false, message: picked.message, markedSent: false };
  }

  const { data, error } = await supabase.functions.invoke('job-reminder', {
    body: {
      reportId: args.reportId,
      appUrl: typeof window !== 'undefined' ? window.location.origin : '',
      attachment: picked.attachment,
    },
  });

  if (error) {
    const fromBody = await readFunctionError(error);
    return {
      ok: false,
      message: fromBody?.error || fromBody?.message || error.message || 'Could not send the report.',
      markedSent: false,
      href: fromBody?.href,
    };
  }
  if (data?.error) {
    return {
      ok: false,
      message: String(data.error),
      markedSent: false,
      href: data.href,
    };
  }
  if (data?.sent === false) {
    return {
      ok: false,
      message: String(data.message ?? data.results?.[0]?.message ?? 'Report was not sent.'),
      markedSent: false,
      href: data.href,
    };
  }
  if (!data?.sent) {
    return { ok: false, message: 'Report was not sent.', markedSent: false };
  }

  const to = String(data.to ?? decision.to);
  const sms = (data?.sms ?? null) as SmsSendResult | null;
  const site = reportSiteName(bundle.inspection?.meta, bundle.job);
  const message = String(data.message ?? '').trim()
    || formatEmailAndSmsMessage(`Report ${bundle.report?.report_number ?? ''} for ${site} sent to ${to}`.trim(), sms);
  return { ok: true, to, markedSent: true, message, sms };
}

/** Open one report by id + company. Does not read the company drive. */
export async function loadReportSendRow(
  reportId: string,
  companyId: string,
): Promise<ReportSendBundle['report']> {
  const scope = reportByIdQuery({ reportId, companyId });
  if (!scope) return null;
  const { data, error } = await applyReportSendScope(supabase.from(scope.table), scope).maybeSingle();
  if (error) throw error;
  return (data ?? null) as ReportSendBundle['report'];
}
