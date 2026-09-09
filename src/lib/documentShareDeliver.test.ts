import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUDIT_SHARE_PORTAL_TOKEN,
  auditSharePortalUrl,
  clientPortalTokenInsert,
} from './documentShareDeliver';
import { clientPortalPublicUrl } from './sendQuote';
import { GRAFTER_PUBLIC_ORIGIN } from './publicSeo';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('documentShareDeliver', () => {
  it('reuses the existing /p token table — no new module and no SMTP', () => {
    const deliver = src('src/lib/documentShareDeliver.ts');
    const dialog = src('src/components/invoicing/QuoteSendDialog.tsx');
    expect(deliver).toContain("from('client_portal_tokens')");
    expect(deliver).toContain('pickActiveClientPortalToken');
    expect(deliver).toContain('clientPortalTokenInsert');
    expect(deliver).toContain("status: next");
    expect(deliver).toContain(".eq('status', 'draft')");
    expect(deliver).not.toContain('Relovi');
    expect(deliver).not.toContain('Littleloop');
    expect(deliver).not.toContain('RESEND_API_KEY');
    expect(deliver).not.toContain('smtp_pass');
    expect(deliver).not.toContain('COMPANY_EMAIL_SETTINGS_HREF');
    expect(dialog).not.toContain('send-quote');
    expect(deliver).toContain('isDevFieldAuditAuth');
    expect(deliver).toContain('auditSharePortalUrl');
  });

  it('builds a client-usable portal URL for DEV field-audit without SMTP', () => {
    expect(auditSharePortalUrl('https://grafter.com.au')).toBe(
      `${GRAFTER_PUBLIC_ORIGIN}/p?t=${AUDIT_SHARE_PORTAL_TOKEN}`,
    );
    expect(auditSharePortalUrl('http://127.0.0.1:5173')).toBe(
      `http://127.0.0.1:5173/p?t=${AUDIT_SHARE_PORTAL_TOKEN}`,
    );
    expect(AUDIT_SHARE_PORTAL_TOKEN).toMatch(/^[a-f0-9]{64}$/);
  });

  it('builds a year-long token the same way the office portal page does', () => {
    const row = clientPortalTokenInsert({
      companyId: 'co1',
      clientId: 'c1',
      now: new Date('2026-09-09T00:00:00.000Z'),
    });
    expect(row.company_id).toBe('co1');
    expect(row.client_id).toBe('c1');
    expect(row.token).toMatch(/^[a-f0-9]{64}$/);
    expect(row.expires_at).toBe('2027-09-09T00:00:00.000Z');
    expect(clientPortalPublicUrl('https://grafter.com.au', row.token)).toBe(
      `https://grafter.com.au/p?t=${row.token}`,
    );
  });
});
