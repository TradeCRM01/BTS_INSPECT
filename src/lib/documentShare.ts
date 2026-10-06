import { GRAFTER_PUBLIC_ORIGIN } from './publicSeo';
import { prefillSmsTo } from './jobReminder';
import { padQuoteNumber } from './quoteJobFields';
import { clientEmailForSend, invoicePdfFilename, invoiceSendSubject } from './sendInvoice';
import { quotePdfFilename, quoteSendSubject } from './sendQuote';
import { formatMoney } from '../types/fsm';

export type DocumentShareKind = 'quote' | 'invoice';
export type InvoiceSharePurpose = 'send' | 'chase';

export type DocumentShareExport = {
  kind: DocumentShareKind;
  purpose: InvoiceSharePurpose;
  subject: string;
  filename: string;
  to: string | null;
  portalUrl: string | null;
  copyText: string | null;
  mailtoHref: string | null;
  smsHref: string | null;
  status: string;
  needsMarkSent: boolean;
  canDownloadPdf: boolean;
  canCopyLink: boolean;
  canMailto: boolean;
  canMarkSent: boolean;
};

export function documentShareOrigin(windowOrigin: string | null | undefined): string {
  const raw = (windowOrigin ?? '').trim().replace(/\/$/, '');
  if (!raw || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(raw)) {
    return GRAFTER_PUBLIC_ORIGIN;
  }
  return raw;
}

export function documentShareMailtoHref(args: {
  to: string | null | undefined;
  subject: string;
  body: string;
}): string | null {
  const to = clientEmailForSend(args.to);
  const subject = args.subject.trim();
  const body = args.body.trim();
  if (!to || !subject || !body) return null;
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function quoteShareMailtoBody(args: {
  companyName: string;
  quoteNumber: number | null | undefined;
  portalUrl: string;
}): string {
  const who = args.companyName.trim() || 'your contractor';
  const number = quotePdfFilename(args.quoteNumber).replace(/\.pdf$/, '');
  return `${who} sent you ${number}. Review and accept here:\n${args.portalUrl}`;
}

/** Contact first name when the clients row has a person; otherwise the full client name. Never split a company name. */
export function quoteChaseClientName(args: {
  contactPerson?: string | null;
  clientName?: string | null;
}): string {
  const contact = (args.contactPerson ?? '').trim();
  if (contact) return contact.split(/\s+/)[0] || contact;
  return (args.clientName ?? '').trim();
}

export function quoteChaseCopyText(args: {
  clientName: string | null | undefined;
  contactPerson?: string | null;
  companyName?: string | null;
  quoteNumber: number | null | undefined;
  total: number | null | undefined;
  portalUrl: string;
}): string {
  const who = quoteChaseClientName({
    contactPerson: args.contactPerson,
    clientName: args.clientName,
  });
  const company = (args.companyName ?? '').trim() || 'your contractor';
  const number = padQuoteNumber(args.quoteNumber);
  const total = formatMoney(Number(args.total ?? 0));
  return `Hi ${who}, just following up on quote #${number} for ${total}. You can view and accept it here: ${args.portalUrl}. Happy to answer any questions. Thanks, ${company}`;
}

export function invoiceShareMailtoBody(args: {
  companyName: string;
  invoiceNumber: number | null | undefined;
  portalUrl: string;
  purpose?: InvoiceSharePurpose;
  dueDate?: string | null;
  total?: number | null;
}): string {
  const who = args.companyName.trim() || 'your contractor';
  const number = invoicePdfFilename(args.invoiceNumber).replace(/\.pdf$/, '');
  if (args.purpose === 'chase') {
    const invoice = invoiceDisplayName(args.invoiceNumber);
    return [
      `Payment reminder from ${who}.`,
      `${invoice} is overdue.`,
      Number.isFinite(args.total) ? `Amount due: $${Number(args.total).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} incl. GST.` : '',
      invoiceDueDateLabel(args.dueDate),
      `View invoice: ${args.portalUrl}`,
    ].filter(Boolean).join('\n');
  }
  return `${who} sent you ${number}. View it here:\n${args.portalUrl}`;
}

function invoiceDueDateLabel(dueDate: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec((dueDate ?? '').trim());
  if (!match) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `Due: ${Number(match[3])} ${months[Number(match[2]) - 1]} ${match[1]}.`;
}

export function invoiceChaseSummary(args: {
  dueDate?: string | null;
  total?: number | null;
}): string {
  const amount = Number.isFinite(args.total)
    ? `$${Number(args.total).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} incl. GST`
    : '';
  return ['Overdue', amount, invoiceDueDateLabel(args.dueDate).replace(/^Due: /, 'Due ').replace(/\.$/, '')]
    .filter(Boolean)
    .join(' · ');
}

export function documentShareSmsHref(args: {
  phone: string | null | undefined;
  body: string;
}): string | null {
  const phone = prefillSmsTo(args.phone);
  const body = args.body.trim();
  if (!phone || !body) return null;
  return `sms:${phone}?body=${encodeURIComponent(body)}`;
}

function invoiceShareSubject(args: {
  purpose: InvoiceSharePurpose;
  invoiceNumber: number | null | undefined;
  companyName: string;
}): string {
  if (args.purpose === 'send') return invoiceSendSubject(args.invoiceNumber, args.companyName);
  const who = args.companyName.trim() || 'your contractor';
  return `Payment reminder · ${invoiceDisplayName(args.invoiceNumber)} from ${who}`;
}

function invoiceDisplayName(invoiceNumber: number | null | undefined): string {
  return `Invoice #${String(invoiceNumber ?? 0).padStart(4, '0')}`;
}

export const DOCUMENT_SHARE_COPY_TOAST = 'Link copied';
export const QUOTE_SHARE_MARKED_SENT_TOAST = 'Link copied, quote marked as sent';
export const INVOICE_SHARE_MARKED_SENT_TOAST = 'Link copied, invoice marked as sent';

export const QUOTE_MARKED_SENT_TOAST = 'Quote marked as sent';
export const MARK_SENT_WRITE_FAILED = 'Could not mark this as sent.';
export const MARK_SENT_COPY_BLOCKED_TOAST = "Couldn't mark as sent, so the link wasn't copied. Try again.";
export const QUOTE_MANUAL_COPY_TOAST = 'Quote marked as sent. Copy the link below.';
export const INVOICE_MANUAL_COPY_TOAST = 'Invoice marked as sent. Copy the link below.';
export const DOCUMENT_SHARE_MANUAL_LABEL = 'Copy this link:';
export const MARK_SENT_WRITE_FAILED_KIND = 'mark_sent_write_failed';

export type MarkSentWriteFailed = { kind: typeof MARK_SENT_WRITE_FAILED_KIND };

/** Own marker — supabase-js errors are not Error instances, so never match on message. */
export function markSentWriteFailed(): never {
  throw { kind: MARK_SENT_WRITE_FAILED_KIND } satisfies MarkSentWriteFailed;
}

export function isMarkSentWriteFailed(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && (error as { kind?: unknown }).kind === MARK_SENT_WRITE_FAILED_KIND,
  );
}

