import { supabase } from './supabase';
import {
  applyInvoiceSendScope,
  blobToBase64,
  decideInvoiceSend,
  invoiceAttachmentOrMiss,
  invoiceByIdQuery,
  invoicePdfFilename,
  invoicePdfStoragePath,
  invoiceSendClientQuery,
  invoiceSendJobQuery,
  invoiceSendQueries,
  pickInvoicePdfAttachment,
  type InvoicePdfAttachment,
  type InvoiceSendBundle,
  type InvoiceSendCompany,
  type SmtpSettingsRow,
} from './sendInvoice';
import { asStringList } from './asStringList';
import { formatEmailAndSmsMessage, type SmsSendResult } from './jobReminder';
import type { InvoiceWithDetails } from '../types/fsm';

export type DeliverInvoiceResult =
  | { ok: true; to: string; markedSent: true; message: string; sms: SmsSendResult | null }
  | { ok: false; message: string; markedSent: false; href?: string };

export type InvoicePdfBuilder = (bundle: InvoiceSendBundle) => Promise<Blob>;

export async function loadInvoiceSendBundle(
  invoiceId: string,
  company: InvoiceSendCompany & { id: string },
): Promise<InvoiceSendBundle> {
  const scopes = invoiceSendQueries({ companyId: company.id, invoiceId });
  const invoiceRes = await applyInvoiceSendScope(supabase.from(scopes.invoice.table), scopes.invoice).maybeSingle();
  if (invoiceRes.error) throw invoiceRes.error;
  const invoice = (invoiceRes.data ?? null) as InvoiceSendBundle['invoice'];

  const clientScope = invoiceSendClientQuery(invoice?.client_id);
  const jobScope = invoiceSendJobQuery(invoice?.job_id);
  const smtpScope = scopes.smtp;

  const [clientRes, jobRes, smtpRes, existingPdf] = await Promise.all([
    clientScope
      ? applyInvoiceSendScope(supabase.from(clientScope.table), clientScope).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    jobScope
      ? applyInvoiceSendScope(supabase.from(jobScope.table), jobScope).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    applyInvoiceSendScope(supabase.from(smtpScope.table), smtpScope).maybeSingle(),
    loadExistingInvoicePdf(company.id, invoiceId),
  ]);
  if (clientRes.error) throw clientRes.error;
  if (jobRes.error) throw jobRes.error;
  if (smtpRes.error) throw smtpRes.error;

  return {
    invoice,
    client: (clientRes.data ?? null) as InvoiceSendBundle['client'],
    jobAddress: (jobRes.data as { address?: string | null } | null)?.address ?? null,
    smtp: (smtpRes.data ?? null) as SmtpSettingsRow | null,
    company,
    existingPdf,
  };
}

export async function loadExistingInvoicePdf(
  companyId: string,
  invoiceId: string,
): Promise<InvoicePdfAttachment | null> {
  const path = invoicePdfStoragePath(companyId, invoiceId);
  if (!path) return null;
  const { data, error } = await supabase.storage.from('reports').download(path);
  if (error || !data) return null;
  try {
    return {
      filename: path.split('/').pop() || 'invoice.pdf',
      content: await blobToBase64(data),
      contentType: 'application/pdf',
    };
  } catch {
    return null;
  }
}

async function readFunctionError(error: { context?: unknown }): Promise<{ error?: string; href?: string } | null> {
  const ctx = error.context;
  if (!ctx || typeof ctx !== 'object' || !('json' in ctx) || typeof (ctx as Response).json !== 'function') {
    return null;
  }
  try {
    return await (ctx as Response).json() as { error?: string; href?: string };
  } catch {
    return null;
  }
}

/**
 * Email the invoice through the job-reminder Resend pipe, then treat
 * sent as true only if that function reports delivery.
 * Callers must not flip status themselves on a failed result.
 * Attaches an existing stored PDF when one is on file; otherwise the
 * existing commercial invoice PDF.
 */
export async function deliverInvoice(args: {
  invoiceId: string;
  company: InvoiceSendCompany & { id: string };
  buildPdf: InvoicePdfBuilder;
}): Promise<DeliverInvoiceResult> {
  const bundle = await loadInvoiceSendBundle(args.invoiceId, args.company);
  const decision = decideInvoiceSend(bundle);
  if (!decision.ok) {
    return { ok: false, message: decision.message, markedSent: false, href: decision.href };
  }

  let generated: InvoicePdfAttachment | null = null;
  if (!bundle.existingPdf?.content) {
    try {
      const pdf = await args.buildPdf(bundle);
      generated = {
        filename: decision.filename || invoicePdfFilename(bundle.invoice?.invoice_number),
        content: await blobToBase64(pdf),
        contentType: 'application/pdf',
      };
    } catch {
      generated = null;
    }
  }

  const picked = invoiceAttachmentOrMiss(pickInvoicePdfAttachment({
    existing: bundle.existingPdf,
    generated,
  }));
  if (!picked.ok) {
    return { ok: false, message: picked.message, markedSent: false };
  }

  const { data, error } = await supabase.functions.invoke('job-reminder', {
    body: {
      invoiceId: args.invoiceId,
      appUrl: typeof window !== 'undefined' ? window.location.origin : '',
      attachment: picked.attachment,
    },
  });

  if (error) {
    const fromBody = await readFunctionError(error);
    return {
      ok: false,
      message: fromBody?.error || fromBody?.message || error.message || 'Could not send the invoice.',
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
      message: String(data.message ?? data.results?.[0]?.message ?? 'Invoice was not sent.'),
      markedSent: false,
      href: data.href,
    };
  }
  if (!data?.sent) {
    return { ok: false, message: 'Invoice was not sent.', markedSent: false };
  }

  const to = String(data.to ?? decision.to);
  const sms = (data?.sms ?? null) as SmsSendResult | null;
  const message = String(data.message ?? '').trim()
    || formatEmailAndSmsMessage(`Invoice sent to ${to}`, sms);
  return { ok: true, to, markedSent: true, message, sms };
}

/** Open one invoice by id + company. Does not read the company invoice ledger. */
export async function loadInvoiceEditorRow(
  invoiceId: string,
  companyId: string,
): Promise<InvoiceWithDetails | null> {
  const scope = invoiceByIdQuery({ invoiceId, companyId });
  if (!scope) return null;
  const { data, error } = await applyInvoiceSendScope(supabase.from(scope.table), scope).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const inv = data as InvoiceWithDetails;
  const clientScope = invoiceSendClientQuery(inv.client_id);
  const jobScope = invoiceSendJobQuery(inv.job_id);
  const [clientRes, jobRes] = await Promise.all([
    clientScope
      ? applyInvoiceSendScope(supabase.from(clientScope.table), clientScope).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    jobScope
      ? applyInvoiceSendScope(supabase.from(jobScope.table), jobScope).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (clientRes.error) throw clientRes.error;
  if (jobRes.error) throw jobRes.error;
  const client = clientRes.data as { name?: string | null; email?: string | null } | null;
  const job = jobRes.data as { title?: string | null; address?: string | null } | null;
  return {
    ...inv,
    inclusions: asStringList(inv.inclusions),
    exclusions: asStringList(inv.exclusions),
    client_name: client?.name ?? null,
    client_email: client?.email ?? null,
    job_title: job?.title ?? null,
    job_address: job?.address ?? null,
  };
}
