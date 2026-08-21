import { format, parseISO } from 'date-fns';
import { quoteClientDetailFromClient } from './clientRecords';
import { asStringList } from './asStringList';
import { linesFromQuoteItems, type CommercialPdfData } from '../reports/commercial/CommercialDocumentPdf';
import type { InvoiceLineItem, InvoiceStatus } from '../types/fsm';
import {
  COMPANY_TIME_ZONE,
  decideSmsBeside,
  emailSettingsReady,
  missSmsMessage,
  prefillReminderTo,
  prefillSmsTo,
  ymdInTimeZone,
  type ReminderEmailSettings,
  type SmsCredentials,
  type SmsDecision,
} from './jobReminder';
import { effectiveInvoiceStatus } from './invoiceStatus';

export const COMPANY_EMAIL_SETTINGS_HREF = '/settings/company';

export type InvoiceSendBlocker =
  | 'not_found'
  | 'no_client'
  | 'no_email'
  | 'no_smtp'
  | 'no_lines'
  | 'paid';

export type InvoiceSendQueryTable = 'invoices' | 'clients' | 'email_settings' | 'jobs';

export type InvoiceSendQueryScope = {
  table: InvoiceSendQueryTable;
  columns: string;
  eq: Record<string, string>;
};

export type SmtpSettingsRow = {
  smtp_host?: string | null;
  smtp_pass?: string | null;
  from_name?: string | null;
  from_email?: string | null;
};

export type InvoiceSendDecision =
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
      blocker: InvoiceSendBlocker;
      message: string;
      href?: string;
    };

export type InvoiceSendCompany = {
  name: string;
  abn?: string | null;
  licence_number?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logo_url?: string | null;
};

export type InvoiceSendInvoice = {
  id: string;
  company_id: string;
  invoice_number: number | null;
  client_id: string | null;
  job_id: string | null;
  status: string;
  line_items: InvoiceLineItem[] | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  payment_terms: string | null;
  due_date: string | null;
  notes: string | null;
  inclusions: unknown;
  exclusions: unknown;
  chased_at?: string | null;
};

export type InvoiceSendClient = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
};

export type InvoiceSendBundle = {
  invoice: InvoiceSendInvoice | null;
  client: InvoiceSendClient | null;
  jobAddress: string | null;
  smtp: SmtpSettingsRow | null;
  company: InvoiceSendCompany;
  existingPdf?: InvoicePdfAttachment | null;
};

export type InvoicePdfAttachment = {
  filename: string;
  content: string;
  contentType?: string;
};

export const INVOICE_SEND_INVOICE_COLUMNS =
  'id, company_id, invoice_number, client_id, job_id, quote_id, source, status, line_items, subtotal, tax_rate, tax_amount, total, payment_terms, due_date, notes, inclusions, exclusions, chased_at, created_by, created_at, updated_at';

export const INVOICE_SEND_CLIENT_COLUMNS = 'id, name, email, phone, address';
export const INVOICE_SEND_SMTP_COLUMNS = 'smtp_host, smtp_pass, from_name, from_email';
export const INVOICE_SEND_JOB_COLUMNS = 'id, address';

export const NO_EMAIL_MESSAGE = 'This client has no email. Add one on the client record before you send.';
export const NO_SMTP_MESSAGE = 'Email is not set up. Add SMTP in Company settings — there is a test send there.';
export const NO_LINES_MESSAGE = 'Add at least one line item before you send.';
export const NO_PDF_MESSAGE = 'The invoice PDF could not be attached — invoice was not sent.';

/**
 * Same pipe as job / due reminders on main.
 * One invoice by id + company → email_settings + Resend → sent only on 2xx.
 */
export const INVOICE_SEND_PIPE = [
  'supabase.functions.invoke job-reminder',
  'invoiceId (one invoice, company_id scoped — not the ledger)',
  'email_settings where Resend is ready (companies without SMTP are not mailed)',
  'To = client.email (never invented)',
  'attach existing invoice PDF (stored reports path or commercial generateCommercialPdf)',
  'POST https://api.resend.com/emails with email_settings.smtp_pass',
  'SMS beside: clients.phone via Twilio edge secrets on job-reminder (email status / chased_at unchanged if SMS misses)',
  'UPDATE invoices.status = sent only when Resend returns 2xx (never paid)',
  'UPDATE invoices.chased_at only when Resend returns 2xx on overdue / sent-again',
] as const;