export function documentShareCopyErrorToast(error: unknown): string {
  return isMarkSentWriteFailed(error)
    ? MARK_SENT_COPY_BLOCKED_TOAST
    : 'Could not copy the link.';
}

export function documentShareCopyToast(kind: DocumentShareKind, markedSent: boolean): string {
  if (!markedSent) return DOCUMENT_SHARE_COPY_TOAST;
  return kind === 'quote' ? QUOTE_SHARE_MARKED_SENT_TOAST : INVOICE_SHARE_MARKED_SENT_TOAST;
}

export function documentShareManualCopyToast(kind: DocumentShareKind, markedSent: boolean): string | null {
  if (!markedSent) return null;
  return kind === 'quote' ? QUOTE_MANUAL_COPY_TOAST : INVOICE_MANUAL_COPY_TOAST;
}

/** Update with 0 rows is not success. Still-draft after a no-op is a hard failure. */
export function interpretMarkSentWrite(args: {
  updatedId: string | null | undefined;
  liveStatus: string | null | undefined;
  next: string;
}): { status: string; markedSent: boolean } {
  if (args.updatedId) return { status: args.next, markedSent: true };
  if ((args.liveStatus ?? '') === 'draft') {
    markSentWriteFailed();
  }
  return { status: args.liveStatus || args.next, markedSent: false };
}

export function quoteNeedsMarkSentForAccept(status: string): boolean {
  return status === 'draft';
}

export function quoteStatusAfterMarkSent(status: string): 'sent' | null {
  return status === 'draft' ? 'sent' : null;
}

export function invoiceNeedsMarkSent(status: string): boolean {
  return status === 'draft';
}

export function invoiceStatusAfterMarkSent(status: string): 'sent' | null {
  return status === 'draft' ? 'sent' : null;
}

