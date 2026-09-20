import { GRAFTER_PUBLIC_ORIGIN } from './publicSeo';
import { prefillSmsTo } from './jobReminder';
import { clientEmailForSend, invoicePdfFilename, invoiceSendSubject } from './sendInvoice';
import { quotePdfFilename, quoteSendSubject } from './sendQuote';

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
