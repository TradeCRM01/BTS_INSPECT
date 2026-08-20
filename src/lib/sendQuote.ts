import { format, parseISO } from 'date-fns';
import { supabase } from './supabase';
import { mailtoHref, quoteClientDetailFromClient } from './clientRecords';
import { asStringList } from './asStringList';
import { padQuoteNumber } from './quoteJobFields';
import { quoteHasChargeableLines } from './quoteNextAction';
import { linesFromQuoteItems, type CommercialPdfData } from '../reports/commercial/CommercialDocumentPdf';
import { formatMoney, type QuoteLineItem } from '../types/fsm';

export const COMPANY_EMAIL_SETTINGS_HREF = '/settings/company';

export type QuoteSendBlocker = 'not_found' | 'no_client' | 'no_email' | 'no_smtp' | 'no_lines';

export type QuoteSendQueryTable = 'quotes' | 'clients' | 'email_settings' | 'jobs';

export type QuoteSendQueryScope = {
  table: QuoteSendQueryTable;
  columns: string;
  eq: Record<string, string>;
};

export type SmtpSettingsRow = {
  smtp_host?: string | null;
  smtp_pass?: string | null;
  from_name?: string | null;
  from_email?: string | null;
};

export type QuoteSendDecision =
  | {
      ok: true;
      to: string;
      toName: string;
      subject: string;
      filename: string;
    }
  | {
      ok: false;
      blocker: QuoteSendBlocker;
      message: string;
      href?: string;
    };

export type QuoteSendBundle = {
  quote: {
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
  } | null;
  client: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
  } | null;
  jobAddress: string | null;
  smtp: SmtpSettingsRow | null;
  company: QuoteSendCompany;
};

export type QuoteSendCompany = {
  name: string;
  abn?: string | null;
  licence_number?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logo_url?: string | null;
};

export const QUOTE_SEND_QUOTE_COLUMNS =
  'id, company_id, quote_number, client_id, job_id, status, description, scope_of_works, line_items, subtotal, tax_rate, tax_amount, total, validity_date, notes, inclusions, exclusions';

export const QUOTE_SEND_CLIENT_COLUMNS = 'id, name, email, phone, address';
export const QUOTE_SEND_SMTP_COLUMNS = 'smtp_host, smtp_pass, from_name, from_email';
export const QUOTE_SEND_JOB_COLUMNS = 'id, address';

const NO_EMAIL_MESSAGE = 'This client has no email. Add one on the client record before you send.';
const NO_SMTP_MESSAGE = 'Email is not set up. Add SMTP in Company settings — there is a test send there.';

/** Trim and require a real address. Do not invent one. */
export function clientEmailForSend(email: string | null | undefined): string | null {
  const href = mailtoHref(email);
  if (!href) return null;
  return href.slice('mailto:'.length);
}

export function isSmtpReady(settings: SmtpSettingsRow | null | undefined): boolean {
  if (!settings) return false;
  const host = String(settings.smtp_host ?? '').trim().toLowerCase();
  const pass = String(settings.smtp_pass ?? '').trim();
  const from = String(settings.from_email ?? '').trim();
  return host.includes('resend') && !!pass && from.includes('@');
}

export function quoteSendSubject(quoteNumber: number | null | undefined, companyName: string): string {
  const who = companyName.trim() || 'your contractor';
  return `Quote #${padQuoteNumber(quoteNumber)} from ${who}`;
}

export function quotePdfFilename(quoteNumber: number | null | undefined): string {
  return `quote-${padQuoteNumber(quoteNumber)}.pdf`;
}

