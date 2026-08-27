import { format, parseISO } from 'date-fns';
import { quoteClientDetailFromClient } from './clientRecords';
import { asStringList } from './asStringList';
import { padQuoteNumber } from './quoteJobFields';
import { quoteHasChargeableLines } from './quoteNextAction';
import { linesFromQuoteItems, type CommercialPdfData } from '../reports/commercial/CommercialDocumentPdf';
import { companyDocumentLogoUrl, companyReportTheme } from './companyLogo';
import type { QuoteLineItem } from '../types/fsm';
import {
  COMPANY_EMAIL_SETTINGS_HREF,
  blobToBase64,
  clientEmailForSend,
  clientPhoneForSms,
  isSmtpReady,
  type SmtpSettingsRow,
} from './sendInvoice';
import { missSmsMessage } from './jobReminder';

export {
  COMPANY_EMAIL_SETTINGS_HREF,
  blobToBase64,
  clientEmailForSend,
  clientPhoneForSms,
  isSmtpReady,
};

export type QuoteSendBlocker = 'not_found' | 'no_client' | 'no_email' | 'no_smtp' | 'no_lines' | 'no_pdf';

export type QuoteSendQueryTable = 'quotes' | 'clients' | 'email_settings' | 'jobs';

export type QuoteSendQueryScope = {
  table: QuoteSendQueryTable;
  columns: string;
  eq: Record<string, string>;
};

export type QuoteSendDecision =
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
      blocker: QuoteSendBlocker;
      message: string;
      href?: string;
    };

export type QuoteSendCompany = {
  name: string;
  abn?: string | null;
  licence_number?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logo_url?: string | null;
  report_theme?: Record<string, unknown> | null;
};

export type QuoteSendQuote = {
  id: string;
  company_id: string;
  quote_number: number | null;
  client_id: string | null;
  job_id: string | null;
  status: string;
  description: string | null;
  scope_of_works: string | null;
  line_items: QuoteLineItem[] | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  validity_date: string | null;
  notes: string | null;
  inclusions: unknown;
  exclusions: unknown;
};

export type QuoteSendClient = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
};

export type QuotePdfAttachment = {
  filename: string;
  content: string;
  contentType?: string;
};

export type QuoteSendBundle = {
  quote: QuoteSendQuote | null;
  client: QuoteSendClient | null;
  jobAddress: string | null;
  smtp: SmtpSettingsRow | null;
  company: QuoteSendCompany;
  existingPdf?: QuotePdfAttachment | null;
};

export const QUOTE_SEND_QUOTE_COLUMNS =
  'id, company_id, quote_number, client_id, job_id, status, description, scope_of_works, line_items, subtotal, tax_rate, tax_amount, total, validity_date, notes, inclusions, exclusions';

export const QUOTE_SEND_CLIENT_COLUMNS = 'id, name, email, phone, address';
export const QUOTE_SEND_SMTP_COLUMNS = 'smtp_host, smtp_pass, from_name, from_email';
export const QUOTE_SEND_JOB_COLUMNS = 'id, address';

export const NO_EMAIL_MESSAGE = 'This client has no email. Add one on the client record before you send.';
export const NO_SMTP_MESSAGE = 'Email is not set up. Add SMTP in Company settings — there is a test send there.';
export const NO_LINES_MESSAGE = 'Add the work and materials so the quote has a price.';
export const NO_CLIENT_MESSAGE = 'Pick a client before you can send this quote.';
export const NO_PDF_MESSAGE = 'The quote PDF could not be attached — quote was not sent.';

/**
 * Same pipe as invoice / report Send on main.
 * One quote by id + company → email_settings + Resend → sent only on 2xx.
 */
export const QUOTE_SEND_PIPE = [
  'supabase.functions.invoke job-reminder',
  'quoteId (one quote, company_id scoped — not the ledger)',
  'email_settings where Resend is ready (companies without SMTP are not mailed)',
  'To = client.email (never invented)',
  'attach generated commercial quote PDF (generateCommercialPdf)',
  'POST https://api.resend.com/emails with email_settings.smtp_pass',
  'SMS beside: clients.phone via Twilio edge secrets on job-reminder (email status unchanged if SMS misses)',
  'UPDATE quotes.status = sent only when Resend returns 2xx (draft only)',
] as const;