export function decideQuoteShare(args: {
  status: string;
  hasClient: boolean;
  hasLines: boolean;
  quoteNumber: number | null | undefined;
  companyName: string;
  clientEmail?: string | null;
  portalUrl?: string | null;
}): DocumentShareExport {
  const subject = quoteSendSubject(args.quoteNumber, args.companyName);
  const filename = quotePdfFilename(args.quoteNumber);
  const to = clientEmailForSend(args.clientEmail);
  const portalUrl = (args.portalUrl ?? '').trim() || null;
  const needsMarkSent = quoteNeedsMarkSentForAccept(args.status);
  const mailtoHref = portalUrl
    ? documentShareMailtoHref({
        to,
        subject,
        body: quoteShareMailtoBody({
          companyName: args.companyName,
          quoteNumber: args.quoteNumber,
          portalUrl,
        }),
      })
    : null;
  return {
    kind: 'quote',
    purpose: 'send',
    subject,
    filename,
    to,
    portalUrl,
    copyText: portalUrl,
    mailtoHref,
    smsHref: null,
    status: args.status,
    needsMarkSent,
    canDownloadPdf: args.hasLines,
    canCopyLink: args.hasClient,
    canMailto: !!to,
    canMarkSent: needsMarkSent && args.hasClient && args.hasLines,
  };
}

export function decideInvoiceShare(args: {
  status: string;
  hasClient: boolean;
  hasLines: boolean;
  invoiceNumber: number | null | undefined;
  companyName: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  portalUrl?: string | null;
  purpose?: InvoiceSharePurpose;
  dueDate?: string | null;
  total?: number | null;
}): DocumentShareExport {
  const purpose = args.purpose ?? 'send';
  const subject = invoiceShareSubject({
    purpose,
    invoiceNumber: args.invoiceNumber,
    companyName: args.companyName,
  });
  const filename = invoicePdfFilename(args.invoiceNumber);
  const to = clientEmailForSend(args.clientEmail);
  const portalUrl = (args.portalUrl ?? '').trim() || null;
  const needsMarkSent = invoiceNeedsMarkSent(args.status);
  const body = portalUrl
    ? invoiceShareMailtoBody({
        companyName: args.companyName,
        invoiceNumber: args.invoiceNumber,
        portalUrl,
        purpose,
        dueDate: args.dueDate,
        total: args.total,
      })
    : null;
  const mailtoHref = body
    ? documentShareMailtoHref({
        to,
        subject,
        body,
      })
    : null;
  return {
    kind: 'invoice',
    purpose,
    subject,
    filename,
    to,
    portalUrl,
    copyText: purpose === 'chase' ? body : portalUrl,
    mailtoHref,
    smsHref: body ? documentShareSmsHref({ phone: args.clientPhone, body }) : null,
    status: args.status,
    needsMarkSent,
    canDownloadPdf: args.hasLines,
    canCopyLink: args.hasClient,
    canMailto: !!to,
    canMarkSent: needsMarkSent && args.hasClient && args.hasLines,
  };
}

export function quoteShareAfterPortalUrl(
  share: DocumentShareExport,
  portalUrl: string | null,
  companyName: string,
  quoteNumber: number | null | undefined,
): DocumentShareExport {
  const url = (portalUrl ?? '').trim() || null;
  const mailtoHref = url
    ? documentShareMailtoHref({
        to: share.to,
        subject: share.subject,
        body: quoteShareMailtoBody({ companyName, quoteNumber, portalUrl: url }),
      })
    : null;
  return {
    ...share,
    portalUrl: url,
    copyText: url,
    mailtoHref,
    canMailto: !!mailtoHref,
  };
}

export function invoiceShareAfterPortalUrl(
  share: DocumentShareExport,
  portalUrl: string | null,
  companyName: string,
  invoiceNumber: number | null | undefined,
  context?: {
    purpose?: InvoiceSharePurpose;
    dueDate?: string | null;
    total?: number | null;
    clientPhone?: string | null;
  },
): DocumentShareExport {
  const url = (portalUrl ?? '').trim() || null;
  const purpose = context?.purpose ?? share.purpose;
  const body = url
    ? invoiceShareMailtoBody({
        companyName,
        invoiceNumber,
        portalUrl: url,
        purpose,
        dueDate: context?.dueDate,
        total: context?.total,
      })
    : null;
  const mailtoHref = body
    ? documentShareMailtoHref({
        to: share.to,
        subject: share.subject,
        body,
      })
    : null;
  return {
    ...share,
    purpose,
    portalUrl: url,
    copyText: purpose === 'chase' ? body : url,
    mailtoHref,
    smsHref: body ? documentShareSmsHref({ phone: context?.clientPhone, body }) : null,
    canMailto: !!mailtoHref,
  };
}
