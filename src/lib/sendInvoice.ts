import { format, parseISO } from 'date-fns';
import { quoteClientDetailFromClient } from './clientRecords';
import { asStringList } from './asStringList';
import { linesFromQuoteItems, type CommercialPdfData } from '../reports/commercial/CommercialDocumentPdf';
import type { InvoiceLineItem, InvoiceStatus } from '../types/fsm';
import {
  dateOnly,
  decideSmsBeside,
  emailSettingsReady,
  missSmsMessage,
  prefillReminderTo,
  prefillSmsTo,
  todayYmd,
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
  | 'paid'
  | 'not_paid';

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
export const NO_RECEIPT_EMAIL_MESSAGE = 'This client has no email — receipt was not sent.';
export const NO_RECEIPT_SMTP_MESSAGE = 'Email is not set up — receipt was not sent.';
export const NO_RECEIPT_PDF_MESSAGE = 'The invoice PDF could not be attached — receipt was not sent.';
export const NO_RECEIPT_INVOICE_MESSAGE = 'Invoice not found — receipt was not sent.';
export const NO_RECEIPT_CLIENT_MESSAGE = 'This invoice has no client — receipt was not sent.';
export const NO_RECEIPT_LINES_MESSAGE = 'This invoice has no line items — receipt was not sent.';
export const RECEIPT_NOT_PAID_MESSAGE = 'Receipt is for paid invoices.';

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
  'After Resend 2xx: invoke xero-accounting action=sync for this invoiceId only when connected and invoice sync is on (honest miss does not unsend)',
  'Mark paid receipt: same invoiceId / deliverInvoiceSend with purpose=receipt — paid / thank you copy, no chased_at, miss does not unmark paid',
] as const;

/**
 * After Mark paid succeeds locally. Same job-reminder invoiceId pipe as Send.
 * Receipt copy — not chase. No new dialog, cron, or PDF type.
 */