export function quoteSendSubject(quoteNumber: number | null | undefined, companyName: string): string {
  const who = companyName.trim() || 'your contractor';
  return `Quote #${padQuoteNumber(quoteNumber)} from ${who}`;
}

export function quotePdfFilename(quoteNumber: number | null | undefined): string {
  return `quote-${padQuoteNumber(quoteNumber)}.pdf`;
}

/** Existing public token portal — `/p?t=` on ClientPortalPublicPage. */
export const CLIENT_PORTAL_PATH = '/p';
export const CLIENT_PORTAL_ACCEPT_ACTION = 'accept_quote';

export function clientPortalPublicUrl(
  origin: string | null | undefined,
  token: string | null | undefined,
): string | null {
  const base = (origin ?? '').trim().replace(/\/$/, '');
  const t = (token ?? '').trim();
  if (!base || !t) return null;
  return `${base}${CLIENT_PORTAL_PATH}?t=${t}`;
}

export function pickActiveClientPortalToken(
  rows: Array<{ token?: string | null; revoked?: boolean | null; expires_at?: string | null }>,
  now = new Date(),
): string | null {
  for (const row of rows) {
    const token = (row.token ?? '').trim();
    if (!token || row.revoked) continue;
    if (row.expires_at && new Date(row.expires_at).getTime() < now.getTime()) continue;
    return token;
  }
  return null;
}

export function clientPortalAcceptBody(
  token: string | null | undefined,
  quoteId: string | null | undefined,
): { token: string; action: typeof CLIENT_PORTAL_ACCEPT_ACTION; quoteId: string } | null {
  const t = (token ?? '').trim();
  const id = (quoteId ?? '').trim();
  if (!t || !id) return null;
  return { token: t, action: CLIENT_PORTAL_ACCEPT_ACTION, quoteId: id };
}

/** Same outcome as office Mark accepted — sent → accepted. Already accepted is a no-op. */
export function quoteStatusAfterClientAccept(currentStatus: string): 'accepted' | null {
  if (currentStatus === 'sent' || currentStatus === 'accepted') return 'accepted';
  return null;
}

export function canClientAcceptQuote(status: string): boolean {
  return status === 'sent';
}

export function quoteSmsBody(opts: {
  companyName: string;
  quoteNumber: number | null | undefined;
  totalLabel: string;
  validityLabel: string | null;
  portalUrl?: string | null;
}): string {
  const who = opts.companyName.trim() || 'your contractor';
  const valid = opts.validityLabel ? ` Valid until ${opts.validityLabel}.` : '';
  const portal = (opts.portalUrl ?? '').trim();
  const accept = portal ? ` Accept here: ${portal}` : '';
  return `${who} sent quote #${padQuoteNumber(opts.quoteNumber)}. Total (inc GST): ${opts.totalLabel}.${valid} The PDF is in your email.${accept}`;
}

