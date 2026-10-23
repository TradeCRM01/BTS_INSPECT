import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EMAIL_SETTINGS_CLIENT_COLUMNS,
  EMAIL_SETTINGS_PUBLIC_COLUMNS,
  EMAIL_SETTINGS_REMINDER_COLUMNS,
  EMAIL_SMTP_READY_RPC,
  EMAIL_SMTP_SET_PASS_RPC,
  emailSettingsPublicSelect,
  fetchEmailSmtpReady,
  loadBrowserEmailSettings,
  saveCompanyEmailSettings,
} from './emailSmtpClient';
import { emailSettingsReady } from './jobReminder';
import {
  INVOICE_SEND_SMTP_COLUMNS,
} from './sendInvoice';
import { QUOTE_SEND_SMTP_COLUMNS } from './sendQuote';
import { REPORT_SEND_SMTP_COLUMNS } from './sendReport';
import { PURCHASE_ORDER_SEND_SMTP_COLUMNS } from './sendPurchaseOrder';
import { JOB_REMINDER_SMTP_COLUMNS } from './jobReminder';
import { contractVisitReminderQueries } from './contractVisitReminder';

const SECRET = 'sec-smtp-probe-secret-5a106e2d';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(path, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

describe('SEC-SMTP client selects', () => {
  it('omits the SMTP secret from every client email_settings column list', () => {
    expect(emailSettingsPublicSelect(EMAIL_SETTINGS_PUBLIC_COLUMNS)).toBe(true);
    expect(emailSettingsPublicSelect(EMAIL_SETTINGS_CLIENT_COLUMNS)).toBe(true);
    expect(emailSettingsPublicSelect(EMAIL_SETTINGS_REMINDER_COLUMNS)).toBe(true);
    expect(emailSettingsPublicSelect(JOB_REMINDER_SMTP_COLUMNS)).toBe(true);
    expect(emailSettingsPublicSelect(INVOICE_SEND_SMTP_COLUMNS)).toBe(true);
    expect(emailSettingsPublicSelect(QUOTE_SEND_SMTP_COLUMNS)).toBe(true);
    expect(emailSettingsPublicSelect(REPORT_SEND_SMTP_COLUMNS)).toBe(true);
    expect(emailSettingsPublicSelect(PURCHASE_ORDER_SEND_SMTP_COLUMNS)).toBe(true);
    expect(contractVisitReminderQueries({
      companyId: '5a106e2d-0000-4000-8000-000000000001',
      contractId: '5a106e2d-0000-4000-8000-000000000010',
    }).smtp.columns).toBe(EMAIL_SETTINGS_CLIENT_COLUMNS);
    expect(emailSettingsPublicSelect('*')).toBe(false);
    expect(emailSettingsPublicSelect('smtp_host, not_a_public_column, from_email')).toBe(false);
  });

  it('fails closed when host and from are set but readiness is unknown', () => {
    expect(emailSettingsReady({
      smtp_host: 'smtp.resend.com',
      from_email: 'office@co.com.au',
    })).toBe(false);
    expect(emailSettingsReady({
      smtp_host: 'smtp.resend.com',
      from_email: 'office@co.com.au',
      extra: '',
    })).toBe(false);
    expect(emailSettingsReady({
      smtp_host: 'smtp.resend.com',
      from_email: 'office@co.com.au',
      extra: SECRET,
    })).toBe(true);
    expect(emailSettingsReady({
      smtp_host: 'smtp.mailgun.org',
      from_email: '',
      ready: true,
    })).toBe(true);
    expect(emailSettingsReady({
      smtp_host: 'smtp.resend.com',
      from_email: 'office@co.com.au',
      ready: false,
    })).toBe(false);
  });

  it('reads company SMTP readiness from the status RPC, not a secret column', async () => {
    const calls: string[] = [];
    const ready = await fetchEmailSmtpReady({
      rpc: async (fn: string) => {
        calls.push(fn);
        return { data: true, error: null };
      },
    });
    expect(calls).toEqual([EMAIL_SMTP_READY_RPC]);
    expect(ready).toBe(true);
    const loaded = await loadBrowserEmailSettings({
      rpc: async () => ({ data: false, error: null }),
      from: () => ({
        select: (columns: string) => {
          expect(emailSettingsPublicSelect(columns)).toBe(true);
          return {
            eq: () => ({
              maybeSingle: async () => ({
                data: { smtp_host: 'smtp.resend.com', from_email: 'a@probe.test' },
                error: null,
              }),
            }),
          };
        },
      }),
    }, '5a106e2d-0000-4000-8000-000000000001');
    expect(loaded?.ready).toBe(false);
    expect(loaded).not.toHaveProperty('smtp_pass');
  });

  it('upserts public columns then sets the password through the setter RPC', async () => {
    const upserts: Array<Record<string, unknown>> = [];
    const rpcs: Array<{ fn: string; args?: Record<string, unknown> }> = [];
    const saved = await saveCompanyEmailSettings({
      rpc: async (fn: string, args?: Record<string, unknown>) => {
        rpcs.push({ fn, args });
        return { data: null, error: null };
      },
      from: () => ({
        upsert: (payload: Record<string, unknown>) => {
          upserts.push(payload);
          return {
            select: (columns: string) => {
              expect(emailSettingsPublicSelect(columns)).toBe(true);
              return {
                maybeSingle: async () => ({
                  data: { company_id: '5a106e2d-0000-4000-8000-000000000001' },
                  error: null,
                }),
              };
            },
          };
        },
      }),
    }, {
      company_id: '5a106e2d-0000-4000-8000-000000000001',
      smtp_host: 'smtp.resend.com',
      from_email: 'a@probe.test',
    }, SECRET);
    expect(upserts).toEqual([{
      company_id: '5a106e2d-0000-4000-8000-000000000001',
      smtp_host: 'smtp.resend.com',
      from_email: 'a@probe.test',
    }]);
    expect(upserts[0]).not.toHaveProperty('smtp_pass');
    expect(rpcs).toEqual([{ fn: EMAIL_SMTP_SET_PASS_RPC, args: { p_pass: SECRET } }]);
    expect(saved).toEqual({ company_id: '5a106e2d-0000-4000-8000-000000000001' });
  });

  it('keeps the SMTP secret out of product source', () => {
    const hits = walk(join(process.cwd(), 'src'))
      .filter((path) => readFileSync(path, 'utf8').includes('smtp_pass'))
      .map((path) => path.replace(`${process.cwd()}/`, ''));
    expect(hits).toEqual([]);
  });
});
