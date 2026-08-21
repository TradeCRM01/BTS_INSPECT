import { moneyRound } from './gst';

export const XERO_AUTHORIZE_URL = 'https://login.xero.com/identity/connect/authorize';
export const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token';
export const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections';
export const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0';
export const XERO_SCOPES = 'offline_access accounting.transactions accounting.contacts';
export const ACCOUNTING_SETTINGS_PATH = '/settings/accounting';
export const XERO_FUNCTION_NAME = 'xero-accounting';

/** Columns the browser may read. `settings` holds token ciphertext — never select it here. */
export const ACCOUNTING_SETTINGS_PUBLIC_COLUMNS =
  'id, company_id, provider, tenant_id, connection_status, last_synced_at, auto_sync, sync_invoices, sync_payments, sync_suppliers, created_at, updated_at';

export const XERO_CREDENTIAL_NAMES = ['XERO_CLIENT_ID', 'XERO_CLIENT_SECRET'] as const;

export type XeroMissCode =
  | 'missing_credentials'
  | 'user_cancelled'
  | 'token_failed'
  | 'not_connected'
  | 'not_xero'
  | 'invoice_sync_off'
  | 'no_paid_invoices'
  | 'xero_rejected'
  | 'quickbooks_not_in_slice'
  | 'not_admin';

export type AccountingProvider = 'none' | 'xero' | 'quickbooks' | string;

export type SyncableInvoiceLine = {
  description?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
};

export type SyncableInvoice = {
  id: string;
  company_id: string;
  status: string;
  invoice_number?: number | null;
  client_id?: string | null;
  line_items?: SyncableInvoiceLine[] | null;
  tax_rate?: number | null;
  total?: number | null;
  subtotal?: number | null;
  due_date?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type XeroOAuthStateBody = {
  c: string;
  e: number;
  r: string;
  n: string;
};

type JsonRecord = Record<string, unknown>;

export function canUseAccountingSettings(role?: string | null): boolean {
  return role === 'admin';
}

export function xeroMissMessage(code: XeroMissCode, detail?: string): string {
  const extra = detail?.trim() ? ` ${detail.trim()}` : '';
  switch (code) {
    case 'missing_credentials':
      return 'Xero app credentials are missing. Set XERO_CLIENT_ID and XERO_CLIENT_SECRET on the xero-accounting edge function.';
    case 'user_cancelled':
      return 'Xero connect was cancelled. The company is still disconnected.';
    case 'token_failed':
      return `Xero did not return a usable token or tenant. The company is still disconnected.${extra}`;
    case 'not_connected':
      return 'Xero is not connected. Connect before syncing.';
    case 'not_xero':
      return 'Connect is only wired for Xero on this page.';
    case 'invoice_sync_off':
      return 'Invoice sync is turned off in settings. Paid invoices were not pushed.';
    case 'no_paid_invoices':
      return 'No paid invoices to sync for this company.';
    case 'xero_rejected':
      return `Xero rejected the sync.${extra}`;
    case 'quickbooks_not_in_slice':
      return 'QuickBooks is not in this slice. Connect stays unwired.';
    case 'not_admin':
      return 'Accounting settings are admin-only.';
  }
}

export function hasXeroCredentials(env: {
  XERO_CLIENT_ID?: string | null;
  XERO_CLIENT_SECRET?: string | null;
}): boolean {
  return Boolean(env.XERO_CLIENT_ID?.trim() && env.XERO_CLIENT_SECRET?.trim());
}

export function decideXeroConnect(input: {
  provider: AccountingProvider;
  clientId?: string | null;
  clientSecret?: string | null;
}): { ok: true } | { ok: false; code: XeroMissCode } {
  if (input.provider === 'quickbooks') return { ok: false, code: 'quickbooks_not_in_slice' };
  if (input.provider !== 'xero') return { ok: false, code: 'not_xero' };
  if (!hasXeroCredentials({ XERO_CLIENT_ID: input.clientId, XERO_CLIENT_SECRET: input.clientSecret })) {
    return { ok: false, code: 'missing_credentials' };
  }
  return { ok: true };
}

export function decideXeroSync(input: {
  connectionStatus?: string | null;
  provider?: string | null;
  tenantId?: string | null;
  hasTokenCipher?: boolean;
  syncInvoices?: boolean | null;
  paidCount: number;
}): { ok: true } | { ok: false; code: XeroMissCode } {
  const connected =
    input.provider === 'xero'
    && input.connectionStatus === 'connected'
    && Boolean(input.tenantId?.trim())
    && input.hasTokenCipher === true;
  if (!connected) return { ok: false, code: 'not_connected' };
  if (input.syncInvoices === false) return { ok: false, code: 'invoice_sync_off' };
  if (input.paidCount <= 0) return { ok: false, code: 'no_paid_invoices' };
  return { ok: true };
}

export function isAccountingRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && url.pathname === ACCOUNTING_SETTINGS_PATH
      && !url.hash
      && !url.search;
  } catch {
    return false;
  }
}

