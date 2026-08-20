import { format, parseISO } from 'date-fns';
import { supabase } from './supabase';
import { formatMoney } from '../types/fsm';
import {
  applyQuoteSendScope,
  blobToBase64,
  decideQuoteSend,
  quoteSendClientQuery,
  quoteSendHtml,
  quoteSendJobQuery,
  quoteSendQueries,
  quoteStatusPatchAfterSend,
  type QuoteSendBundle,
  type QuoteSendCompany,
  type SmtpSettingsRow,
} from './sendQuote';

export type DeliverQuoteResult =
  | { ok: true; to: string; markedSent: true }
  | { ok: false; message: string; markedSent: false; href?: string };

export type QuotePdfBuilder = (bundle: QuoteSendBundle) => Promise<Blob>;

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
