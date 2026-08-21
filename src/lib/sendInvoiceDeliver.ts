import { format, parseISO } from 'date-fns';
import { supabase } from './supabase';
import { formatMoney } from '../types/fsm';
import {
  applyInvoiceSendScope,
  blobToBase64,
  decideInvoiceSend,
  invoiceByIdQuery,
  invoicePdfStoragePath,
  invoiceSendClientQuery,
  invoiceSendHtml,
  invoiceSendJobQuery,
  invoiceSendQueries,
  invoiceStatusPatchAfterSend,
  pickInvoicePdfAttachment,
  shouldRecordInvoiceSent,
  type InvoicePdfAttachment,
  type InvoiceSendBundle,
  type InvoiceSendCompany,
  type SmtpSettingsRow,
} from './sendInvoice';
import { asStringList } from './asStringList';
import type { InvoiceWithDetails } from '../types/fsm';

export type DeliverInvoiceResult =
  | { ok: true; to: string; markedSent: true }
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
 * Email the invoice, then mark sent only if delivery succeeded.
 * Callers must not flip status themselves on a failed result.
 * Attaches an existing stored PDF when one is on file; otherwise builds one.
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
        filename: decision.filename,
        content: await blobToBase64(pdf),
        contentType: 'application/pdf',
      };
    } catch {
      generated = null;
    }
  }

  const attachment = pickInvoicePdfAttachment({
    existing: bundle.existingPdf,
    generated,
  });

  const dueLabel = bundle.invoice?.due_date
    ? format(parseISO(bundle.invoice.due_date), 'd MMM yyyy')
    : null;
  const html = invoiceSendHtml({
    clientName: decision.toName,
    companyName: args.company.name,
    invoiceNumber: bundle.invoice?.invoice_number,
    totalLabel: formatMoney(Number(bundle.invoice?.total) || 0),
    dueLabel,
    paymentTerms: bundle.invoice?.payment_terms ?? null,
    attachedPdf: !!attachment,
  });

  const { data, error } = await supabase.functions.invoke('send-invoice', {
    body: {
      invoiceId: args.invoiceId,
      to: decision.to,
      subject: decision.subject,
      html,
      attachment: attachment ?? undefined,
    },
  });

  if (error) {
    const fromBody = await readFunctionError(error);
    return {
      ok: false,
      message: fromBody?.error || error.message || 'Could not send the invoice.',
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
  if (!data?.success) {
    return { ok: false, message: 'Invoice was not sent.', markedSent: false };
  }

  const currentStatus = bundle.invoice?.status ?? 'draft';
  if (shouldRecordInvoiceSent(true, currentStatus)) {
    const patch = invoiceStatusPatchAfterSend(true);
    if (patch) {
      const { error: statusErr } = await supabase
        .from('invoices')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', args.invoiceId)
        .eq('company_id', args.company.id);
      if (statusErr) {
        // Email already went. Status write is best-effort; the edge function also marks sent.
      }
    }
  }

  return { ok: true, to: decision.to, markedSent: true };
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