export const INVOICE_RECEIPT_ON_MARK_PAID_PATH = [
  'Mark paid succeeds locally (invoices.status = paid) — invoice stays paid even if receipt misses',
  'deliverInvoiceReceiptAfterMarkPaid beside attachXeroPaymentAfterMarkPaid (either miss does not unmark paid)',
  'supabase.functions.invoke job-reminder invoiceId purpose=receipt (same deliverInvoiceSend)',
  'receipt copy (paid / thank you) — not overdue chase subject, not Send again chase copy',
  'attach existing invoice PDF (stored reports path or commercial generateCommercialPdf) — no new receipt PDF type',
  'POST https://api.resend.com/emails with email_settings.smtp_pass',
  'SMS beside: clients.phone via Twilio — miss does not write chased_at or unmark paid',
  'Receipt email success follows Resend 2xx only',
  'honest miss: no_email / no_smtp / no_phone / no_sms_credentials / no_pdf / no_invoice — paid stays paid',
  'do not write invoices.chased_at for this send',
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

export type InvoiceSendCopyKind = 'first' | 'chase' | 'receipt';

export function invoiceDueLabel(dueDate: string | null | undefined): string | null {
  const day = (dueDate ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return format(parseISO(day), 'd MMM yyyy');
}

/** Draft first-send stays signed invoice Send. Overdue / sent-again is chase. Paid is receipt. */
export function invoiceSendCopyKind(
  inv: { status: string; due_date?: string | null },
  now = new Date(),
): InvoiceSendCopyKind {
  if (inv.status === 'paid') return 'receipt';
  if (inv.status === 'draft') return 'first';
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

export function invoiceReceiptSmsBody(opts: {
  companyName: string;
  invoiceNumber: number | null | undefined;
  totalLabel: string;
}): string {
  const who = opts.companyName.trim() || 'your contractor';
  return `${who} received payment for invoice #${padInvoiceNumber(opts.invoiceNumber)}. Total (inc GST): ${opts.totalLabel}. The receipt PDF is in your email.`;
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

export function invoiceReceiptSubject(
  invoiceNumber: number | null | undefined,
  companyName: string,
): string {
  const who = companyName.trim() || 'your contractor';
  return `Receipt for invoice #${padInvoiceNumber(invoiceNumber)} from ${who}`;
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

export function invoiceReceiptHtml(opts: {
  clientName: string;
  companyName: string;
  invoiceNumber: number | null | undefined;
  totalLabel: string;
  attachedPdf: boolean;
}): string {
  const client = escapeHtml(opts.clientName.trim() || 'there');
  const company = escapeHtml(opts.companyName.trim() || 'us');
  const number = escapeHtml(`#${padInvoiceNumber(opts.invoiceNumber)}`);
  const total = escapeHtml(opts.totalLabel);
  const pdfLine = opts.attachedPdf
    ? '<p>The invoice PDF is attached as your receipt. Reply to this email if you have a question.</p>'
    : '<p>Reply to this email if you have a question.</p>';
  return `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A">
        <div style="background:#0A2540;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
          <div style="font-size:12px;opacity:.7;letter-spacing:1px;text-transform:uppercase">Receipt</div>
          <h1 style="margin:8px 0 0;font-size:20px">${number}</h1>
        </div>
        <div style="border:1px solid #E5E7EB;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p>Hi ${client},</p>
          <p>Thank you. ${company} has received payment for invoice ${number}.</p>
          <p style="color:#4A5568;font-size:15px;line-height:1.6;">Total (inc GST): <strong>${total}</strong></p>
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

/** chased_at is overdue / sent-again only. Receipt, first-send, fail, and SMS miss must not invent it. */
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

export type OverdueInvoiceMissReason =
  | 'no_email'
  | 'no_smtp'
  | 'no_invoice'
  | 'no_client'
  | 'no_lines'
  | 'no_pdf'
  | 'no_phone'
  | 'no_due_date'
  | 'not_overdue'
  | 'paid'
  | 'already_chased'
  | 'wrong_company';

export type OverdueInvoiceQueryScope = {
  table: 'invoices' | 'clients' | 'email_settings';
  columns: string;
  eq: Record<string, string>;
  inFilters: Record<string, string[]>;
  lt?: Record<string, string>;
  isNull?: string[];
  notNull?: string[];
};

export type OverdueChaseInvoice = InvoiceSendInvoice;

export type OverdueInvoiceCaller =
  | { kind: 'user'; companyId: string }
  | { kind: 'cron' };

/**
 * How overdue chase auto-fire actually runs — same Perth cron as the 24h job ping.
 * No Send again click. No new notify module. No new cron stack.
 * pg_cron job-client-reminder-* → invoke_job_client_reminders() → job-reminder due=overdue.
 */
export const OVERDUE_INVOICE_AUTO_FIRE_PATH = [
  'pg_cron job-client-reminder-perth-morning (0 23 * * * UTC = 07:00 Australia/Perth)',
  'pg_cron job-client-reminder-perth-afternoon (0 8 * * * UTC = 16:00 Australia/Perth)',
  'SELECT public.invoke_job_client_reminders()',
  'pg_net POST /functions/v1/job-reminder due=overdue source=cron',
  'perth_today = (timezone(Australia/Perth, now()))::date',
  'UPDATE invoices.status=overdue where status=sent and due_date < perth_today (already-overdue/no due_date stay put)',
  'email_settings where Resend is ready (companies without SMTP are not scanned)',
  'invoices where company_id = settings.company_id and status in (sent, overdue) and due_date < perth_today and chased_at is null',
  'then invoices where company_id = settings.company_id and status in (sent, overdue) and due_date < perth_today and chased_at <= perth_today minus 7 days (last-7-day rows skip)',
  'skip already_chased in the last 7 Perth days; skip paid; skip draft; skip no client email; skip no stored PDF',
  'POST https://api.resend.com/emails with email_settings.smtp_pass — same deliverInvoiceSend auto chase copy',
  'POST https://api.twilio.com SMS beside email — miss does not flip chased_at',
  'UPDATE invoices.chased_at only when Resend returns 2xx',
] as const;

/** Fixed Perth gap for this slice. Not a settings column. Not chase_count. */
export const SECOND_OVERDUE_CHASE_PERTH_DAYS = 7;

export const OVERDUE_INVOICE_STATUSES = ['sent', 'overdue'] as const;

export function alreadyChasedInvoice(invoice: { chased_at?: string | null } | null | undefined): boolean {
  return Boolean((invoice?.chased_at ?? '').trim());
}

/** Calendar add on a YYYY-MM-DD. Used for perth_today minus 7 — not wall-clock hours. */
export function addCalendarDaysYmd(ymd: string, days: number): string {
  const day = dateOnly(ymd);
  if (!day) return '';
  const [y, m, d] = day.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

/** Perth midnight as timestamptz. Australia/Perth is UTC+8 year-round. */
export function perthDayStartIso(ymd: string): string {
  const day = dateOnly(ymd);
  if (!day) return '';
  return `${day}T00:00:00+08:00`;
}

export function secondChaseOnOrBeforeYmd(now = new Date()): string {
  return addCalendarDaysYmd(todayYmd(now), -SECOND_OVERDUE_CHASE_PERTH_DAYS);
}

/**
 * Exclusive upper bound for chased_at.
 * Perth date of chased_at <= today minus 7  <=>  chased_at < start of Perth day (today minus 6).
 */
export function secondChaseChasedAtBeforeIso(now = new Date()): string {
  const exclusiveDay = addCalendarDaysYmd(todayYmd(now), -(SECOND_OVERDUE_CHASE_PERTH_DAYS - 1));
  return perthDayStartIso(exclusiveDay);
}

export function invoiceChasedOnPerthDay(
  invoice: { chased_at?: string | null } | null | undefined,
): string | null {
  const raw = (invoice?.chased_at ?? '').trim();
  if (!raw) return null;
  const chasedAt = new Date(raw);
  if (Number.isNaN(chasedAt.getTime())) return null;
  return ymdInTimeZone(chasedAt);
}

/** Last chase was 7 or more Perth days ago. Null chased_at is the first-chase slice. */
export function invoiceDueForSecondChase(
  invoice: { chased_at?: string | null } | null | undefined,
  now = new Date(),
): boolean {
  const chasedDay = invoiceChasedOnPerthDay(invoice);
  if (!chasedDay) return false;
  return chasedDay <= secondChaseOnOrBeforeYmd(now);
}

/** Chased in the last 7 Perth days — skip. Does not include unchased rows. */
export function recentlyChasedInvoice(
  invoice: { chased_at?: string | null } | null | undefined,
  now = new Date(),
): boolean {
  return alreadyChasedInvoice(invoice) && !invoiceDueForSecondChase(invoice, now);
}

export function missOverdueChaseMessage(reason: OverdueInvoiceMissReason): string {
  switch (reason) {
    case 'no_email':
      return NO_EMAIL_MESSAGE;
    case 'no_smtp':
      return NO_SMTP_MESSAGE;
    case 'no_invoice':
      return 'Invoice not found.';
    case 'no_client':
      return 'Pick a client before you can send this invoice.';
    case 'no_lines':
      return NO_LINES_MESSAGE;
    case 'no_pdf':
      return NO_PDF_MESSAGE;
    case 'no_phone':
      return missSmsMessage('no_phone');
    case 'no_due_date':
      return 'This invoice has no due date — chase was not sent.';
    case 'not_overdue':
      return 'Chase is for overdue invoices.';
    case 'paid':
      return 'This invoice is paid.';
    case 'already_chased':
      return 'Already chased — invoice was not sent again.';
    case 'wrong_company':
      return 'This invoice is not in this company.';
    default:
      return 'Invoice was not sent.';
  }
}

/** Perth calendar. Sent / overdue with due_date before today. Draft and paid never auto-fire. */
export function invoiceOverdueForAutofire(
  inv: { status: string; due_date?: string | null },
  now = new Date(),
): boolean {
  if (inv.status === 'paid' || inv.status === 'draft') return false;
  if (inv.status !== 'sent' && inv.status !== 'overdue') return false;
  const due = dateOnly(inv.due_date);
  if (!due) return false;
  return due < todayYmd(now);
}

/**
 * Persist stored overdue on this hop. Only status=sent + due_date < Perth today.
 * Already overdue is not rewritten. No due_date is not overdue.
 */
export function shouldStampInvoiceStatusOverdue(
  inv: { status: string; due_date?: string | null },
  now = new Date(),
): boolean {
  if (inv.status !== 'sent') return false;
  const due = dateOnly(inv.due_date);
  if (!due) return false;
  return due < todayYmd(now);
}

export function invoiceOverdueStampPatch(
  inv: { status: string; due_date?: string | null },
  now = new Date(),
): { status: 'overdue' } | null {
  return shouldStampInvoiceStatusOverdue(inv, now) ? { status: 'overdue' } : null;
}

export function invoiceStatusAfterOverdueStamp(
  inv: { status: string; due_date?: string | null },
  now = new Date(),
): string {
  return invoiceOverdueStampPatch(inv, now)?.status ?? inv.status;
}

export type OverdueStampQueryScope = {
  table: 'invoices';
  patch: { status: 'overdue' };
  eq: { status: 'sent'; company_id?: string };
  lt: { due_date: string };
  notNull: readonly ['due_date'];
};

/** Single filtered UPDATE. Cron is all companies; user is company-scoped. Not a ledger walk. */
export function overdueInvoiceStampQuery(args?: {
  now?: Date;
  caller?: OverdueInvoiceCaller | null;
}): OverdueStampQueryScope {
  const companyId = args?.caller?.kind === 'user' ? args.caller.companyId.trim() : '';
  return {
    table: 'invoices',
    patch: { status: 'overdue' },
    eq: companyId ? { status: 'sent', company_id: companyId } : { status: 'sent' },
    lt: { due_date: todayYmd(args?.now) },
    notNull: ['due_date'],
  };
}

export function isOverdueStampQueryScoped(scope: OverdueStampQueryScope | null): boolean {
  if (!scope) return false;
  return scope.table === 'invoices'
    && scope.patch.status === 'overdue'
    && scope.eq.status === 'sent'
    && !!scope.lt.due_date
    && scope.notNull.includes('due_date');
}

export function wouldScanLedgerToStampOverdue(scope: OverdueStampQueryScope | null): boolean {
  if (scope == null) return false;
  return !isOverdueStampQueryScoped(scope);
}

type OverdueStampFilterBuilder = {
  eq: (column: string, value: string) => OverdueStampFilterBuilder;
  lt: (column: string, value: string) => OverdueStampFilterBuilder;
  not: (column: string, op: string, value: null) => OverdueStampFilterBuilder;
};

export function applyOverdueStampScope<T>(
  fromBuilder: { update: (patch: { status: 'overdue' }) => T },
  scope: OverdueStampQueryScope,
): T & OverdueStampFilterBuilder {
  let q = fromBuilder.update(scope.patch) as T & OverdueStampFilterBuilder;
  for (const [column, value] of Object.entries(scope.eq)) {
    if (value) q = q.eq(column, value) as typeof q;
  }
  q = q.not('due_date', 'is', null) as typeof q;
  q = q.lt('due_date', scope.lt.due_date) as typeof q;
  return q;
}

export function selectInvoicesToStampOverdue<T extends {
  status: string;
  due_date?: string | null;
  company_id?: string;
}>(
  invoices: T[],
  now = new Date(),
  companyId?: string | null,
): T[] {
  const scoped = (companyId ?? '').trim();
  return invoices.filter((inv) => {
    if (scoped && inv.company_id !== scoped) return false;
    return shouldStampInvoiceStatusOverdue(inv, now);
  });
}

export function overdueInvoiceCompanyFilter(companyId: string, now = new Date()) {
  const id = companyId.trim();
  if (!id) return null;
  return {
    table: 'invoices' as const,
    company_id: id,
    due_before: todayYmd(now),
    status: OVERDUE_INVOICE_STATUSES,
    chased_at: null,
    timeZone: 'Australia/Perth',
  };
}

export function overdueUnchasedInvoiceQuery(args: {
  companyId: string;
  now?: Date;
}): OverdueInvoiceQueryScope | null {
  const companyId = args.companyId.trim();
  if (!companyId) return null;
  return {
    table: 'invoices',
    columns: INVOICE_SEND_INVOICE_COLUMNS,
    eq: { company_id: companyId },
    inFilters: { status: [...OVERDUE_INVOICE_STATUSES] },
    lt: { due_date: todayYmd(args.now) },
    isNull: ['chased_at'],
  };
}

export function overdueSecondChaseCompanyFilter(companyId: string, now = new Date()) {
  const id = companyId.trim();
  if (!id) return null;
  return {
    table: 'invoices' as const,
    company_id: id,
    due_before: todayYmd(now),
    chased_at_before: secondChaseChasedAtBeforeIso(now),
    chased_on_or_before: secondChaseOnOrBeforeYmd(now),
    status: OVERDUE_INVOICE_STATUSES,
    timeZone: 'Australia/Perth' as const,
    second_chase_perth_days: SECOND_OVERDUE_CHASE_PERTH_DAYS,
  };
}

export function overdueSecondChaseInvoiceQuery(args: {
  companyId: string;
  now?: Date;
}): OverdueInvoiceQueryScope | null {
  const companyId = args.companyId.trim();
  if (!companyId) return null;
  return {
    table: 'invoices',
    columns: INVOICE_SEND_INVOICE_COLUMNS,
    eq: { company_id: companyId },
    inFilters: { status: [...OVERDUE_INVOICE_STATUSES] },
    lt: {
      due_date: todayYmd(args.now),
      chased_at: secondChaseChasedAtBeforeIso(args.now),
    },
    notNull: ['chased_at'],
  };
}

export function isOverdueInvoiceQueryScoped(scope: OverdueInvoiceQueryScope | null): boolean {
  if (!scope) return false;
  if (scope.columns.trim() === '' || scope.columns.trim() === '*') return false;
  if (scope.table === 'invoices') {
    return !!scope.eq.company_id && !!scope.lt?.due_date && (scope.isNull ?? []).includes('chased_at');
  }
  if (scope.table === 'email_settings') return !!scope.eq.company_id;
  if (scope.table === 'clients') return !!scope.eq.id;
  return false;
}

export function isOverdueSecondChaseQueryScoped(scope: OverdueInvoiceQueryScope | null): boolean {
  if (!scope) return false;
  if (scope.columns.trim() === '' || scope.columns.trim() === '*') return false;
  if (scope.table !== 'invoices') return false;
  return !!scope.eq.company_id
    && !!scope.lt?.due_date
    && !!scope.lt?.chased_at
    && (scope.notNull ?? []).includes('chased_at')
    && !(scope.isNull ?? []).includes('chased_at');
}

export function wouldScanLedgerToChaseOverdue(scope: OverdueInvoiceQueryScope | null): boolean {
  if (scope == null) return false;
  return !isOverdueInvoiceQueryScoped(scope);
}

export function wouldScanLedgerToSecondChaseOverdue(scope: OverdueInvoiceQueryScope | null): boolean {
  if (scope == null) return false;
  return !isOverdueSecondChaseQueryScoped(scope);
}

type OverdueFilterBuilder = {
  eq: (column: string, value: string) => OverdueFilterBuilder;
  in: (column: string, values: readonly string[]) => OverdueFilterBuilder;
  lt: (column: string, value: string) => OverdueFilterBuilder;
  is: (column: string, value: null) => OverdueFilterBuilder;
  not: (column: string, op: string, value: null) => OverdueFilterBuilder;
};

export function applyOverdueInvoiceScope<T>(
  fromBuilder: { select: (columns: string) => T },
  scope: OverdueInvoiceQueryScope,
): T & OverdueFilterBuilder {
  let q = fromBuilder.select(scope.columns) as T & OverdueFilterBuilder;
  for (const [column, value] of Object.entries(scope.eq)) {
    q = q.eq(column, value) as typeof q;
  }
  for (const [column, values] of Object.entries(scope.inFilters ?? {})) {
    q = q.in(column, values) as typeof q;
  }
  for (const [column, value] of Object.entries(scope.lt ?? {})) {
    q = q.lt(column, value) as typeof q;
  }
  for (const column of scope.isNull ?? []) {
    q = q.is(column, null) as typeof q;
  }
  for (const column of scope.notNull ?? []) {
    q = q.not(column, 'is', null) as typeof q;
  }
  return q;
}

export type OverdueInvoicePick = {
  selected: Array<{ invoice: OverdueChaseInvoice; client: InvoiceSendClient; to: string }>;
  missed: Array<{ invoice: OverdueChaseInvoice; reason: OverdueInvoiceMissReason; message: string }>;
};

/**
 * Cron auto-select. SMTP must be ready or nothing is mailed.
 * Defence in depth: even if a mixed ledger is passed, only this company's
 * overdue unchased invoices with a client email are selected.
 */
export function selectOverdueUnchasedInvoices(
  invoices: OverdueChaseInvoice[],
  clients: Map<string, InvoiceSendClient> | InvoiceSendClient[],
  settings: ReminderEmailSettings | SmtpSettingsRow | null | undefined,
  companyId: string,
  now = new Date(),
): OverdueInvoicePick {
  const clientMap = clients instanceof Map
    ? clients
    : new Map(clients.map(c => [c.id, c]));
  const selected: OverdueInvoicePick['selected'] = [];
  const missed: OverdueInvoicePick['missed'] = [];

  for (const invoice of invoices) {
    if (invoice.company_id !== companyId) continue;
    if (alreadyChasedInvoice(invoice)) {
      missed.push({ invoice, reason: 'already_chased', message: missOverdueChaseMessage('already_chased') });
      continue;
    }
    if (invoice.status === 'paid') {
      missed.push({ invoice, reason: 'paid', message: missOverdueChaseMessage('paid') });
      continue;
    }
    if (!invoiceOverdueForAutofire(invoice, now)) {
      const reason: OverdueInvoiceMissReason = dateOnly(invoice.due_date) ? 'not_overdue' : 'no_due_date';
      missed.push({ invoice, reason, message: missOverdueChaseMessage(reason) });
      continue;
    }
    if (!invoice.client_id) {
      missed.push({ invoice, reason: 'no_client', message: missOverdueChaseMessage('no_client') });
      continue;
    }
    if (!invoiceHasChargeableLines(invoice.line_items)) {
      missed.push({ invoice, reason: 'no_lines', message: missOverdueChaseMessage('no_lines') });
      continue;
    }
    if (!isSmtpReady(settings)) {
      missed.push({ invoice, reason: 'no_smtp', message: missOverdueChaseMessage('no_smtp') });
      continue;
    }
    const client = clientMap.get(invoice.client_id) ?? null;
    const to = clientEmailForSend(client?.email);
    if (!to) {
      missed.push({ invoice, reason: 'no_email', message: missOverdueChaseMessage('no_email') });
      continue;
    }
    selected.push({ invoice, client: client!, to });
  }

  return { selected, missed };
}

export function selectAutoFireOverdueInvoices(
  invoices: OverdueChaseInvoice[],
  clients: Map<string, InvoiceSendClient> | InvoiceSendClient[],
  settings: ReminderEmailSettings | SmtpSettingsRow | null | undefined,
  companyId: string,
  now = new Date(),
): OverdueInvoicePick {
  return selectOverdueUnchasedInvoices(invoices, clients, settings, companyId, now);
}

/**
 * Second chase on the same hop. Same SMTP / overdue / client-email gates as first chase.
 * Only rows whose last chase is 7 or more Perth days old.
 */
export function selectOverdueSecondChaseInvoices(
  invoices: OverdueChaseInvoice[],
  clients: Map<string, InvoiceSendClient> | InvoiceSendClient[],
  settings: ReminderEmailSettings | SmtpSettingsRow | null | undefined,
  companyId: string,
  now = new Date(),
): OverdueInvoicePick {
  const clientMap = clients instanceof Map
    ? clients
    : new Map(clients.map(c => [c.id, c]));
  const selected: OverdueInvoicePick['selected'] = [];
  const missed: OverdueInvoicePick['missed'] = [];

  for (const invoice of invoices) {
    if (invoice.company_id !== companyId) continue;
    if (!alreadyChasedInvoice(invoice)) continue;
    if (recentlyChasedInvoice(invoice, now)) {
      missed.push({ invoice, reason: 'already_chased', message: missOverdueChaseMessage('already_chased') });
      continue;
    }
    if (invoice.status === 'paid') {
      missed.push({ invoice, reason: 'paid', message: missOverdueChaseMessage('paid') });
      continue;
    }
    if (!invoiceOverdueForAutofire(invoice, now)) {
      const reason: OverdueInvoiceMissReason = dateOnly(invoice.due_date) ? 'not_overdue' : 'no_due_date';
      missed.push({ invoice, reason, message: missOverdueChaseMessage(reason) });
      continue;
    }
    if (!invoice.client_id) {
      missed.push({ invoice, reason: 'no_client', message: missOverdueChaseMessage('no_client') });
      continue;
    }
    if (!invoiceHasChargeableLines(invoice.line_items)) {
      missed.push({ invoice, reason: 'no_lines', message: missOverdueChaseMessage('no_lines') });
      continue;
    }
    if (!isSmtpReady(settings)) {
      missed.push({ invoice, reason: 'no_smtp', message: missOverdueChaseMessage('no_smtp') });
      continue;
    }
    const client = clientMap.get(invoice.client_id) ?? null;
    const to = clientEmailForSend(client?.email);
    if (!to) {
      missed.push({ invoice, reason: 'no_email', message: missOverdueChaseMessage('no_email') });
      continue;
    }
    selected.push({ invoice, client: client!, to });
  }

  return { selected, missed };
}

export function selectAutoFireSecondChaseInvoices(
  invoices: OverdueChaseInvoice[],
  clients: Map<string, InvoiceSendClient> | InvoiceSendClient[],
  settings: ReminderEmailSettings | SmtpSettingsRow | null | undefined,
  companyId: string,
  now = new Date(),
): OverdueInvoicePick {
  return selectOverdueSecondChaseInvoices(invoices, clients, settings, companyId, now);
}

export function resolveOverdueInvoiceCaller(args: {
  hasUser: boolean;
  userCompanyId?: string | null;
  cronAuthorized: boolean;
  invoiceId?: string;
  due?: string;
}): { ok: true; caller: OverdueInvoiceCaller } | { ok: false; error: string } {
  const invoiceId = (args.invoiceId ?? '').trim();
  const due = (args.due ?? '').trim();
  if (invoiceId) {
    if (!args.hasUser || !args.userCompanyId) return { ok: false, error: 'Unauthorized' };
    return { ok: true, caller: { kind: 'user', companyId: args.userCompanyId } };
  }
  if (due === 'overdue') {
    if (args.cronAuthorized) return { ok: true, caller: { kind: 'cron' } };
    if (args.hasUser && args.userCompanyId) {
      return { ok: true, caller: { kind: 'user', companyId: args.userCompanyId } };
    }
    return { ok: false, error: 'Unauthorized' };
  }
  return { ok: false, error: 'invoiceId or due=overdue is required' };
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

export type InvoiceReceiptMissReason =
  | 'not_found'
  | 'not_paid'
  | 'no_client'
  | 'no_email'
  | 'no_smtp'
  | 'no_lines'
  | 'no_pdf'
  | 'no_phone'
  | 'no_sms_credentials'
  | 'send_failed';

export function missInvoiceReceiptMessage(reason: InvoiceReceiptMissReason): string {
  switch (reason) {
    case 'no_email':
      return NO_RECEIPT_EMAIL_MESSAGE;
    case 'no_smtp':
      return NO_RECEIPT_SMTP_MESSAGE;
    case 'not_found':
      return NO_RECEIPT_INVOICE_MESSAGE;
    case 'no_client':
      return NO_RECEIPT_CLIENT_MESSAGE;
    case 'no_lines':
      return NO_RECEIPT_LINES_MESSAGE;
    case 'no_pdf':
      return NO_RECEIPT_PDF_MESSAGE;
    case 'not_paid':
      return RECEIPT_NOT_PAID_MESSAGE;
    case 'no_phone':
      return missSmsMessage('no_phone');
    case 'no_sms_credentials':
      return missSmsMessage('no_sms_credentials');
    case 'send_failed':
      return 'Receipt was not sent.';
    default:
      return 'Receipt was not sent.';
  }
}

/**
 * After Mark paid succeeds locally. Paid-only. Callers must not unmark paid.
 */
export function decideInvoiceReceiptOnMarkPaid(input: {
  paidSucceeded: boolean;
  invoiceId?: string | null;
  status?: string | null;
}): { ok: true; invoiceId: string } | { ok: false; reason: InvoiceReceiptMissReason } {
  if (!input.paidSucceeded) return { ok: false, reason: 'not_paid' };
  if (input.status != null && input.status !== 'paid') return { ok: false, reason: 'not_paid' };
  const invoiceId = (input.invoiceId ?? '').trim();
  if (!invoiceId) return { ok: false, reason: 'not_found' };
  return { ok: true, invoiceId };
}

export function invoiceReceiptOnMarkPaidBody(invoiceId: string): {
  invoiceId: string;
  purpose: 'receipt';
} {
  return { invoiceId: invoiceId.trim(), purpose: 'receipt' };
}

/**
 * Receipt send for a paid invoice. Same To / SMTP / PDF gates as Send.
 * Does not reuse chase subject. Paid invoices are the only ready case.
 */
export function decideInvoiceReceipt(bundle: InvoiceSendBundle): InvoiceSendDecision {
  const invoice = bundle.invoice;
  if (!invoice) {
    return { ok: false, blocker: 'not_found', message: missInvoiceReceiptMessage('not_found') };
  }
  if (invoice.status !== 'paid') {
    return { ok: false, blocker: 'not_paid', message: missInvoiceReceiptMessage('not_paid') };
  }
  if (!invoice.client_id) {
    return { ok: false, blocker: 'no_client', message: missInvoiceReceiptMessage('no_client') };
  }
  if (!invoiceHasChargeableLines(invoice.line_items)) {
    return { ok: false, blocker: 'no_lines', message: missInvoiceReceiptMessage('no_lines') };
  }
  if (!isSmtpReady(bundle.smtp)) {
    return {
      ok: false,
      blocker: 'no_smtp',
      message: missInvoiceReceiptMessage('no_smtp'),
      href: COMPANY_EMAIL_SETTINGS_HREF,
    };
  }
  const to = clientEmailForSend(bundle.client?.email);
  if (!to) {
    return {
      ok: false,
      blocker: 'no_email',
      message: missInvoiceReceiptMessage('no_email'),
      href: invoice.client_id ? `/clients/${invoice.client_id}` : undefined,
    };
  }
  const smsTo = clientPhoneForSms(bundle.client?.phone);
  return {
    ok: true,
    to,
    toName: (bundle.client?.name ?? '').trim() || 'Client',
    subject: invoiceReceiptSubject(invoice.invoice_number, bundle.company.name),
    filename: invoicePdfFilename(invoice.invoice_number),
    smsTo,
    smsMessage: smsTo ? null : missSmsMessage('no_phone'),
  };
}

export function invoiceSendCompanyFrom(company: {
  id?: string | null;
  name?: string | null;
  abn?: string | null;
  licence_number?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logo_url?: string | null;
} | null | undefined): (InvoiceSendCompany & { id: string }) | null {
  const id = (company?.id ?? '').trim();
  if (!id) return null;
  return {
    id,
    name: (company?.name ?? '').trim() || 'your contractor',
    abn: company?.abn ?? null,
    licence_number: company?.licence_number ?? null,
    phone: company?.phone ?? null,
    email: company?.email ?? null,
    website: company?.website ?? null,
    logo_url: company?.logo_url ?? null,
  };
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
