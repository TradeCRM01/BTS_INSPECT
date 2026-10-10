import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('sms reply templates LOOK — existing company settings section', () => {
  it('mounts Text replies on Missed-call text-back with live fit and reset', () => {
    const page = src('src/pages/CompanySettingsPage.tsx');
    const lib = src('src/lib/smsReplyTemplates.ts');
    const copy = src('src/lib/missedCallSmsCopy.ts');
    const sql = src('supabase/migrations/20261017000000_sms_reply_templates.sql');
    expect(page).toContain('Text replies');
    expect(page).toContain('data-sms-replies="1"');
    expect(page).toContain('smsReplyFitLabel');
    expect(page).toContain('Reset to default');
    expect(page).toContain('saveSmsReplyTemplates');
    expect(page).toContain('smsReplyFieldError');
    expect(page).toContain('focusSmsReplyField');
    expect(page).toContain('scrollIntoView');
    expect(page).toContain('data-sms-reply-error={kind}');
    expect(page).not.toContain('data-sms-reply-error>');
    expect(page).toContain('shouldQueryLiveSmsReplies');
    expect(page).toContain('!isAdmin && ENQUIRY_SURFACE_LIVE');
    expect(page).toContain('smsTextbackMemberStatus');
    expect(page).not.toContain('composer');
    expect(lib).toContain('Fits in 1 text');
    expect(lib).toContain('Too long for 1 text');
    expect(lib).toContain('Can\'t send this text');
    expect(page).toContain('SMS_REPLY_CANT_SEND');
    expect(page).toContain('is-refused');
    expect(page).toContain('#B42318');
    expect(lib).toContain('SMS_REPLY_FORBIDDEN');
    expect(lib).toContain('{Business}');
    expect(lib).toContain('Reply STOP to opt out');
    expect(lib).toContain('START to opt back in');
    expect(lib).toContain('No links or phone numbers');
    expect(lib).toContain('SMS_REPLY_STOP_END');
    expect(lib).toContain('ENQUIRY_SURFACE_LIVE');
    expect(copy).toContain('SMS_REPLY_FORBIDDEN');
    expect(src('src/lib/missedCallEnquiry.ts')).toContain('ENQUIRY_SURFACE_LIVE = false');
    expect(sql).toContain('ack_template');
    expect(sql).toContain('thanks_template');
    expect(sql).toContain('help_template');
    expect(sql).toContain('save_sms_reply_templates');
    expect(sql).toContain('sms_company_reply_body');
    expect(sql).toContain('sms_reply_has_forbidden_word');
    expect(sql).toContain("SET search_path = ''");
    expect(sql).toContain("ERRCODE = '42501'");
    expect(sql).toContain("sms_company_reply_body(v_call.organisation_id, 'ack'");
    expect(sql).toContain("sms_company_reply_body(v_organisation_id, 'help'");
    expect(sql).toContain("sms_company_reply_body(v_organisation_id, 'thanks'");
    expect(sql).not.toMatch(/\+614(?!18893602)\d+/);
    expect(lib).not.toMatch(/\+614(?!18893602)\d+/);
    const repliesAt = page.indexOf('data-sms-replies="1"');
    const mappingAt = page.indexOf('Twilio mapping', repliesAt);
    const replies = page.slice(repliesAt, mappingAt);
    expect(repliesAt).toBeGreaterThan(-1);
    expect(mappingAt).toBeGreaterThan(repliesAt);
    expect(replies).toContain('smsReplyFitLabel');
    expect(replies).not.toContain('GSM-7');
    expect(replies).not.toMatch(/[Ss]egment/);
  });
});
