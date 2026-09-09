import { supabase } from './supabase';
import {
  clientPortalPublicUrl,
  pickActiveClientPortalToken,
} from './sendQuote';
import {
  invoiceStatusAfterMarkSent,
  quoteStatusAfterMarkSent,
} from './documentShare';

export const CLIENT_PORTAL_TOKEN_COLUMNS = 'token, revoked, expires_at';

export function clientPortalTokenInsert(args: {
  companyId: string;
  clientId: string;
  now?: Date;
}): { company_id: string; client_id: string; token: string; expires_at: string } {
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const now = args.now ?? new Date();
  return {
    company_id: args.companyId,
    client_id: args.clientId,
    token,
    expires_at: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export async function loadActiveClientPortalUrl(args: {
  companyId: string;
  clientId: string;
  origin: string;
}): Promise<string | null> {
  const companyId = args.companyId.trim();
  const clientId = args.clientId.trim();
  if (!companyId || !clientId) return null;
  const { data, error } = await supabase
    .from('client_portal_tokens')
    .select(CLIENT_PORTAL_TOKEN_COLUMNS)
    .eq('company_id', companyId)
    .eq('client_id', clientId)
    .eq('revoked', false)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return clientPortalPublicUrl(args.origin, pickActiveClientPortalToken(data ?? []));
}

export async function ensureClientPortalUrl(args: {
  companyId: string;
  clientId: string;
  origin: string;
}): Promise<string> {
  const existing = await loadActiveClientPortalUrl(args);
  if (existing) return existing;
  const row = clientPortalTokenInsert({
    companyId: args.companyId,
    clientId: args.clientId,
  });
  const { error } = await supabase.from('client_portal_tokens').insert(row);
  if (error) throw error;
  const url = clientPortalPublicUrl(args.origin, row.token);
  if (!url) throw new Error('Could not build the portal link.');
  return url;
}

export async function markQuoteSentForShare(args: {
  quoteId: string;
  status: string;
}): Promise<{ status: string; markedSent: boolean }> {
  const next = quoteStatusAfterMarkSent(args.status);
  if (!next) return { status: args.status, markedSent: false };
  const { error } = await supabase
    .from('quotes')
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq('id', args.quoteId)
    .eq('status', 'draft');
  if (error) throw error;
  return { status: next, markedSent: true };
}

export async function markInvoiceSentForShare(args: {
  invoiceId: string;
  status: string;
}): Promise<{ status: string; markedSent: boolean }> {
  const next = invoiceStatusAfterMarkSent(args.status);
  if (!next) return { status: args.status, markedSent: false };
  const { error } = await supabase
    .from('invoices')
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq('id', args.invoiceId)
    .eq('status', 'draft');
  if (error) throw error;
  return { status: next, markedSent: true };
}

export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function copyTextToClipboard(text: string): Promise<void> {
  const value = text.trim();
  if (!value) throw new Error('Nothing to copy.');
  await navigator.clipboard.writeText(value);
}
