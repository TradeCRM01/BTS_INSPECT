import { GRAFTER_PUBLIC_ORIGIN } from './publicSeo';
import { clientEmailForSend, invoicePdfFilename, invoiceSendSubject } from './sendInvoice';
import { quotePdfFilename, quoteSendSubject } from './sendQuote';

export type DocumentShareKind = 'quote' | 'invoice';

export type DocumentShareExport = {
  kind: DocumentShareKind;
  subject: string;
  filename: string;
  to: string | null;
  portalUrl: string | null;
  mailtoHref: string | null;
  status: string;
  needsMarkSent: boolean;
  canDownloadPdf: boolean;
  canCopyLink: boolean;
  canMailto: boolean;
  canMarkSent: boolean;
};

/** Localhost is not a client-usable Accept URL. Prefer the public origin there. */
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
}): string {
  const who = args.companyName.trim() || 'your contractor';
  const number = invoicePdfFilename(args.invoiceNumber).replace(/\.pdf$/, '');
  return `${who} sent you ${number}. View it here:\n${args.portalUrl}`;
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
    subject,
    filename,
    to,
    portalUrl,
    mailtoHref,
    status: args.status,
    needsMarkSent,
    canDownloadPdf: args.hasLines,
    canCopyLink: args.hasClient,
    canMailto: !!mailtoHref,
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
  portalUrl?: string | null;
}): DocumentShareExport {
  const subject = invoiceSendSubject(args.invoiceNumber, args.companyName);
  const filename = invoicePdfFilename(args.invoiceNumber);
  const to = clientEmailForSend(args.clientEmail);
  const portalUrl = (args.portalUrl ?? '').trim() || null;
  const needsMarkSent = invoiceNeedsMarkSent(args.status);
  const mailtoHref = portalUrl
    ? documentShareMailtoHref({
        to,
        subject,
        body: invoiceShareMailtoBody({
          companyName: args.companyName,
          invoiceNumber: args.invoiceNumber,
          portalUrl,
        }),
      })
    : null;
  return {
    kind: 'invoice',
    subject,
    filename,
    to,
    portalUrl,
    mailtoHref,
    status: args.status,
    needsMarkSent,
    canDownloadPdf: args.hasLines,
    canCopyLink: args.hasClient,
    canMailto: !!mailtoHref,
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
    mailtoHref,
    canMailto: !!mailtoHref,
  };
}

export function invoiceShareAfterPortalUrl(
  share: DocumentShareExport,
  portalUrl: string | null,
  companyName: string,
  invoiceNumber: number | null | undefined,
): DocumentShareExport {
  const url = (portalUrl ?? '').trim() || null;
  const mailtoHref = url
    ? documentShareMailtoHref({
        to: share.to,
        subject: share.subject,
        body: invoiceShareMailtoBody({ companyName, invoiceNumber, portalUrl: url }),
      })
    : null;
  return {
    ...share,
    portalUrl: url,
    mailtoHref,
    canMailto: !!mailtoHref,
  };
}
