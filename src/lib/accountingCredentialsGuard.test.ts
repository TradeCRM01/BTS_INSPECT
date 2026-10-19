import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { accountingTokenOffenders, sourceLeaksAccountingTokens } from './accountingClientTokenGuard';
import {
  ACCOUNTING_SETTINGS_PUBLIC_COLUMNS,
  accountingSettingsWrite,
  stripAccountingSettingsTokenKeys,
} from './xeroAccounting';

const SRC_ROOT = resolve(process.cwd(), 'src');

describe('client accounting token guard', () => {
  it('fails when src selects accounting_credentials, selects token columns, or writes token keys onto settings', () => {
    const leaked = [
      "supabase.from('accounting_credentials').select('access_token')",
      'supabase.from("accounting_credentials").select("*")',
      "supabase.from('accounting_settings').select('access_token, refresh_token')",
      "supabase.from('accounting_settings').select('expires_at')",
      'const settings = { access_token: "leak", refresh_token: "leak" }',
      'settings.expires_at = "2099-01-01"',
      'const xero = { token: { iv: "iv", cipher: "cipher" }, expires_at: "2099-01-01" }',
    ];
    for (const source of leaked) {
      expect(sourceLeaksAccountingTokens(source)).toBe(true);
    }
    expect(sourceLeaksAccountingTokens(
      "supabase.from('accounting_settings').select('id, company_id, provider')",
    )).toBe(false);
    expect(sourceLeaksAccountingTokens(
      "supabase.from('client_portal_tokens').select('id, token, revoked, expires_at')",
    )).toBe(false);
    expect(sourceLeaksAccountingTokens('const token = session?.access_token')).toBe(false);
    expect(sourceLeaksAccountingTokens(
      "export function parseXeroTokenResponse(json: unknown) {\n  const accessToken = String(o.access_token ?? '').trim();\n  const refreshToken = String(o.refresh_token ?? '').trim();\n}",
    )).toBe(false);
    expect(sourceLeaksAccountingTokens(
      'export function xeroClientResponseHasSecrets(body: unknown): boolean {\n  return /access_token|refresh_token|client_secret|"cipher"\\s*:/.test(text);\n}',
    )).toBe(false);
    expect(sourceLeaksAccountingTokens(
      "export const ACCOUNTING_SETTINGS_TOKEN_KEYS = [\n  'access_token',\n  'refresh_token',\n  'expires_at',\n  'token',\n] as const;",
    )).toBe(false);

    expect(accountingTokenOffenders(SRC_ROOT)).toEqual([]);
  });

  it('keeps the public accounting select free of settings and token columns', () => {
    expect(ACCOUNTING_SETTINGS_PUBLIC_COLUMNS).not.toMatch(/settings|access_token|refresh_token|expires_at|\btoken\b/);
  });
});

describe('client settings jsonb write strips token keys', () => {
  it('drops token keys and keeps tenant_name and paid_invoices', () => {
    const stripped = stripAccountingSettingsTokenKeys({
      other: true,
      access_token: 'leak',
      refresh_token: 'leak',
      expires_at: '2099-01-01T00:00:00.000Z',
      token: { iv: 'iv', cipher: 'cipher' },
      xero: {
        access_token: 'leak',
        refresh_token: 'leak',
        expires_at: '2099-01-01T00:00:00.000Z',
        token: { iv: 'iv', cipher: 'cipher' },
        tenant_name: "Jack's Bar",
        paid_invoices: { 'inv-1': 'xero-1' },
      },
    });
    expect(stripped.other).toBe(true);
    expect(stripped).not.toHaveProperty('access_token');
    expect(stripped).not.toHaveProperty('refresh_token');
    expect(stripped).not.toHaveProperty('expires_at');
    expect(stripped).not.toHaveProperty('token');
    expect(stripped.xero).toEqual({
      tenant_name: "Jack's Bar",
      paid_invoices: { 'inv-1': 'xero-1' },
    });
    expect(JSON.stringify(stripped)).not.toMatch(/access_token|refresh_token|cipher/);
  });

  it('strips token keys from a client settings jsonb write', () => {
    const written = accountingSettingsWrite({
      company_id: 'co1',
      provider: 'xero',
      settings: {
        access_token: 'leak',
        refresh_token: 'leak',
        expires_at: '2099-01-01T00:00:00.000Z',
        xero: {
          token: { iv: 'iv', cipher: 'cipher' },
          tenant_name: "Jack's Bar",
          paid_invoices: { 'inv-1': 'xero-1' },
        },
      },
    });
    expect(written.company_id).toBe('co1');
    expect(written.provider).toBe('xero');
    expect(written.settings).not.toHaveProperty('access_token');
    expect(written.settings).not.toHaveProperty('refresh_token');
    expect(written.settings).not.toHaveProperty('expires_at');
    expect(written.settings.xero).toEqual({
      tenant_name: "Jack's Bar",
      paid_invoices: { 'inv-1': 'xero-1' },
    });
    expect(accountingSettingsWrite({ company_id: 'co1', provider: 'xero' })).toEqual({
      company_id: 'co1',
      provider: 'xero',
    });
  });
});
