import { describe, expect, it } from 'vitest';
import {
  alreadyRemindedForVisit,
  contractVisitByIdQuery,
  contractVisitDuePhrase,
  contractVisitLabel,
  contractVisitReminderSmsBody,
  contractVisitReminderSubject,
  contractVisitReminderSuccessPatch,
  decideContractVisitReminder,
  shouldRecordContractVisitReminderSent,
  wouldScanLedgerToRemindContract,
  type ContractVisitReminderBundle,
  type ContractVisitReminderContract,
} from './contractVisitReminder';

/** 16:00 Sunday 23 Aug 2026 in Australia/Perth (08:00 UTC). Today in Perth is 23 Aug. */
const now = new Date('2026-08-23T08:00:00.000Z');
const today = '2026-08-23';

const smtp = {
  smtp_host: 'smtp.resend.com',
  smtp_pass: 're_test',
  from_name: 'BTS Electrical',
  from_email: 'office@btselectrical.com.au',
};

const company = { name: 'BTS Electrical', phone: '1300 000 000', email: 'office@btselectrical.com.au' };

function contract(over: Partial<ContractVisitReminderContract> = {}): ContractVisitReminderContract {
  return {
    id: 'con-1',
    company_id: 'co-1',
    client_id: 'c1',
    title: 'Annual maintenance',
    description: 'Test and tag.',
    contract_number: 'CON-001',
    status: 'active',
    end_date: null,
    service_frequency: 'monthly',
    next_service_date: today,
    last_service_date: '2026-07-23',
    auto_generate_jobs: false,
    service_reminder_sent_at: null,
    service_reminder_sent_for_date: null,
    ...over,
  };
}

function bundle(over: Partial<ContractVisitReminderBundle> = {}): ContractVisitReminderBundle {
  return {
    contract: contract(),
    client: {
      id: 'c1',
      name: 'Acme Electrical',
      email: 'site@acme.com.au',
      phone: '0412 345 678',
      contact_person: 'Sam',
      address: '12 Smith St',
    },
    smtp,
    company,
    ...over,
  };
}

describe('decideContractVisitReminder', () => {
  it('sends to the client email for a visit due today', () => {
    const decision = decideContractVisitReminder({ bundle: bundle(), companyId: 'co-1', now, mode: 'manual' });
    expect(decision.ok).toBe(true);
    if (decision.ok) {
      expect(decision.to).toBe('site@acme.com.au');
      expect(decision.dueOn).toBe(today);
      expect(decision.subject).toContain('Annual maintenance');
      expect(decision.subject).toContain('due today');
      expect(decision.smsTo).toMatch(/^\+61/);
    }
  });

  it('allows overdue manual send and refuses a future visit', () => {
    const overdue = decideContractVisitReminder({
      bundle: bundle({ contract: contract({ next_service_date: '2026-08-20' }) }),
      companyId: 'co-1',
      now,
      mode: 'manual',
    });
    expect(overdue.ok).toBe(true);
    if (overdue.ok) expect(overdue.subject).toContain('overdue');

    const future = decideContractVisitReminder({
      bundle: bundle({ contract: contract({ next_service_date: '2026-08-24' }) }),
      companyId: 'co-1',
      now,
      mode: 'manual',
    });
    expect(future).toMatchObject({ ok: false, blocker: 'not_due' });
  });

  it('auto mode is today only and skips already sent', () => {
    const overdueAuto = decideContractVisitReminder({
      bundle: bundle({ contract: contract({ next_service_date: '2026-08-20' }) }),
      companyId: 'co-1',
      now,
      mode: 'auto',
    });
    expect(overdueAuto).toMatchObject({ ok: false, blocker: 'not_due' });

    const sent = decideContractVisitReminder({
      bundle: bundle({
        contract: contract({
          service_reminder_sent_at: '2026-08-23T00:00:00.000Z',
          service_reminder_sent_for_date: today,
        }),
      }),
      companyId: 'co-1',
      now,
      mode: 'auto',
    });
    expect(sent).toMatchObject({ ok: false, blocker: 'already_sent' });
  });

  it('refuses missing client, email, smtp, inactive, wrong company', () => {
    expect(decideContractVisitReminder({
      bundle: bundle({ contract: contract({ client_id: null }), client: null }),
      companyId: 'co-1',
      now,
    })).toMatchObject({ blocker: 'no_client' });
    expect(decideContractVisitReminder({
      bundle: bundle({ client: { id: 'c1', name: 'Acme', email: '', phone: null } }),
      companyId: 'co-1',
      now,
    })).toMatchObject({ blocker: 'no_email' });
    expect(decideContractVisitReminder({
      bundle: bundle({ smtp: { smtp_host: '', smtp_pass: '', from_name: '', from_email: '' } }),
      companyId: 'co-1',
      now,
    })).toMatchObject({ blocker: 'no_smtp' });
    expect(decideContractVisitReminder({
      bundle: bundle({ contract: contract({ status: 'expired' }) }),
      companyId: 'co-1',
      now,
    })).toMatchObject({ blocker: 'not_active' });
    expect(decideContractVisitReminder({
      bundle: bundle(),
      companyId: 'co-other',
      now,
    })).toMatchObject({ blocker: 'wrong_company' });
  });
});

describe('sent stamp follows email 2xx only', () => {
  it('does not treat already-sent as a stamp without sendOk', () => {
    expect(shouldRecordContractVisitReminderSent(false)).toBe(false);
    expect(shouldRecordContractVisitReminderSent(true)).toBe(true);
    const patch = contractVisitReminderSuccessPatch(today, new Date('2026-08-23T08:00:00.000Z'));
    expect(patch.service_reminder_sent_for_date).toBe(today);
    expect(alreadyRemindedForVisit({
      next_service_date: today,
      service_reminder_sent_at: patch.service_reminder_sent_at,
      service_reminder_sent_for_date: today,
    }, today)).toBe(true);
  });
});

describe('copy', () => {
  it('names the visit from title and contract number', () => {
    expect(contractVisitLabel(contract())).toBe('Annual maintenance (CON-001)');
    expect(contractVisitDuePhrase(today, now)).toBe('is due today');
    expect(contractVisitReminderSubject({ contract: contract(), dueOn: today, now })).toMatch(/due today/);
    expect(contractVisitReminderSmsBody({
      contract: contract(),
      company,
      dueOn: today,
      site: '12 Smith St',
      now,
    })).toMatch(/12 Smith St/);
  });
});

describe('load scope', () => {
  it('loads one contract by id + company', () => {
    const scope = contractVisitByIdQuery({ companyId: 'co-1', contractId: 'con-1' });
    expect(wouldScanLedgerToRemindContract(scope)).toBe(false);
    expect(scope?.eq).toEqual({ id: 'con-1', company_id: 'co-1' });
  });
});
