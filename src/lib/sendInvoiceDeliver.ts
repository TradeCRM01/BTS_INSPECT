import { supabase } from './supabase';
import {
  applyInvoiceSendScope,
  blobToBase64,
  commercialPdfDataForInvoice,
  decideInvoiceReceipt,
  decideInvoiceReceiptOnMarkPaid,
  decideInvoiceSend,
  invoiceAttachmentOrMiss,
  invoiceByIdQuery,
  invoicePdfFilename,
  invoicePdfStoragePath,
  invoiceReceiptOnMarkPaidBody,
  invoiceSendClientQuery,
  invoiceSendJobQuery,
  invoiceSendQueries,
  missInvoiceReceiptMessage,
  pickInvoicePdfAttachment,
  type InvoicePdfAttachment,
  type InvoiceReceiptMissReason,
  type InvoiceSendBundle,
  type InvoiceSendCompany,
  type SmtpSettingsRow,
} from './sendInvoice';
import { asStringList } from './asStringList';
import { formatEmailAndSmsMessage, type SmsSendResult } from './jobReminder';
import {
  INVOICE_MARKED_PAID_MESSAGE,
  pushInvoiceToXeroAfterSend,
  type XeroAfterSendResult,
} from './xeroAccounting';
import { generateCommercialPdf } from '../reports/commercial/generateCommercialPdf';
import type { InvoiceWithDetails } from '../types/fsm';
import { getAuditInvoiceSendBundle } from './devFieldAuditDocs';

export type DeliverInvoiceResult =
  | { ok: true; to: string; markedSent: true; message: string; sms: SmsSendResult | null; xero: XeroAfterSendResult }
  | { ok: false; message: string; markedSent: false; href?: string };

export type DeliverInvoiceReceiptResult =
  | { ok: true; to: string; markedPaid: true; message: string; sms: SmsSendResult | null }
  | {
      ok: false;
      reason: InvoiceReceiptMissReason;
      message: string;
      markedPaid: boolean;
      href?: string;
    };

export type InvoicePdfBuilder = (bundle: InvoiceSendBundle) => Promise<Blob>;

export type InvoiceReminderInvoke = (
  name: string,
  opts: { body: Record<string, unknown> },
) => Promise<{ data: unknown; error?: { message?: string; context?: unknown } | null }>;

export async function defaultInvoicePdfBuilder(bundle: InvoiceSendBundle): Promise<Blob> {
  const data = commercialPdfDataForInvoice(bundle);
  if (!data) throw new Error('Could not build the invoice PDF.');
  return generateCommercialPdf(data);
}

export async function loadInvoiceSendBundle(
  invoiceId: string,
  company: InvoiceSendCompany & { id: string },
): Promise<InvoiceSendBundle> {
  const mock = getAuditInvoiceSendBundle(invoiceId, company);
  if (mock) return mock;
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
  const xero = await pushInvoiceToXeroAfterSend(
    (name, opts) => supabase.functions.invoke(name, opts),
    { sendSucceeded: true, invoiceId: args.invoiceId },
  );
  return { ok: true, to, markedSent: true, message, sms, xero };
}

function receiptMiss(
  reason: InvoiceReceiptMissReason,
  markedPaid: boolean,
  href?: string,
  message?: string,
): DeliverInvoiceReceiptResult {
  return {
    ok: false,
    reason,
    message: message || missInvoiceReceiptMessage(reason),
    markedPaid,
    href,
  };
}

function blockerToReceiptReason(blocker: string): InvoiceReceiptMissReason {
  switch (blocker) {
    case 'not_found':
    case 'no_invoice':
      return 'not_found';
    case 'not_paid':
    case 'paid':
      return 'not_paid';
    case 'no_client':
      return 'no_client';
    case 'no_email':
      return 'no_email';
    case 'no_smtp':
      return 'no_smtp';
    case 'no_lines':
      return 'no_lines';
    case 'no_pdf':
      return 'no_pdf';
    case 'no_phone':
      return 'no_phone';
    default:
      return 'send_failed';
  }
}

/**
 * After Mark paid succeeds locally. Same job-reminder invoiceId pipe as Send.
 * Receipt copy, not chase. Does not push Xero (attach stays beside this).
 * Callers must not unmark paid on a miss.
 */
