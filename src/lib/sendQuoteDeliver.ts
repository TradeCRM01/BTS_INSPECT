import { supabase } from './supabase';
import {
  applyQuoteSendScope,
  blobToBase64,
  commercialPdfDataForQuote,
  decideQuoteSend,
  pickQuotePdfAttachment,
  quoteAttachmentOrMiss,
  quotePdfFilename,
  quoteSendClientQuery,
  quoteSendJobQuery,
  quoteSendQueries,
  type QuotePdfAttachment,
  type QuoteSendBundle,
  type QuoteSendCompany,
} from './sendQuote';
import { type SmtpSettingsRow } from './sendInvoice';
import { formatEmailAndSmsMessage, type SmsSendResult } from './jobReminder';
import { generateCommercialPdf } from '../reports/commercial/generateCommercialPdf';

export type DeliverQuoteResult =
  | { ok: true; to: string; markedSent: true; message: string; sms: SmsSendResult | null }
  | { ok: false; message: string; markedSent: false; href?: string };

export type QuotePdfBuilder = (bundle: QuoteSendBundle) => Promise<Blob>;

export async function defaultQuotePdfBuilder(bundle: QuoteSendBundle): Promise<Blob> {
  const data = commercialPdfDataForQuote(bundle);
  if (!data) throw new Error('Could not build the quote PDF.');
  return generateCommercialPdf(data);
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
 * Email the quote through the job-reminder Resend pipe, then treat
 * sent as true only if that function reports delivery.
 * Callers must not flip status themselves on a failed result.
 * Attaches the existing commercial quote PDF.
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

  let generated: QuotePdfAttachment | null = null;
  try {
    const pdf = await args.buildPdf(bundle);
    generated = {
      filename: decision.filename || quotePdfFilename(bundle.quote?.quote_number),
      content: await blobToBase64(pdf),
      contentType: 'application/pdf',
    };
  } catch {
    generated = null;
  }

  const picked = quoteAttachmentOrMiss(pickQuotePdfAttachment({
    existing: bundle.existingPdf,
    generated,
  }));
  if (!picked.ok) {
    return { ok: false, message: picked.message, markedSent: false };
  }

  const { data, error } = await supabase.functions.invoke('job-reminder', {
    body: {
      quoteId: args.quoteId,
      appUrl: typeof window !== 'undefined' ? window.location.origin : '',
      attachment: picked.attachment,
    },
  });

  if (error) {
    const fromBody = await readFunctionError(error);
    return {
      ok: false,
      message: fromBody?.error || fromBody?.message || error.message || 'Could not send the quote.',
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
      message: String(data.message ?? data.results?.[0]?.message ?? 'Quote was not sent.'),
      markedSent: false,
      href: data.href,
    };
  }
  if (!data?.sent) {
    return { ok: false, message: 'Quote was not sent.', markedSent: false };
  }

  const to = String(data.to ?? decision.to);
  const sms = (data?.sms ?? null) as SmsSendResult | null;
  const message = String(data.message ?? '').trim()
    || formatEmailAndSmsMessage(`Quote sent to ${to}`, sms);
  return { ok: true, to, markedSent: true, message, sms };
}
