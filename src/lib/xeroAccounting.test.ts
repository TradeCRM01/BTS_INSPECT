import { describe, expect, it } from 'vitest';
import {
  ACCOUNTING_SETTINGS_PUBLIC_COLUMNS,
  canUseAccountingSettings,
  connectSuccessPatch,
  decideXeroConnect,
  decideXeroSync,
  disconnectAccountingPatch,
  hasXeroCredentials,
  invoicesStillToPush,
  isAccountingRedirectUri,
  paidInvoicesForXeroSync,
  parseXeroCallbackSearch,
  parseXeroTokenResponse,
  pickXeroTenant,
  preferenceInsertDefaults,
  preferenceSavePayload,
  publicAccountingRow,
  readXeroFunctionResult,
  recordPaidInvoiceSync,
  resolveXeroRedirectUri,
  settingsHaveXeroCipher,
  shouldStampLastSyncedAt,
  signXeroOAuthState,
  syncedPaidInvoiceMap,
  verifyXeroOAuthState,
  xeroAuthorizeUrl,
  xeroClientResponseHasSecrets,
  xeroInvoiceNumber,
  xeroInvoicePayload,
  xeroMissMessage,
  xeroPaymentPayload,
} from './xeroAccounting';

const paid = {
  id: 'inv-paid',
  company_id: 'co1',
  status: 'paid',
  invoice_number: 18,
  client_id: 'c1',
  line_items: [{ description: 'Switchboard test', quantity: 2, unit_price: 220 }],
  tax_rate: 10,
  total: 484,
  due_date: '2026-09-19',
  updated_at: '2026-08-20T10:00:00.000Z',
};

describe('canUseAccountingSettings', () => {
  it('is admin-only', () => {
    expect(canUseAccountingSettings('admin')).toBe(true);
    expect(canUseAccountingSettings('office')).toBe(false);
    expect(canUseAccountingSettings('field')).toBe(false);
    expect(canUseAccountingSettings(null)).toBe(false);
  });
});

describe('ACCOUNTING_SETTINGS_PUBLIC_COLUMNS', () => {
  it('reuses existing columns and never selects settings', () => {
    const cols = ACCOUNTING_SETTINGS_PUBLIC_COLUMNS.split(',').map((c) => c.trim());
    expect(cols).toContain('provider');
    expect(cols).toContain('tenant_id');
    expect(cols).toContain('connection_status');
    expect(cols).toContain('last_synced_at');
    expect(cols).toContain('sync_invoices');
    expect(cols).not.toContain('settings');
  });
});

describe('hasXeroCredentials / decideXeroConnect', () => {
  it('names the missing Xero app credentials', () => {
    expect(hasXeroCredentials({})).toBe(false);
    expect(decideXeroConnect({ provider: 'xero' })).toEqual({ ok: false, code: 'missing_credentials' });
    expect(xeroMissMessage('missing_credentials')).toContain('XERO_CLIENT_ID');
    expect(xeroMissMessage('missing_credentials')).toContain('XERO_CLIENT_SECRET');
  });

  it('starts a real Xero path only when credentials exist', () => {
    expect(decideXeroConnect({
      provider: 'xero',
      clientId: 'id',
      clientSecret: 'secret',
    })).toEqual({ ok: true });
  });

  it('leaves QuickBooks as an honest not-in-this-slice miss', () => {
    expect(decideXeroConnect({
      provider: 'quickbooks',
      clientId: 'id',
      clientSecret: 'secret',
    })).toEqual({ ok: false, code: 'quickbooks_not_in_slice' });
    expect(xeroMissMessage('quickbooks_not_in_slice')).toMatch(/not in this slice/i);
  });

  it('does not invent a second accounting provider', () => {
    expect(decideXeroConnect({ provider: 'none', clientId: 'id', clientSecret: 'secret' }))
      .toEqual({ ok: false, code: 'not_xero' });
  });
});

describe('parseXeroCallbackSearch', () => {
  it('treats cancel as a disconnected miss', () => {
    expect(parseXeroCallbackSearch('?error=access_denied')).toEqual({ ok: false, code: 'user_cancelled' });
    expect(xeroMissMessage('user_cancelled')).toMatch(/cancelled/);
  });

  it('treats a missing code or token error as a failed connect', () => {
    expect(parseXeroCallbackSearch('')).toEqual({ ok: false, code: 'token_failed' });
    expect(parseXeroCallbackSearch('error=invalid_request')).toEqual({ ok: false, code: 'token_failed' });
    expect(parseXeroCallbackSearch('code=abc')).toEqual({ ok: false, code: 'token_failed' });
  });

  it('reads a real code + state pair', () => {
    expect(parseXeroCallbackSearch('?code=abc&state=xyz')).toEqual({ ok: true, code: 'abc', state: 'xyz' });
  });
});

