import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTRACT_VISIT_AUTO_FIRE_PATH, selectDueContractVisits } from './contractVisitReminder';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('Perth contract visit auto-fire rides job-reminder due=contract', () => {
  const hop = src('supabase/migrations/20260823130000_065_contract_visit_reminder_autofire.sql');
  const edge = src('supabase/functions/job-reminder/index.ts');

  it('same Perth invoke posts due=contract — no new cron stack or table', () => {
    expect(hop).toContain('CREATE OR REPLACE FUNCTION public.invoke_job_client_reminders()');
    expect(hop).toContain('{"due":"tomorrow","source":"cron"}');
    expect(hop).toContain('{"due":"today","source":"cron"}');
    expect(hop).toContain('{"due":"contract","source":"cron"}');
    expect(hop).toContain('{"due":"overdue","source":"cron"}');
    expect(hop).toContain('/functions/v1/job-reminder');
    expect(hop).toContain('net.http_post');
    expect(hop).not.toContain('CREATE TABLE');
    expect(hop).not.toContain('cron.schedule');
    expect(hop).not.toContain('cron.unschedule');
    expect(hop).not.toContain('job-client-reminder-perth-evening');
    expect(hop).not.toContain('send-contract');
    expect(edge).toContain('due === "contract"');
    expect(edge).toContain('mode: "auto"');
    expect(edge).toContain('.eq("next_service_date", today)');
    expect(edge).toContain('deliverContractVisitSend');
    expect(CONTRACT_VISIT_AUTO_FIRE_PATH.join(' ')).toMatch(/due=contract/);
    expect(CONTRACT_VISIT_AUTO_FIRE_PATH.join(' ')).toMatch(/invoke_job_client_reminders/);
    expect(CONTRACT_VISIT_AUTO_FIRE_PATH.join(' ')).not.toMatch(/send-contract/);
  });

  it('auto-fire is today only and does not create jobs', () => {
    const contractStart = edge.indexOf('if (due === "contract")');
    const contractHop = edge.slice(contractStart, edge.indexOf('if (due === "overdue")'));
    expect(contractHop).toContain('mode: "auto"');
    expect(contractHop).toContain('from("service_contracts")');
    expect(contractHop).toContain('deliverContractVisitSend');
    expect(contractHop).not.toContain('from("jobs")');
    expect(contractHop).not.toContain('createContractServiceJob');
    expect(contractHop).not.toContain('cron.schedule');
  });
});

describe('selectDueContractVisits', () => {
  const now = new Date('2026-08-23T08:00:00.000Z');
  const smtp = {
    smtp_host: 'smtp.resend.com',
    smtp_pass: 're_test',
    from_name: 'BTS Electrical',
    from_email: 'office@btselectrical.com.au',
  };
  const row = {
    id: 'con-1',
    company_id: 'co-1',
    client_id: 'c1',
    title: 'Annual maintenance',
    description: null,
    contract_number: 'CON-001',
    status: 'active',
    end_date: null,
    service_frequency: 'monthly',
    next_service_date: '2026-08-23',
    service_reminder_sent_at: null,
    service_reminder_sent_for_date: null,
  };
  const client = {
    id: 'c1',
    name: 'Acme',
    email: 'site@acme.com.au',
    phone: '0412 345 678',
  };

  it('picks Perth-today active visits with a client email', () => {
    const pick = selectDueContractVisits([row], [client], smtp, 'co-1', now);
    expect(pick.selected).toHaveLength(1);
    expect(pick.selected[0].to).toBe('site@acme.com.au');
  });

  it('misses already sent and no email; skips other companies', () => {
    const sent = selectDueContractVisits([{
      ...row,
      service_reminder_sent_at: '2026-08-23T00:00:00.000Z',
      service_reminder_sent_for_date: '2026-08-23',
    }], [client], smtp, 'co-1', now);
    expect(sent.selected).toHaveLength(0);
    expect(sent.missed[0].blocker).toBe('already_sent');

    const noEmail = selectDueContractVisits([row], [{ ...client, email: '' }], smtp, 'co-1', now);
    expect(noEmail.selected).toHaveLength(0);
    expect(noEmail.missed[0].blocker).toBe('no_email');

    const otherCo = selectDueContractVisits([row], [client], smtp, 'co-other', now);
    expect(otherCo.selected).toHaveLength(0);
    expect(otherCo.missed).toHaveLength(0);
  });
});