export async function deliverInvoiceReceiptAfterMarkPaid(
  invoke: InvoiceReminderInvoke,
  input: {
    paidSucceeded: boolean;
    invoiceId: string;
    status?: string | null;
    company?: (InvoiceSendCompany & { id: string }) | null;
    buildPdf?: InvoicePdfBuilder;
    loadBundle?: (
      invoiceId: string,
      company: InvoiceSendCompany & { id: string },
    ) => Promise<InvoiceSendBundle>;
  },
): Promise<DeliverInvoiceReceiptResult> {
  const gate = decideInvoiceReceiptOnMarkPaid(input);
  if (!gate.ok) {
    return receiptMiss(gate.reason, input.paidSucceeded === true && input.status === 'paid');
  }
  const company = input.company ?? null;
  if (!company?.id) {
    return receiptMiss('not_found', true);
  }

  try {
    const load = input.loadBundle ?? loadInvoiceSendBundle;
    const bundle = await load(gate.invoiceId, company);
    const decision = decideInvoiceReceipt(bundle);
    if (!decision.ok) {
      return receiptMiss(blockerToReceiptReason(decision.blocker), true, decision.href, decision.message);
    }

    let generated: InvoicePdfAttachment | null = null;
    if (!bundle.existingPdf?.content) {
      try {
        const buildPdf = input.buildPdf ?? defaultInvoicePdfBuilder;
        const pdf = await buildPdf(bundle);
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
      return receiptMiss('no_pdf', true);
    }

    const { data, error } = await invoke('job-reminder', {
      body: {
        ...invoiceReceiptOnMarkPaidBody(gate.invoiceId),
        appUrl: typeof window !== 'undefined' ? window.location.origin : '',
        attachment: picked.attachment,
      },
    });

    if (error) {
      const fromBody = await readFunctionError(error);
      return receiptMiss(
        'send_failed',
        true,
        fromBody?.href,
        fromBody?.error || fromBody?.message || error.message || missInvoiceReceiptMessage('send_failed'),
      );
    }
    const body = (data ?? {}) as {
      error?: unknown;
      href?: string;
      sent?: boolean;
      message?: unknown;
      results?: Array<{ message?: unknown }>;
      to?: unknown;
      sms?: SmsSendResult | null;
      reason?: unknown;
    };
    if (body.error) {
      return receiptMiss(
        typeof body.reason === 'string' ? blockerToReceiptReason(String(body.reason)) : 'send_failed',
        true,
        body.href,
        String(body.error),
      );
    }
    if (body.sent === false) {
      const reason = typeof body.reason === 'string'
        ? blockerToReceiptReason(String(body.reason))
        : 'send_failed';
      return receiptMiss(
        reason,
        true,
        body.href,
        String(body.message ?? body.results?.[0]?.message ?? missInvoiceReceiptMessage(reason)),
      );
    }
    if (!body.sent) {
      return receiptMiss('send_failed', true);
    }

    const to = String(body.to ?? decision.to);
    const sms = (body.sms ?? null) as SmsSendResult | null;
    const message = String(body.message ?? '').trim()
      || formatEmailAndSmsMessage(`Receipt sent to ${to}`, sms);
    return { ok: true, to, markedPaid: true, message, sms };
  } catch (err) {
    return receiptMiss(
      'send_failed',
      true,
      undefined,
      err instanceof Error && err.message.trim() ? err.message : missInvoiceReceiptMessage('send_failed'),
    );
  }
}

/** Paid first. Receipt outcome next. Existing Xero miss last. Never unmarks paid. */
export function invoiceMarkPaidReceiptToast(args: {
  xeroToast: string;
  receipt: Pick<DeliverInvoiceReceiptResult, 'ok' | 'message'>;
}): string {
  const paidAndXero = args.xeroToast.trim().replace(/\.+$/, '');
  const receipt = args.receipt.message.trim().replace(/\.+$/, '');
  if (!receipt) return paidAndXero ? `${paidAndXero}.` : INVOICE_MARKED_PAID_MESSAGE;
  if (!paidAndXero) return `${receipt}.`;
  if (paidAndXero.includes(receipt)) return `${paidAndXero}.`;
  return `${paidAndXero}. ${receipt}.`;
}

/** Quiet line on the existing invoice sheet. Names the miss. Not a second primary. */
export function invoiceMarkPaidSheetMissLine(args: {
  xeroLine: string | null | undefined;
  receipt: Pick<DeliverInvoiceReceiptResult, 'ok' | 'message'>;
}): string | null {
  const receiptMissText = args.receipt.ok ? '' : args.receipt.message.trim();
  const xeroLine = (args.xeroLine ?? '').trim();
  if (!receiptMissText && !xeroLine) return null;
  if (xeroLine && receiptMissText) {
    const receiptOnly = receiptMissText.replace(/\.+$/, '');
    if (xeroLine.includes(receiptOnly)) return xeroLine;
    return `${xeroLine.replace(/\.+$/, '')}. ${receiptOnly}.`;
  }
  if (xeroLine) return xeroLine;
  return `${INVOICE_MARKED_PAID_MESSAGE}. ${receiptMissText.replace(/\.+$/, '')}.`;
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
  const client = clientRes.data as { name?: string | null; email?: string | null; phone?: string | null } | null;
  const job = jobRes.data as { title?: string | null; address?: string | null } | null;
  return {
    ...inv,
    inclusions: asStringList(inv.inclusions),
    exclusions: asStringList(inv.exclusions),
    client_name: client?.name ?? null,
    client_email: client?.email ?? null,
    client_phone: client?.phone ?? null,
    job_title: job?.title ?? null,
    job_address: job?.address ?? null,
  };
}