export function padInvoiceNumber(n: number | null | undefined): string {
  return String(n ?? 0).padStart(4, '0');
}

/** Trim and require a real address. Same rule as job / due reminder To. */
export function clientEmailForSend(email: string | null | undefined): string | null {
  const to = prefillReminderTo({ id: '', email });
  return to || null;
}

/** Client SMS To from clients.phone. Empty is an honest miss, not a send blocker. */
export function clientPhoneForSms(phone: string | null | undefined): string | null {
  const to = prefillSmsTo(phone);
  return to || null;
}

export function decideInvoiceSms(args: {
  phone?: string | null;
  credentials?: SmsCredentials | null;
}): SmsDecision {
  return decideSmsBeside({ phone: args.phone, credentials: args.credentials });
}

export type InvoiceSendCopyKind = 'first' | 'chase';

export function invoiceDueLabel(dueDate: string | null | undefined): string | null {
  const day = (dueDate ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return format(parseISO(day), 'd MMM yyyy');
}

/** Draft first-send stays signed invoice Send. Overdue / sent-again is chase copy. */
export function invoiceSendCopyKind(
  inv: { status: string; due_date?: string | null },
  now = new Date(),
): InvoiceSendCopyKind {
  if (inv.status === 'draft' || inv.status === 'paid') return 'first';
  if (inv.status === 'sent' || inv.status === 'overdue') return 'chase';
  return effectiveInvoiceStatus(inv, now) === 'overdue' ? 'chase' : 'first';
}

export function invoiceSmsBody(opts: {
  companyName: string;
  invoiceNumber: number | null | undefined;
  totalLabel: string;
  dueLabel: string | null;
}): string {
  const who = opts.companyName.trim() || 'your contractor';
  const due = opts.dueLabel ? ` Due ${opts.dueLabel}.` : '';
  return `${who} sent invoice #${padInvoiceNumber(opts.invoiceNumber)}. Total (inc GST): ${opts.totalLabel}.${due} The PDF is in your email.`;
}

export function invoiceChaseSmsBody(opts: {
  companyName: string;
  invoiceNumber: number | null | undefined;
  totalLabel: string;
  dueLabel: string | null;
}): string {
  const who = opts.companyName.trim() || 'your contractor';
  const due = opts.dueLabel ? ` Due ${opts.dueLabel}.` : '';
  return `${who}: invoice #${padInvoiceNumber(opts.invoiceNumber)} is overdue.${due} Total (inc GST): ${opts.totalLabel}. The PDF is in your email.`;
}

/** Same Resend gate as job-reminder / due inspections. */
export function isSmtpReady(settings: SmtpSettingsRow | ReminderEmailSettings | null | undefined): boolean {
  return emailSettingsReady(settings);
}

export function invoiceHasChargeableLines(
  lineItems: { description?: string | null; quantity?: number | string | null }[] | null | undefined,
): boolean {
  return (lineItems ?? []).some(li => (li.description ?? '').trim() && Number(li.quantity) > 0);
}

export function invoiceSendSubject(invoiceNumber: number | null | undefined, companyName: string): string {
  const who = companyName.trim() || 'your contractor';
  return `Invoice #${padInvoiceNumber(invoiceNumber)} from ${who}`;
}

export function invoiceChaseSubject(
  invoiceNumber: number | null | undefined,
  companyName: string,
  dueLabel?: string | null,
): string {
  const who = companyName.trim() || 'your contractor';
  const due = dueLabel?.trim() ? ` — due ${dueLabel.trim()}` : '';
  return `Overdue invoice #${padInvoiceNumber(invoiceNumber)} from ${who}${due}`;
}

export function invoicePdfFilename(invoiceNumber: number | null | undefined): string {
  return `invoice-${padInvoiceNumber(invoiceNumber)}.pdf`;
}

/** Conventional reports-bucket path for a stored invoice PDF. */
export function invoicePdfStoragePath(companyId: string, invoiceId: string): string {
  const company = companyId.trim();
  const invoice = invoiceId.trim();
  if (!company || !invoice) return '';
  return `invoices/${company}/${invoice}.pdf`;
}

export function invoiceSendHtml(opts: {
  clientName: string;
  companyName: string;
  invoiceNumber: number | null | undefined;
  totalLabel: string;
  dueLabel: string | null;
  paymentTerms?: string | null;
  attachedPdf: boolean;
}): string {
  const client = escapeHtml(opts.clientName.trim() || 'there');
  const company = escapeHtml(opts.companyName.trim() || 'us');
  const number = escapeHtml(`#${padInvoiceNumber(opts.invoiceNumber)}`);
  const total = escapeHtml(opts.totalLabel);
  const due = opts.dueLabel
    ? `<p style="color:#4A5568;font-size:15px;line-height:1.6;">Due <strong>${escapeHtml(opts.dueLabel)}</strong>.</p>`
    : '';
  const terms = opts.paymentTerms?.trim()
    ? `<p style="color:#4A5568;font-size:15px;line-height:1.6;">Payment terms: ${escapeHtml(opts.paymentTerms.trim())}</p>`
    : '';
  const pdfLine = opts.attachedPdf
    ? '<p>The invoice PDF is attached. Reply to this email if you have a question about the charges.</p>'
    : '<p>Reply to this email if you have a question about the charges.</p>';
  return `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A">
        <div style="background:#0A2540;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
          <div style="font-size:12px;opacity:.7;letter-spacing:1px;text-transform:uppercase">Invoice</div>
          <h1 style="margin:8px 0 0;font-size:20px">${number}</h1>
        </div>
        <div style="border:1px solid #E5E7EB;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p>Hi ${client},</p>
          <p>${company} has sent you invoice ${number}.</p>
          <p style="color:#4A5568;font-size:15px;line-height:1.6;">Total (inc GST): <strong>${total}</strong></p>
          ${due}
          ${terms}
          ${pdfLine}
        </div>
      </div>`;
}

export function invoiceChaseHtml(opts: {
  clientName: string;
  companyName: string;
  invoiceNumber: number | null | undefined;
  totalLabel: string;
  dueLabel: string | null;
  paymentTerms?: string | null;
  attachedPdf: boolean;
}): string {
  const client = escapeHtml(opts.clientName.trim() || 'there');
  const company = escapeHtml(opts.companyName.trim() || 'us');
  const number = escapeHtml(`#${padInvoiceNumber(opts.invoiceNumber)}`);
  const total = escapeHtml(opts.totalLabel);
  const due = opts.dueLabel
    ? `<p style="color:#4A5568;font-size:15px;line-height:1.6;">This invoice is overdue. Due <strong>${escapeHtml(opts.dueLabel)}</strong>.</p>`
    : '<p style="color:#4A5568;font-size:15px;line-height:1.6;">This invoice is overdue.</p>';
  const terms = opts.paymentTerms?.trim()
    ? `<p style="color:#4A5568;font-size:15px;line-height:1.6;">Payment terms: ${escapeHtml(opts.paymentTerms.trim())}</p>`
    : '';
  const pdfLine = opts.attachedPdf
    ? '<p>The invoice PDF is attached. Reply to this email if you have a question about the charges.</p>'
    : '<p>Reply to this email if you have a question about the charges.</p>';
  return `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A">
        <div style="background:#0A2540;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
          <div style="font-size:12px;opacity:.7;letter-spacing:1px;text-transform:uppercase">Overdue invoice</div>
          <h1 style="margin:8px 0 0;font-size:20px">${number}</h1>
        </div>
        <div style="border:1px solid #E5E7EB;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p>Hi ${client},</p>
          <p>${company} is chasing overdue invoice ${number}.</p>
          <p style="color:#4A5568;font-size:15px;line-height:1.6;">Total (inc GST): <strong>${total}</strong></p>
          ${due}
          ${terms}
          ${pdfLine}
        </div>
      </div>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Status write after a send attempt. Failure must not flip draft → sent. */
export function invoiceStatusAfterSend(sendSucceeded: boolean, currentStatus: string): InvoiceStatus | string {
  if (!sendSucceeded) return currentStatus;
  if (currentStatus === 'paid') return 'paid';
  if (currentStatus === 'draft' || currentStatus === 'sent' || currentStatus === 'overdue') return 'sent';
  return currentStatus;
}

export function invoiceStatusPatchAfterSend(sendSucceeded: boolean): { status: 'sent' } | null {
  return sendSucceeded ? { status: 'sent' } : null;
}

export function shouldRecordInvoiceSent(sendOk: boolean, currentStatus: string): boolean {
  return sendOk === true && currentStatus !== 'paid';
}

/** chased_at is overdue / sent-again only. Failure and SMS miss must not invent it. */
export function invoiceChasedAtPatchAfterSend(
  sendSucceeded: boolean,
  kind: InvoiceSendCopyKind,
  now = new Date(),
): { chased_at: string } | null {
  if (!sendSucceeded || kind !== 'chase') return null;
  return { chased_at: now.toISOString() };
}

export function shouldWriteInvoiceChasedAt(sendOk: boolean, kind: InvoiceSendCopyKind): boolean {
  return sendOk === true && kind === 'chase';
}

export function alreadyChasedToday(
  chasedAt: string | null | undefined,
  now = new Date(),
  timeZone = COMPANY_TIME_ZONE,
): boolean {
  if (!chasedAt) return false;
  const chased = new Date(chasedAt);
  if (Number.isNaN(chased.getTime())) return false;
  return ymdInTimeZone(chased, timeZone) === ymdInTimeZone(now, timeZone);
}

/** Cron due=overdue: sent invoices whose due_date is before Perth today. Skip paid/draft. */
export function isEffectiveOverdueForChase(
  inv: { status: string; due_date?: string | null },
  perthToday: string,
): boolean {
  if (inv.status === 'paid' || inv.status === 'draft') return false;
  if (inv.status !== 'sent' && inv.status !== 'overdue') return false;
  const due = (inv.due_date ?? '').trim().slice(0, 10);
  return !!due && due < perthToday;
}

export function shouldCronChaseInvoice(
  inv: { status: string; due_date?: string | null; chased_at?: string | null },
  perthToday: string,
  now = new Date(),
): boolean {
  if (!isEffectiveOverdueForChase(inv, perthToday)) return false;
  return !alreadyChasedToday(inv.chased_at, now);
}

export function invoiceByIdQuery(args: { companyId: string; invoiceId: string }): InvoiceSendQueryScope | null {
  const companyId = args.companyId.trim();
  const invoiceId = args.invoiceId.trim();
  if (!companyId || !invoiceId) return null;
  return {
    table: 'invoices',
    columns: INVOICE_SEND_INVOICE_COLUMNS,
    eq: { id: invoiceId, company_id: companyId },
  };
}

export function invoiceSendQueries(args: { companyId: string; invoiceId: string }): {
  invoice: InvoiceSendQueryScope;
  smtp: InvoiceSendQueryScope;
} {
  return {
    invoice: {
      table: 'invoices',
      columns: INVOICE_SEND_INVOICE_COLUMNS,
      eq: { id: args.invoiceId, company_id: args.companyId },
    },
    smtp: {
      table: 'email_settings',
      columns: INVOICE_SEND_SMTP_COLUMNS,
      eq: { company_id: args.companyId },
    },
  };
}

export function invoiceSendClientQuery(clientId: string | null | undefined): InvoiceSendQueryScope | null {
  const id = (clientId ?? '').trim();
  if (!id) return null;
  return { table: 'clients', columns: INVOICE_SEND_CLIENT_COLUMNS, eq: { id } };
}

export function invoiceSendJobQuery(jobId: string | null | undefined): InvoiceSendQueryScope | null {
  const id = (jobId ?? '').trim();
  if (!id) return null;
  return { table: 'jobs', columns: INVOICE_SEND_JOB_COLUMNS, eq: { id } };
}

export function isInvoiceSendScoped(scope: InvoiceSendQueryScope): boolean {
  if (scope.table === 'invoices') return !!scope.eq.id && !!scope.eq.company_id;
  if (scope.table === 'clients' || scope.table === 'jobs') return !!scope.eq.id;
  if (scope.table === 'email_settings') return !!scope.eq.company_id;
  return false;
}

/** True when a fetch would read more than this one invoice / its client / company SMTP. */
export function wouldScanLedgerToSendInvoice(scope: InvoiceSendQueryScope | null): boolean {
  if (scope == null) return false;
  return !isInvoiceSendScoped(scope);
}

type FilterBuilder = {
  eq: (column: string, value: string) => FilterBuilder;
  maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
};

export function applyInvoiceSendScope<T>(
  fromBuilder: { select: (columns: string) => T },
  scope: InvoiceSendQueryScope,
): T & FilterBuilder {
  let q = fromBuilder.select(scope.columns) as T & FilterBuilder;
  for (const [column, value] of Object.entries(scope.eq)) {
    q = q.eq(column, value) as typeof q;
  }
  return q;
}

export function decideInvoiceSend(bundle: InvoiceSendBundle): InvoiceSendDecision {
  const invoice = bundle.invoice;
  if (!invoice) {
    return { ok: false, blocker: 'not_found', message: 'Invoice not found.' };
  }
  if (invoice.status === 'paid') {
    return { ok: false, blocker: 'paid', message: 'This invoice is paid.' };
  }
  if (!invoice.client_id) {
    return { ok: false, blocker: 'no_client', message: 'Pick a client before you can send this invoice.' };
  }
  if (!invoiceHasChargeableLines(invoice.line_items)) {
    return { ok: false, blocker: 'no_lines', message: NO_LINES_MESSAGE };
  }
  if (!isSmtpReady(bundle.smtp)) {
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
      href: invoice.client_id ? `/clients/${invoice.client_id}` : undefined,
    };
  }
  const smsTo = clientPhoneForSms(bundle.client?.phone);
  const dueLabel = invoiceDueLabel(invoice.due_date);
  const kind = invoiceSendCopyKind(invoice);
  return {
    ok: true,
    to,
    toName: (bundle.client?.name ?? '').trim() || 'Client',
    subject: kind === 'chase'
      ? invoiceChaseSubject(invoice.invoice_number, bundle.company.name, dueLabel)
      : invoiceSendSubject(invoice.invoice_number, bundle.company.name),
    filename: invoicePdfFilename(invoice.invoice_number),
    smsTo,
    smsMessage: smsTo ? null : missSmsMessage('no_phone'),
  };
}

/**
 * Prefer a stored PDF when one exists. Do not invent a second document.
 * Generated is only used when nothing is already on file.
 */
export function pickInvoicePdfAttachment(args: {
  existing?: InvoicePdfAttachment | null;
  generated?: InvoicePdfAttachment | null;
}): InvoicePdfAttachment | null {
  if (args.existing?.content && args.existing.filename) {
    return {
      filename: args.existing.filename,
      content: args.existing.content,
      contentType: args.existing.contentType || 'application/pdf',
    };
  }
  if (args.generated?.content && args.generated.filename) {
    return {
      filename: args.generated.filename,
      content: args.generated.content,
      contentType: args.generated.contentType || 'application/pdf',
    };
  }
  return null;
}

export function invoiceAttachmentOrMiss(
  attachment: InvoicePdfAttachment | null | undefined,
): { ok: true; attachment: InvoicePdfAttachment } | { ok: false; reason: 'no_pdf'; message: string } {
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

export function commercialPdfDataForInvoice(bundle: InvoiceSendBundle, now = new Date()): CommercialPdfData | null {
  const invoice = bundle.invoice;
  if (!invoice) return null;
  const lines = (invoice.line_items ?? []).filter(
    li => (li.description ?? '').trim() && Number(li.quantity) > 0,
  );
  return {
    kind: 'invoice',
    title: 'Invoice charges',
    docNumber: invoice.invoice_number != null ? `#${padInvoiceNumber(invoice.invoice_number)}` : 'Draft',
    dateLabel: 'Date',
    dateValue: format(now, 'd MMM yyyy'),
    secondaryLabel: 'Due',
    secondaryValue: invoice.due_date ? format(parseISO(invoice.due_date), 'd MMM yyyy') : '—',
    clientName: bundle.client?.name ?? '—',
    clientDetail: quoteClientDetailFromClient(bundle.client, bundle.jobAddress),
    company: {
      name: bundle.company.name,
      abn: bundle.company.abn ?? null,
      licence_number: bundle.company.licence_number ?? null,
      phone: bundle.company.phone ?? null,
      email: bundle.company.email ?? null,
      website: bundle.company.website ?? null,
      logo_url: bundle.company.logo_url ?? null,
    },
    inclusions: asStringList(invoice.inclusions),
    exclusions: asStringList(invoice.exclusions),
    lines: linesFromQuoteItems(lines),
    subtotal: Number(invoice.subtotal) || 0,
    taxRate: Number(invoice.tax_rate) || 0,
    taxAmount: Number(invoice.tax_amount) || 0,
    total: Number(invoice.total) || 0,
    notes: invoice.notes?.trim() || null,
    paymentTerms: invoice.payment_terms?.trim() || null,
  };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Defence in depth: even if a mixed ledger is passed, only this company's
 * invoice with this id is selected. Used by tests to prove we do not walk
 * the company book.
 */
export function pickInvoiceByIdAndCompany(
  rows: Array<{ id: string; company_id: string }>,
  invoiceId: string,
  companyId: string,
): { id: string; company_id: string } | null {
  const id = invoiceId.trim();
  const company = companyId.trim();
  if (!id || !company) return null;
  for (const row of rows) {
    if (row.id === id && row.company_id === company) return row;
  }
  return null;
}