export function resolveXeroRedirectUri(input: {
  fromClient?: string | null;
  fromEnv?: string | null;
}): string | { miss: true } {
  const env = input.fromEnv?.trim();
  if (env) return isAccountingRedirectUri(env) ? env : { miss: true };
  const client = input.fromClient?.trim();
  if (client && isAccountingRedirectUri(client)) return client;
  return { miss: true };
}

export function xeroAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes?: string;
}): string {
  const url = new URL(XERO_AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('scope', input.scopes ?? XERO_SCOPES);
  url.searchParams.set('state', input.state);
  return url.toString();
}

export function parseXeroCallbackSearch(search: string):
  | { ok: true; code: string; state: string }
  | { ok: false; code: XeroMissCode } {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const q = new URLSearchParams(raw);
  const error = q.get('error');
  if (error === 'access_denied') return { ok: false, code: 'user_cancelled' };
  if (error) return { ok: false, code: 'token_failed' };
  const code = q.get('code')?.trim();
  const state = q.get('state')?.trim();
  if (!code || !state) return { ok: false, code: 'token_failed' };
  return { ok: true, code, state };
}

export function paidInvoicesForXeroSync<T extends SyncableInvoice>(
  invoices: T[],
  companyId: string,
): T[] {
  return invoices.filter((inv) => inv.company_id === companyId && inv.status === 'paid');
}

export function xeroInvoiceNumber(invoice: Pick<SyncableInvoice, 'id' | 'invoice_number'>): string {
  if (invoice.invoice_number != null && Number.isFinite(Number(invoice.invoice_number))) {
    return `INV-${Number(invoice.invoice_number)}`;
  }
  return `INV-${invoice.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export function xeroDate(value?: string | null): string {
  const raw = (value ?? '').trim();
  if (raw.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

export function xeroLineItems(
  lines: SyncableInvoice['line_items'],
  taxRate: number,
  accountCode = '200',
): { Description: string; Quantity: number; UnitAmount: number; TaxType: string; AccountCode: string }[] {
  const taxType = (Number(taxRate) || 0) > 0 ? 'OUTPUT' : 'NONE';
  return (lines ?? [])
    .map((line) => ({
      Description: String(line.description ?? '').trim() || 'Item',
      Quantity: Number(line.quantity) || 0,
      UnitAmount: moneyRound(Number(line.unit_price) || 0),
      TaxType: taxType,
      AccountCode: accountCode,
    }))
    .filter((line) => line.Quantity > 0);
}

export function xeroInvoicePayload(
  invoice: SyncableInvoice,
  client: { name?: string | null } | null,
  accountCode = '200',
): Record<string, unknown> | null {
  const taxRate = Number(invoice.tax_rate) || 0;
  const lineItems = xeroLineItems(invoice.line_items, taxRate, accountCode);
  if (lineItems.length === 0) return null;
  const date = xeroDate(invoice.updated_at || invoice.created_at);
  return {
    Type: 'ACCREC',
    Status: 'AUTHORISED',
    InvoiceNumber: xeroInvoiceNumber(invoice),
    Contact: { Name: (client?.name ?? '').trim() || 'Customer' },
    Date: date,
    DueDate: xeroDate(invoice.due_date) || date,
    LineAmountTypes: taxRate > 0 ? 'Exclusive' : 'NoTax',
    LineItems: lineItems,
    Reference: invoice.id,
  };
}

export function xeroPaymentPayload(input: {
  xeroInvoiceId: string;
  amount: number;
  accountId: string;
  date?: string | null;
}): Record<string, unknown> {
  return {
    Invoice: { InvoiceID: input.xeroInvoiceId },
    Account: { AccountID: input.accountId },
    Amount: moneyRound(input.amount),
    Date: xeroDate(input.date),
  };
}

export function pickXeroTenant(
  connections: { tenantId?: string | null; tenantType?: string | null; tenantName?: string | null }[],
): { tenantId: string; tenantName?: string } | null {
  const withId = connections.filter((c) => Boolean(c.tenantId?.trim()));
  const org = withId.find((c) => !c.tenantType || c.tenantType === 'ORGANISATION') ?? withId[0];
  if (!org?.tenantId) return null;
  return { tenantId: org.tenantId, tenantName: org.tenantName ?? undefined };
}

export function parseXeroTokenResponse(json: unknown): {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
} | null {
  const o = asRecord(json);
  const accessToken = String(o.access_token ?? '').trim();
  const refreshToken = String(o.refresh_token ?? '').trim();
  if (!accessToken || !refreshToken) return null;
  return {
    accessToken,
    refreshToken,
    expiresIn: Number(o.expires_in) || 1800,
  };
}

export function settingsHaveXeroCipher(settings: unknown): boolean {
  const token = asRecord(asRecord(asRecord(settings).xero).token);
  return Boolean(String(token.iv ?? '').trim() && String(token.cipher ?? '').trim());
}

export function syncedPaidInvoiceMap(settings: unknown): Record<string, string> {
  const map = asRecord(asRecord(asRecord(settings).xero).paid_invoices);
  const out: Record<string, string> = {};
  for (const [id, xeroId] of Object.entries(map)) {
    if (typeof xeroId === 'string' && xeroId.trim()) out[id] = xeroId;
  }
  return out;
}

export function invoicesStillToPush<T extends { id: string }>(invoices: T[], settings: unknown): T[] {
  const map = syncedPaidInvoiceMap(settings);
  return invoices.filter((inv) => !map[inv.id]);
}

export function mergeXeroTokenSettings(
  existing: unknown,
  token: { iv: string; cipher: string; expiresAt?: string; tenantName?: string },
): JsonRecord {
  const prev = asRecord(existing);
  const prevXero = asRecord(prev.xero);
  return {
    ...prev,
    xero: {
      ...prevXero,
      token: { iv: token.iv, cipher: token.cipher },
      expires_at: token.expiresAt ?? null,
      tenant_name: token.tenantName ?? prevXero.tenant_name ?? null,
      paid_invoices: asRecord(prevXero.paid_invoices),
    },
  };
}

export function recordPaidInvoiceSync(
  existing: unknown,
  invoiceId: string,
  xeroInvoiceId: string,
): JsonRecord {
  const prev = asRecord(existing);
  const prevXero = asRecord(prev.xero);
  return {
    ...prev,
    xero: {
      ...prevXero,
      paid_invoices: {
        ...asRecord(prevXero.paid_invoices),
        [invoiceId]: xeroInvoiceId,
      },
    },
  };
}

export function connectSuccessPatch(input: {
  tenantId: string;
  settings: unknown;
  tokenCipher: { iv: string; cipher: string };
  expiresAt?: string;
  tenantName?: string;
}):
  | {
      provider: 'xero';
      tenant_id: string;
      connection_status: 'connected';
      settings: JsonRecord;
    }
  | { miss: 'token_failed' } {
  const tenantId = input.tenantId.trim();
  if (!tenantId || !input.tokenCipher.iv.trim() || !input.tokenCipher.cipher.trim()) {
    return { miss: 'token_failed' };
  }
  return {
    provider: 'xero',
    tenant_id: tenantId,
    connection_status: 'connected',
    settings: mergeXeroTokenSettings(input.settings, {
      iv: input.tokenCipher.iv,
      cipher: input.tokenCipher.cipher,
      expiresAt: input.expiresAt,
      tenantName: input.tenantName,
    }),
  };
}

export function disconnectAccountingPatch(existingSettings: unknown): {
  connection_status: 'disconnected';
  tenant_id: null;
  settings: JsonRecord;
} {
  const next = asRecord(existingSettings);
  delete next.xero;
  return {
    connection_status: 'disconnected',
    tenant_id: null,
    settings: next,
  };
}

export function preferenceSavePayload(input: {
  companyId: string;
  provider: string;
  autoSync: boolean;
  syncInvoices: boolean;
  syncPayments: boolean;
  syncSuppliers: boolean;
  now?: string;
}): {
  company_id: string;
  provider: string;
  auto_sync: boolean;
  sync_invoices: boolean;
  sync_payments: boolean;
  sync_suppliers: boolean;
  updated_at: string;
} {
  return {
    company_id: input.companyId,
    provider: input.provider,
    auto_sync: input.autoSync,
    sync_invoices: input.syncInvoices,
    sync_payments: input.syncPayments,
    sync_suppliers: input.syncSuppliers,
    updated_at: input.now ?? new Date().toISOString(),
  };
}

export function preferenceInsertDefaults<T extends { company_id: string }>(payload: T): T & {
  connection_status: 'disconnected';
} {
  return { ...payload, connection_status: 'disconnected' };
}

export function shouldStampLastSyncedAt(result: { pushed: number }): boolean {
  return result.pushed > 0;
}

export function xeroClientResponseHasSecrets(body: unknown): boolean {
  const text = JSON.stringify(body ?? {});
  return /access_token|refresh_token|client_secret|XERO_CLIENT_SECRET|"cipher"\s*:/.test(text);
}

export function readXeroFunctionResult(
  data: unknown,
  error?: { message?: string } | null,
): { ok: true; body: Record<string, unknown> } | { ok: false; message: string } {
  const body = data && typeof data === 'object' && !Array.isArray(data)
    ? { ...(data as Record<string, unknown>) }
    : {};
  if (typeof body.miss === 'string' && body.miss.trim()) {
    return { ok: false, message: body.miss };
  }
  if (body.ok === false) {
    return { ok: false, message: xeroMissMessage('token_failed') };
  }
  if (error) {
    return { ok: false, message: error.message?.trim() || xeroMissMessage('token_failed') };
  }
  return { ok: true, body };
}

export function publicAccountingRow<T extends { settings?: unknown }>(row: T | null): Omit<T, 'settings'> | null {
  if (!row) return null;
  const { settings: _settings, ...rest } = row;
  return rest;
}

export async function signXeroOAuthState(secret: string, body: XeroOAuthStateBody): Promise<string> {
  const encoded = bytesToB64url(new TextEncoder().encode(JSON.stringify(body)));
  const sig = await hmacSha256B64url(secret, encoded);
  return `${encoded}.${sig}`;
}

export async function verifyXeroOAuthState(
  secret: string,
  state: string,
  now = Date.now(),
): Promise<XeroOAuthStateBody | null> {
  const cut = state.lastIndexOf('.');
  if (cut <= 0) return null;
  const encoded = state.slice(0, cut);
  const sig = state.slice(cut + 1);
  const expected = await hmacSha256B64url(secret, encoded);
  if (sig !== expected) return null;
  try {
    const body = JSON.parse(new TextDecoder().decode(b64urlToBytes(encoded))) as XeroOAuthStateBody;
    if (!body?.c || !body.r || !body.n || !body.e) return null;
    if (body.e < now) return null;
    if (!isAccountingRedirectUri(body.r)) return null;
    return body;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as JsonRecord) } : {};
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(value: string): Uint8Array {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
  const bin = atob(value.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSha256B64url(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return bytesToB64url(new Uint8Array(sig));
}