describe('xeroAuthorizeUrl / redirect', () => {
  it('builds the Xero authorize URL on the existing accounting page', () => {
    const url = xeroAuthorizeUrl({
      clientId: 'id',
      redirectUri: 'https://app.example/settings/accounting',
      state: 'st',
    });
    expect(url.startsWith('https://login.xero.com/identity/connect/authorize')).toBe(true);
    expect(url).toContain('response_type=code');
    expect(url).toContain('accounting.transactions');
    expect(url).toContain('offline_access');
    expect(url).not.toContain('/settings/quickbooks');
  });

  it('only accepts the existing accounting settings path', () => {
    expect(isAccountingRedirectUri('https://app.example/settings/accounting')).toBe(true);
    expect(isAccountingRedirectUri('https://app.example/settings/accounting?x=1')).toBe(false);
    expect(isAccountingRedirectUri('https://app.example/xero/callback')).toBe(false);
    expect(resolveXeroRedirectUri({ fromClient: 'https://app.example/settings/accounting' }))
      .toBe('https://app.example/settings/accounting');
    expect(resolveXeroRedirectUri({ fromClient: 'https://evil.example/steal' })).toEqual({ miss: true });
  });
});

describe('oauth state', () => {
  it('verifies a signed state and rejects tamper or expiry', async () => {
    const body = {
      c: 'co1',
      e: Date.now() + 60_000,
      r: 'https://app.example/settings/accounting',
      n: 'nonce-1',
    };
    const state = await signXeroOAuthState('secret', body);
    expect(await verifyXeroOAuthState('secret', state)).toEqual(body);
    expect(await verifyXeroOAuthState('other', state)).toBeNull();
    expect(await verifyXeroOAuthState('secret', `${state}x`)).toBeNull();
    const expired = await signXeroOAuthState('secret', { ...body, e: Date.now() - 1 });
    expect(await verifyXeroOAuthState('secret', expired)).toBeNull();
  });
});

describe('paidInvoicesForXeroSync', () => {
  it('pushes this company paid invoices only — not sent, draft, or other companies', () => {
    const rows = [
      paid,
      { ...paid, id: 'inv-sent', status: 'sent' },
      { ...paid, id: 'inv-draft', status: 'draft' },
      { ...paid, id: 'inv-other', company_id: 'co2' },
    ];
    expect(paidInvoicesForXeroSync(rows, 'co1').map((r) => r.id)).toEqual(['inv-paid']);
  });
});

describe('decideXeroSync', () => {
  const connected = {
    connectionStatus: 'connected',
    provider: 'xero',
    tenantId: 'tenant-1',
    hasTokenCipher: true,
    syncInvoices: true,
    paidCount: 1,
  };

  it('syncs when connected with a real tenant and paid invoices', () => {
    expect(decideXeroSync(connected)).toEqual({ ok: true });
  });

  it('misses when not connected or the token cipher is absent', () => {
    expect(decideXeroSync({ ...connected, connectionStatus: 'disconnected' }))
      .toEqual({ ok: false, code: 'not_connected' });
    expect(decideXeroSync({ ...connected, hasTokenCipher: false }))
      .toEqual({ ok: false, code: 'not_connected' });
    expect(decideXeroSync({ ...connected, tenantId: '' }))
      .toEqual({ ok: false, code: 'not_connected' });
  });

  it('misses when invoice sync is off or there are no paid invoices', () => {
    expect(decideXeroSync({ ...connected, syncInvoices: false }))
      .toEqual({ ok: false, code: 'invoice_sync_off' });
    expect(decideXeroSync({ ...connected, paidCount: 0 }))
      .toEqual({ ok: false, code: 'no_paid_invoices' });
    expect(xeroMissMessage('no_paid_invoices')).toMatch(/No paid invoices/);
  });
});

describe('xero invoice / payment payload', () => {
  it('maps a paid invoice to an ACCREC AUTHORISED invoice', () => {
    expect(xeroInvoiceNumber(paid)).toBe('INV-18');
    expect(xeroInvoicePayload(paid, { name: 'Acme Plumbing' })).toEqual({
      Type: 'ACCREC',
      Status: 'AUTHORISED',
      InvoiceNumber: 'INV-18',
      Contact: { Name: 'Acme Plumbing' },
      Date: '2026-08-20',
      DueDate: '2026-09-19',
      LineAmountTypes: 'Exclusive',
      LineItems: [{
        Description: 'Switchboard test',
        Quantity: 2,
        UnitAmount: 220,
        TaxType: 'OUTPUT',
        AccountCode: '200',
      }],
      Reference: 'inv-paid',
    });
  });

  it('skips invoices with no chargeable lines', () => {
    expect(xeroInvoicePayload({ ...paid, line_items: [] }, { name: 'Acme' })).toBeNull();
  });

  it('builds a payment against the pushed invoice — not a suppliers/payments module', () => {
    expect(xeroPaymentPayload({
      xeroInvoiceId: 'xero-1',
      amount: 484,
      accountId: 'bank-1',
      date: '2026-08-20T10:00:00.000Z',
    })).toEqual({
      Invoice: { InvoiceID: 'xero-1' },
      Account: { AccountID: 'bank-1' },
      Amount: 484,
      Date: '2026-08-20',
    });
  });
});

