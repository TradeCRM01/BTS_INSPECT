import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clientSourceSelectsAccountingTokens } from './accountingClientTokenGuard';
import {
  ACCOUNTING_SETTINGS_PUBLIC_COLUMNS,
  accountingSettingsWrite,
  stripAccountingSettingsTokenKeys,
} from './xeroAccounting';

const SRC_ROOT = resolve(process.cwd(), 'src');

function walkSrcFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const next = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSrcFiles(next, acc);
      continue;
    }
    if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.(ts|tsx)$/.test(entry.name)) acc.push(next);
  }
  return acc;
}

describe('client accounting token guard', () => {
  it('fails when a src file selects accounting tokens or accounting_credentials', () => {
    const leaked = [
      "supabase.from('accounting_credentials').select('access_token')",
      'supabase.from("accounting_credentials").select("*")',
      "supabase.from('accounting_settings').select('access_token, refresh_token')",
      "supabase.from('accounting_settings').select('expires_at')",
    ];
    for (const source of leaked) {
      expect(clientSourceSelectsAccountingTokens(source)).toBe(true);
    }
    expect(clientSourceSelectsAccountingTokens(
      "supabase.from('accounting_settings').select('id, company_id, provider')",
    )).toBe(false);
    expect(clientSourceSelectsAccountingTokens(
      "const token = session?.access_token",
    )).toBe(false);

    const offenders = walkSrcFiles(SRC_ROOT).filter((file) => {
      const source = readFileSync(file, 'utf8');
      return clientSourceSelectsAccountingTokens(source);
    });
    expect(offenders.map((file) => relative(SRC_ROOT, file))).toEqual([]);
  });

  it('keeps the public accounting select free of settings and token columns', () => {
    expect(ACCOUNTING_SETTINGS_PUBLIC_COLUMNS).not.toMatch(/settings|access_token|refresh_token|expires_at/);
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
    expect(stripped.xero).toMatchObject({
      tenant_name: "Jack's Bar",
      paid_invoices: { 'inv-1': 'xero-1' },
    });
    expect(stripped.xero).not.toHaveProperty('access_token');
    expect(stripped.xero).not.toHaveProperty('refresh_token');
    expect(stripped.xero).not.toHaveProperty('expires_at');
    expect(stripped.xero).not.toHaveProperty('token');
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
        },
      },
    });
    expect(written.company_id).toBe('co1');
    expect(written.settings).not.toHaveProperty('access_token');
    expect(written.settings).not.toHaveProperty('refresh_token');
    expect(written.settings).not.toHaveProperty('expires_at');
    expect(written.settings.xero).toEqual({ tenant_name: "Jack's Bar" });
    expect(accountingSettingsWrite({ company_id: 'co1', provider: 'xero' })).toEqual({
      company_id: 'co1',
      provider: 'xero',
    });
  });
});