export function quoteSendHtml(opts: {
  clientName: string;
  companyName: string;
  quoteNumber: number | null | undefined;
  totalLabel: string;
  validityLabel: string | null;
}): string {
  const client = escapeHtml(opts.clientName.trim() || 'there');
  const company = escapeHtml(opts.companyName.trim() || 'us');
  const number = escapeHtml(`#${padQuoteNumber(opts.quoteNumber)}`);
  const total = escapeHtml(opts.totalLabel);
  const valid = opts.validityLabel ? `<p style="color:#4A5568;font-size:15px;line-height:1.6;">Valid until <strong>${escapeHtml(opts.validityLabel)}</strong>.</p>` : '';
  return `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A">
        <div style="background:#0A2540;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
          <div style="font-size:12px;opacity:.7;letter-spacing:1px;text-transform:uppercase">Quote</div>
          <h1 style="margin:8px 0 0;font-size:20px">${number}</h1>
        </div>
        <div style="border:1px solid #E5E7EB;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p>Hi ${client},</p>
          <p>${company} has sent you quote ${number}.</p>
          <p style="color:#4A5568;font-size:15px;line-height:1.6;">Total (inc GST): <strong>${total}</strong></p>
          ${valid}
          <p>The quote PDF is attached. Reply to this email if you want to go ahead or change the scope.</p>
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
};

export function applyQuoteSendScope<T>(
  fromBuilder: { select: (columns: string) => T },
  scope: QuoteSendQueryScope,
): T {
  let q = fromBuilder.select(scope.columns) as T & FilterBuilder;
  for (const [column, value] of Object.entries(scope.eq)) {
    q = q.eq(column, value) as typeof q;
  }
  return q;
}

export function decideQuoteSend(bundle: QuoteSendBundle): QuoteSendDecision {
  const quote = bundle.quote;
  if (!quote) {
    return { ok: false, blocker: 'not_found', message: 'Quote not found.' };
  }
  if (!quote.client_id) {
    return { ok: false, blocker: 'no_client', message: 'Pick a client before you can send this quote.' };
  }
  if (!quoteHasChargeableLines(quote.line_items)) {
    return { ok: false, blocker: 'no_lines', message: 'Add the work and materials so the quote has a price.' };
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
  return {
    ok: true,
    to,
    toName: (bundle.client?.name ?? '').trim() || 'Client',
    subject: quoteSendSubject(quote.quote_number, bundle.company.name),
    filename: quotePdfFilename(quote.quote_number),
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
      logo_url: bundle.company.logo_url ?? null,
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

export async function loadQuoteSendBundle(
  quoteId: string,
  company: QuoteSendCompany & { id: string },
): Promise<QuoteSendBundle> {
  const scopes = quoteSendQueries({ companyId: company.id, quoteId });
  const quoteRes = await applyQuoteSendScope(supabase.from(scopes.quote.table), scopes.quote).maybeSingle();
  if (quoteRes.error) throw quoteRes.error;
  const quote = (quoteRes.data ?? null) as QuoteSendBundle['quote'];

  const clientScope = quoteSendClientQuery(quote?.client_id);
  const jobScope = quoteSendJobQuery(quote?.job_id);
  const smtpScope = scopes.smtp;

  const [clientRes, jobRes, smtpRes] = await Promise.all([
    clientScope
      ? applyQuoteSendScope(supabase.from(clientScope.table), clientScope).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    jobScope
      ? applyQuoteSendScope(supabase.from(jobScope.table), jobScope).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    applyQuoteSendScope(supabase.from(smtpScope.table), smtpScope).maybeSingle(),
  ]);
  if (clientRes.error) throw clientRes.error;
  if (jobRes.error) throw jobRes.error;
  if (smtpRes.error) throw smtpRes.error;

  return {
    quote,
    client: (clientRes.data ?? null) as QuoteSendBundle['client'],
    jobAddress: (jobRes.data as { address?: string | null } | null)?.address ?? null,
    smtp: (smtpRes.data ?? null) as SmtpSettingsRow | null,
    company,
  };
}

export type DeliverQuoteResult =
  | { ok: true; to: string; markedSent: true }
  | { ok: false; message: string; markedSent: false; href?: string };

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

export type QuotePdfBuilder = (bundle: QuoteSendBundle) => Promise<Blob>;

async function readFunctionError(error: { context?: unknown }): Promise<{ error?: string; href?: string } | null> {
  const ctx = error.context;
  if (!ctx || typeof ctx !== 'object' || !('json' in ctx) || typeof (ctx as Response).json !== 'function') {
    return null;
  }
  try {
    const body = await (ctx as Response).json() as { error?: string; href?: string };
    return body;
  } catch {
    return null;
  }
}

/**
 * Email the quote, then mark sent only if delivery succeeded.
 * Callers must not flip status themselves on a failed result.
 */
export async function deliverQuote(args: {
  quoteId: string;
  company: QuoteSendCompany & { id: string };
  buildPdf: QuotePdfBuilder;
}): Promise<DeliverQuoteResult> {
  const bundle = await loadQuoteSendBundle(args.quoteId, args.company);
  const decision = decideQuoteSend(bundle);
  if (!decision.ok) {
    return { ok: false, message: decision.message, markedSent: false, href: decision.href };
  }

  let attachment: { filename: string; content: string; contentType: string } | undefined;
  try {
    const pdf = await args.buildPdf(bundle);
    attachment = {
      filename: decision.filename,
      content: await blobToBase64(pdf),
      contentType: 'application/pdf',
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Could not build the quote PDF.',
      markedSent: false,
    };
  }

  const validityLabel = bundle.quote?.validity_date
    ? format(parseISO(bundle.quote.validity_date), 'd MMM yyyy')
    : null;
  const html = quoteSendHtml({
    clientName: decision.toName,
    companyName: args.company.name,
    quoteNumber: bundle.quote?.quote_number,
    totalLabel: formatMoney(Number(bundle.quote?.total) || 0),
    validityLabel,
  });

  const { data, error } = await supabase.functions.invoke('send-quote', {
    body: {
      quoteId: args.quoteId,
      to: decision.to,
      subject: decision.subject,
      html,
      attachment,
    },
  });

  if (error) {
    const fromBody = await readFunctionError(error);
    return {
      ok: false,
      message: fromBody?.error || error.message || 'Could not send the quote.',
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
    return { ok: false, message: 'Quote was not sent.', markedSent: false };
  }

  const patch = quoteStatusPatchAfterSend(true);
  if (patch && bundle.quote?.status === 'draft') {
    const { error: statusErr } = await supabase
      .from('quotes')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', args.quoteId)
      .eq('company_id', args.company.id);
    if (statusErr) {
      // Email already went. Status write is best-effort; the edge function also marks sent.
    }
  }

  return { ok: true, to: decision.to, markedSent: true };
}
