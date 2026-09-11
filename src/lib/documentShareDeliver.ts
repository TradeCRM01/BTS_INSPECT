import { supabase } from './supabase';
import { isDevFieldAuditAuth } from './devFieldAuditAuth';
import { GRAFTER_PUBLIC_ORIGIN } from './publicSeo';
import {
  clientPortalPublicUrl,
  pickActiveClientPortalToken,
} from './sendQuote';
import {
  invoiceStatusAfterMarkSent,
  quoteStatusAfterMarkSent,
} from './documentShare';

export const AUDIT_SHARE_PORTAL_TOKEN = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

export function auditSharePortalUrl(origin: string): string {
  return clientPortalPublicUrl(origin, AUDIT_SHARE_PORTAL_TOKEN)
    ?? `${GRAFTER_PUBLIC_ORIGIN}/p?t=${AUDIT_SHARE_PORTAL_TOKEN}`;
}

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
  if (isDevFieldAuditAuth()) return null;
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
  if (isDevFieldAuditAuth()) return auditSharePortalUrl(args.origin);
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
  if (isDevFieldAuditAuth()) return { status: next, markedSent: true };
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
  if (isDevFieldAuditAuth()) return { status: next, markedSent: true };
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

export function openDocumentShareMailto(href: string): void {
  const value = href.trim();
  if (!value.startsWith('mailto:')) throw new Error('Not a mail draft link.');
  const a = document.createElement('a');
  a.href = value;
  a.rel = 'noopener';
  a.click();
}
