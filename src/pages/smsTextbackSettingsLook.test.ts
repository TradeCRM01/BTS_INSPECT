import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('sms text-back LOOK — existing company settings section', () => {
  it('mounts on/off, name, preview, and read-only status on Missed-call text-back', () => {
    const page = src('src/pages/CompanySettingsPage.tsx');
    const lib = src('src/lib/smsTextbackSettings.ts');
    const auth = src('src/lib/devFieldAuditAuth.ts');
    const sql = src('supabase/migrations/20261016000000_sms_textback_admin_write.sql');
    expect(page).toContain('Missed-call text-back');
    expect(page).toContain('data-sms-textback="1"');
    expect(page).toContain('smsAckPreview');
    expect(page).toContain('smsAckPreviewBlocked');
    expect(page).toContain('smsDisplayNameCount');
    expect(page).toContain('smsDisplayNameCountOver');
    expect(page).toContain('is-over');
    expect(page).toContain('.hub-company-row-meta.is-over');
    expect(page).toContain('color: var(--co-look-fail)');
    expect(page).toContain('--co-look-fail: #B42318');
    expect(page).toContain('smsTextbackEnableError');
    expect(page).toContain('saveSmsTextbackSettings');
    expect(page).toContain('shouldQueryLiveSmsTextback');
    expect(page).toContain('<Switch');
    expect(page).toContain('Twilio mapping');
    expect(page).toContain('Saving…');
    expect(page).not.toContain("savingSmsTextback ? 'Saving...'");
    expect(page).toContain("import.meta.env.DEV ? searchParams.get('look') : null");
    expect(page).not.toContain('composer');
    expect(page).not.toContain('Ack template');
    expect(src('src/components/ui/Switch.tsx')).toContain('role="switch"');
    expect(src('src/components/ui/Switch.tsx')).toContain('aria-checked={checked}');
    expect(src('src/pages/AccountingSettingsPage.tsx')).toContain('<Switch');
    expect(src('src/index.css')).toContain('button.acct-switch');
    expect(lib).toContain('SMS_SETTINGS_LOOK');
    expect(lib).toContain('renderMissedCallAck');
    expect(lib).toContain('ENQUIRY_SURFACE_LIVE');
    expect(src('src/lib/missedCallEnquiry.ts')).toContain('ENQUIRY_SURFACE_LIVE = false');
    expect(auth).toContain("params.get('look') === 'sms-settings'");
    expect(auth).toContain("params.get('look') === 'sms-settings-invalid'");
    expect(sql).toContain('save_sms_textback_settings');
    expect(sql).toContain('sms_automation_settings_enabled_requires_name');
    expect(sql).toContain("v_role IS DISTINCT FROM 'admin'");
    expect(sql).toContain('ERRCODE = \'42501\'');
    const textbackAt = page.indexOf('data-sms-textback="1"');
    const mappingAt = page.indexOf('Twilio mapping', textbackAt);
    const ledeAt = page.indexOf('Map this company to its Twilio number', mappingAt);
    const textback = page.slice(textbackAt, mappingAt + 20);
    expect(page.indexOf('Missed-call text-back', textbackAt)).toBeGreaterThan(textbackAt);
    expect(page.indexOf('Missed-call text-back', textbackAt)).toBeLessThan(mappingAt);
    expect(ledeAt).toBeGreaterThan(mappingAt);
    expect(textback).not.toContain('Map this company');
    expect(textback).not.toContain('type="checkbox"');
    expect(textback).toContain('Twilio mapping');
    expect(textback).not.toMatch(/\+614(?!18893602)\d+/);
    expect(lib).not.toMatch(/\+614(?!18893602)\d+/);
    expect(sql).not.toMatch(/\+614(?!18893602)\d+/);
  });
});