export function quoteValidityLabel(validityDate: string | null | undefined): string | null {
  const day = (validityDate ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return format(parseISO(day), 'd MMM yyyy');
}

/** Quiet ink + one portal link. Not a banner or button pile. */
export function quoteSendAcceptLineHtml(portalUrl: string): string {
  const portal = escapeHtml(portalUrl.trim());
  return `<p style="font-family:Inter,system-ui,sans-serif;color:#0A2540;font-size:15px;line-height:1.6;margin:16px 0 0;">The quote PDF is attached. Accept this quote: <a href="${portal}" style="color:#2E75B6">${portal}</a>. Or reply to this email if you want to go ahead or change the scope.</p>`;
}

export function quoteSendHtml(opts: {
  clientName: string;
  companyName: string;
  quoteNumber: number | null | undefined;
  totalLabel: string;
  validityLabel: string | null;
  portalUrl?: string | null;
}): string {
  const client = escapeHtml(opts.clientName.trim() || 'there');
  const company = escapeHtml(opts.companyName.trim() || 'us');
  const number = escapeHtml(`#${padQuoteNumber(opts.quoteNumber)}`);
  const total = escapeHtml(opts.totalLabel);
  const valid = opts.validityLabel
    ? `<p style="color:#5B6B7C;font-size:15px;line-height:1.6;margin:8px 0 0;">Valid until <strong style="color:#0A2540">${escapeHtml(opts.validityLabel)}</strong>.</p>`
    : '';
  const portal = (opts.portalUrl ?? '').trim();
  const goAhead = portal
    ? quoteSendAcceptLineHtml(portal)
    : `<p style="color:#0A2540;font-size:15px;line-height:1.6;margin:16px 0 0;">The quote PDF is attached. Reply to this email if you want to go ahead or change the scope.</p>`;
  return `
      <div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;background:#F4F6F8;padding:16px;color:#0A2540">
        <div style="background:#FFFFFF;border:1px solid #D5DCE3;border-radius:16px;padding:24px">
          <div style="font-size:12px;color:#5B6B7C;letter-spacing:0.08em;text-transform:uppercase">Quote</div>
          <h1 style="margin:8px 0 16px;font-size:20px;font-weight:600;color:#0A2540">${number}</h1>
          <p style="color:#0A2540;font-size:15px;line-height:1.6;margin:0 0 8px;">Hi ${client},</p>
          <p style="color:#0A2540;font-size:15px;line-height:1.6;margin:0 0 8px;">${company} has sent you quote ${number}.</p>
          <p style="color:#5B6B7C;font-size:15px;line-height:1.6;margin:0;">Total (inc GST): <strong style="color:#0A2540">${total}</strong></p>
          ${valid}
          ${goAhead}
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
export function quoteStatusAfterSend(sendSucceeded: boolean, currentStatus: string): string {
  if (sendSucceeded && currentStatus === 'draft') return 'sent';
  return currentStatus;
}

export function quoteStatusPatchAfterSend(sendSucceeded: boolean): { status: 'sent' } | null {
  return sendSucceeded ? { status: 'sent' } : null;
}

export function shouldRecordQuoteSent(sendOk: boolean, currentStatus: string): boolean {
  return sendOk === true && currentStatus === 'draft';
}

export function quoteByIdQuery(args: { companyId: string; quoteId: string }): QuoteSendQueryScope | null {
  const companyId = args.companyId.trim();
  const quoteId = args.quoteId.trim();
  if (!companyId || !quoteId) return null;
  return {
    table: 'quotes',
    columns: QUOTE_SEND_QUOTE_COLUMNS,
    eq: { id: quoteId, company_id: companyId },
  };
}

export function quoteSendQueries(args: { companyId: string; quoteId: string }): {
  quote: QuoteSendQueryScope;
  smtp: QuoteSendQueryScope;
} {
  return {
    quote: {
      table: 'quotes',
      columns: QUOTE_SEND_QUOTE_COLUMNS,
      eq: { id: args.quoteId, company_id: args.companyId },
    },
    smtp: {
      table: 'email_settings',
      columns: QUOTE_SEND_SMTP_COLUMNS,
      eq: { company_id: args.companyId },
    },
  };
}

export function quoteSendClientQuery(clientId: string | null | undefined): QuoteSendQueryScope | null {
  const id = (clientId ?? '').trim();
  if (!id) return null;
  return { table: 'clients', columns: QUOTE_SEND_CLIENT_COLUMNS, eq: { id } };
}

export function quoteSendJobQuery(jobId: string | null | undefined): QuoteSendQueryScope | null {
  const id = (jobId ?? '').trim();
  if (!id) return null;
  return { table: 'jobs', columns: QUOTE_SEND_JOB_COLUMNS, eq: { id } };
}

export function isQuoteSendScoped(scope: QuoteSendQueryScope): boolean {
  if (scope.table === 'quotes') return !!scope.eq.id && !!scope.eq.company_id;
  if (scope.table === 'clients' || scope.table === 'jobs') return !!scope.eq.id;
  if (scope.table === 'email_settings') return !!scope.eq.company_id;
  return false;
}

/** True when a fetch would read more than this one quote / its client / company SMTP. */
export function wouldScanLedgerToSendQuote(scope: QuoteSendQueryScope | null): boolean {
  if (scope == null) return false;
  return !isQuoteSendScoped(scope);
}

type FilterBuilder = {
  eq: (column: string, value: string) => FilterBuilder;
  maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
};

export function applyQuoteSendScope<T>(
  fromBuilder: { select: (columns: string) => T },
  scope: QuoteSendQueryScope,
): T & FilterBuilder {
  let q = fromBuilder.select(scope.columns) as T & FilterBuilder;
  for (const [column, value] of Object.entries(scope.eq)) {
    q = q.eq(column, value) as typeof q;
  }
  return q;
}

export function quoteSendCompanyFrom(company: {
  id?: string | null;
  name?: string | null;
  abn?: string | null;
  licence_number?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logo_url?: string | null;
  report_theme?: Record<string, unknown> | null;
} | null | undefined): (QuoteSendCompany & { id: string }) | null {
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
    logo_url: companyDocumentLogoUrl(company),
    report_theme: companyReportTheme(company),
  };
}

export function decideQuoteSend(bundle: QuoteSendBundle): QuoteSendDecision {
  const quote = bundle.quote;
  if (!quote) {
    return { ok: false, blocker: 'not_found', message: 'Quote not found.' };
  }
  if (!quote.client_id) {
    return { ok: false, blocker: 'no_client', message: NO_CLIENT_MESSAGE };
  }
  if (!quoteHasChargeableLines(quote.line_items)) {
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
      href: quote.client_id ? `/clients/${quote.client_id}` : undefined,
    };
  }
  const smsTo = clientPhoneForSms(bundle.client?.phone);
  return {
    ok: true,
    to,
    toName: (bundle.client?.name ?? '').trim() || 'Client',
    subject: quoteSendSubject(quote.quote_number, bundle.company.name),
    filename: quotePdfFilename(quote.quote_number),
    smsTo,
    smsMessage: smsTo ? null : missSmsMessage('no_phone'),
  };
}

export function pickQuotePdfAttachment(args: {
  existing?: QuotePdfAttachment | null;
  generated?: QuotePdfAttachment | null;
}): QuotePdfAttachment | null {
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

export function quoteAttachmentOrMiss(
  attachment: QuotePdfAttachment | null | undefined,
): { ok: true; attachment: QuotePdfAttachment } | { ok: false; reason: 'no_pdf'; message: string } {
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

export function commercialPdfDataForQuote(bundle: QuoteSendBundle, now = new Date()): CommercialPdfData | null {
  const quote = bundle.quote;
  if (!quote) return null;
  const lines = (quote.line_items ?? []).filter(
    li => (li.description ?? '').trim() && Number(li.quantity) > 0,
  );
  return {
    kind: 'quote',
    title: 'Quoted prices',
    docNumber: quote.quote_number != null ? `#${padQuoteNumber(quote.quote_number)}` : 'Draft',
    dateLabel: 'Date',
    dateValue: format(now, 'd MMM yyyy'),
    secondaryLabel: 'Valid until',
    secondaryValue: quote.validity_date ? format(parseISO(quote.validity_date), 'd MMM yyyy') : '—',
    clientName: bundle.client?.name ?? '—',
    clientDetail: quoteClientDetailFromClient(bundle.client, bundle.jobAddress),
    company: {
      name: bundle.company.name,
      abn: bundle.company.abn ?? null,
      licence_number: bundle.company.licence_number ?? null,
      phone: bundle.company.phone ?? null,
      email: bundle.company.email ?? null,
      website: bundle.company.website ?? null,
      logo_url: companyDocumentLogoUrl(bundle.company),
      report_theme: companyReportTheme(bundle.company),
    },
    inclusions: asStringList(quote.inclusions),
    exclusions: asStringList(quote.exclusions),
    description: quote.description?.trim() || null,
    scopeOfWorks: quote.scope_of_works?.trim() || null,
    lines: linesFromQuoteItems(lines),
    subtotal: Number(quote.subtotal) || 0,
    taxRate: Number(quote.tax_rate) || 0,
    taxAmount: Number(quote.tax_amount) || 0,
    total: Number(quote.total) || 0,
    notes: quote.notes?.trim() || null,
  };
}