describe('token + tenant persistence', () => {
  it('connects only on a real token cipher and tenant', () => {
    expect(connectSuccessPatch({
      tenantId: '',
      settings: {},
      tokenCipher: { iv: 'iv', cipher: 'cipher' },
    })).toEqual({ miss: 'token_failed' });
    expect(connectSuccessPatch({
      tenantId: 'tenant-1',
      settings: {},
      tokenCipher: { iv: '', cipher: '' },
    })).toEqual({ miss: 'token_failed' });

    const patch = connectSuccessPatch({
      tenantId: 'tenant-1',
      settings: { other: true },
      tokenCipher: { iv: 'iv', cipher: 'cipher' },
      tenantName: 'Jack\'s Bar',
    });
    expect(patch).toMatchObject({
      provider: 'xero',
      tenant_id: 'tenant-1',
      connection_status: 'connected',
    });
    if ('settings' in patch) {
      expect(settingsHaveXeroCipher(patch.settings)).toBe(true);
      expect(patch.settings.other).toBe(true);
      expect(JSON.stringify(patch.settings)).not.toMatch(/access_token|refresh_token/);
    }
  });

  it('needs both access and refresh tokens from Xero', () => {
    expect(parseXeroTokenResponse({ access_token: 'a' })).toBeNull();
    expect(parseXeroTokenResponse({ access_token: 'a', refresh_token: 'r', expires_in: 1800 }))
      .toEqual({ accessToken: 'a', refreshToken: 'r', expiresIn: 1800 });
  });

  it('picks the organisation tenant', () => {
    expect(pickXeroTenant([])).toBeNull();
    expect(pickXeroTenant([
      { tenantId: 't1', tenantType: 'ORGANISATION', tenantName: 'Jack\'s Bar' },
    ])).toEqual({ tenantId: 't1', tenantName: 'Jack\'s Bar' });
  });

  it('disconnects by clearing tenant and token blob on the same row', () => {
    const settings = recordPaidInvoiceSync(
      { xero: { token: { iv: 'iv', cipher: 'cipher' }, paid_invoices: {} } },
      'inv-paid',
      'xero-1',
    );
    expect(syncedPaidInvoiceMap(settings)).toEqual({ 'inv-paid': 'xero-1' });
    expect(invoicesStillToPush([paid], settings)).toEqual([]);
    expect(disconnectAccountingPatch(settings)).toEqual({
      connection_status: 'disconnected',
      tenant_id: null,
      settings: {},
    });
  });
});

describe('preferenceSavePayload', () => {
  it('saves flags without wiping a live connection', () => {
    const payload = preferenceSavePayload({
      companyId: 'co1',
      provider: 'xero',
      autoSync: true,
      syncInvoices: true,
      syncPayments: false,
      syncSuppliers: false,
      now: '2026-08-21T00:00:00.000Z',
    });
    expect(payload).toEqual({
      company_id: 'co1',
      provider: 'xero',
      auto_sync: true,
      sync_invoices: true,
      sync_payments: false,
      sync_suppliers: false,
      updated_at: '2026-08-21T00:00:00.000Z',
    });
    expect(payload).not.toHaveProperty('connection_status');
    expect(payload).not.toHaveProperty('tenant_id');
    expect(payload).not.toHaveProperty('last_synced_at');
    expect(payload).not.toHaveProperty('settings');
    expect(preferenceInsertDefaults(payload).connection_status).toBe('disconnected');
  });
});

describe('shouldStampLastSyncedAt', () => {
  it('stamps only after Xero accepts at least one paid invoice', () => {
    expect(shouldStampLastSyncedAt({ pushed: 1 })).toBe(true);
    expect(shouldStampLastSyncedAt({ pushed: 0 })).toBe(false);
  });
});

describe('browser safety', () => {
  it('strips settings from the public row and rejects token-shaped responses', () => {
    expect(publicAccountingRow({
      id: '1',
      tenant_id: 't1',
      settings: { xero: { token: { iv: 'iv', cipher: 'nope' } } },
    })).toEqual({ id: '1', tenant_id: 't1' });
    expect(xeroClientResponseHasSecrets({ access_token: 'x' })).toBe(true);
    expect(xeroClientResponseHasSecrets({ ok: true, pushed: 1, tenantId: 't1' })).toBe(false);
  });
});

describe('readXeroFunctionResult', () => {
  it('prefers an honest miss over a transport error', () => {
    expect(readXeroFunctionResult(
      { ok: false, miss: 'Xero app credentials are missing. Set XERO_CLIENT_ID and XERO_CLIENT_SECRET on the xero-accounting edge function.' },
      { message: 'Edge Function returned a non-2xx status code' },
    )).toEqual({
      ok: false,
      message: 'Xero app credentials are missing. Set XERO_CLIENT_ID and XERO_CLIENT_SECRET on the xero-accounting edge function.',
    });
    expect(readXeroFunctionResult({ ok: true, authorizeUrl: 'https://login.xero.com/x' }, null)).toEqual({
      ok: true,
      body: { ok: true, authorizeUrl: 'https://login.xero.com/x' },
    });
  });
});
