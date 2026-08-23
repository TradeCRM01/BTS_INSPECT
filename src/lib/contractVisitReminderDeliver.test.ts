import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTRACT_VISIT_REMINDER_PIPE } from './contractVisitReminder';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('contract visit reminder deliver path', () => {
  it('invokes job-reminder, not a new send-contract function', () => {
    const deliver = src('src/lib/contractVisitReminderDeliver.ts');
    const dialog = src('src/components/contracts/ContractVisitReminderDialog.tsx');
    const page = src('src/pages/ContractsPage.tsx');
    const edge = src('supabase/functions/job-reminder/index.ts');

    expect(deliver).toContain("invoke('job-reminder'");
    expect(deliver).toContain('contractId');
    expect(deliver).not.toContain('send-contract');
    expect(deliver).not.toContain("invoke('send-contract'");
    expect(deliver).not.toContain('mailto:');
    expect(dialog).toContain('ContractVisitReminderDialog');
    expect(dialog).toContain('hub-invoice-send');
    expect(dialog).toContain('Send reminder');
    expect(dialog).toContain('SMS To');
    expect(dialog).toContain('hub-invoice-send-tos');
    expect(dialog).toContain('saveJobClientEmail');
    expect(dialog).toContain('saveJobClientPhone');
    expect(dialog).toContain('attachContractClient');
    expect(dialog).not.toContain('send-contract');
    expect(dialog).not.toContain('Relovi');
    expect(dialog).not.toContain('Littleloop');
    expect(dialog).not.toContain('Manrope');
    expect(page).toContain('ContractVisitReminderDialog');
    expect(page).toContain('Remind');
    expect(page).not.toContain('send-contract');
    expect(page).not.toContain('mailto:?subject=');
    expect(page).not.toContain('Relovi');
    expect(page).not.toContain('Littleloop');
    expect(page).not.toContain('Manrope');
    expect(page).not.toContain('report_theme');
    expect(edge).toContain('contractId');
    expect(edge).toContain('from("service_contracts")');
    expect(edge).toContain('api.resend.com/emails');
    expect(edge).toContain('email_settings');
    expect(edge).toContain('service_reminder_sent_at');
    expect(edge).toContain('api.twilio.com');
    expect(edge).not.toContain('send-contract');
    expect(CONTRACT_VISIT_REMINDER_PIPE.join(' ')).toMatch(/job-reminder/);
    expect(CONTRACT_VISIT_REMINDER_PIPE.join(' ')).toMatch(/contractId/);
  });

  it('SMS miss does not stamp sent — sent follows email 2xx only', () => {
    const edge = src('supabase/functions/job-reminder/index.ts');
    expect(edge).toMatch(/sendTwilioSms/);
    const deliverStart = edge.indexOf('async function deliverContractVisitSend');
    const deliverFn = edge.slice(deliverStart, edge.indexOf('function bearerToken'));
    const emailFail = deliverFn.indexOf('if (!res.ok)');
    const statusWrite = deliverFn.indexOf('service_reminder_sent_at');
    expect(emailFail).toBeGreaterThan(-1);
    expect(statusWrite).toBeGreaterThan(emailFail);
    const statusBlock = deliverFn.slice(statusWrite, statusWrite + 280);
    expect(statusBlock).toContain('service_reminder_sent_at');
    expect(statusBlock).not.toContain('sms.sent');
  });
});
