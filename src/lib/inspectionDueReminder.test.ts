import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TemplateSchema } from '../types/template';
import {
  alreadyRemindedForDueDate,
  applyInspectionDueScope,
  belongsToCompany,
  buildInspectionDueEmail,
  buildInspectionDueSms,
  decideInspectionDueSend,
  dueDatesFromCustomFields,
  dueDatesFromDateQuestions,
  dueDatesFromMetaKeys,
  dueLabelMatches,
  emailSettingsReady,
  INSPECTION_DUE_AUTO_FIRE_PATH,
  INSPECTION_DUE_COLUMNS,
  inspectionDueEligibility,
  inspectionDueHref,
  inspectionDueJobsQuery,
  inspectionDueOnToday,
  inspectionDueSuccessPatch,
  inspectionDueCompanyFilter,
  isExistingInspectionDueSurface,
  isInspectionDueQueryScoped,
  isOpenInspectionStatus,
  missInspectionDueMessage,
  perthTodaySqlDate,
  prefillReminderTo,
  resolveInspectionClientId,
  resolveInspectionCompanyId,
  resolveInspectionDueCaller,
  resolveInspectionDueDate,
  selectAutoFireInspections,
  selectDueInspections,
  shouldRecordInspectionDueSent,
  todayInspectionDueQuery,
  todayYmd,
  withInspectionDueNext,
  wouldScanUnscopedInspections,
  type DueInspection,
  type DueInspectionJob,
} from './inspectionDueReminder';
import {
  AUTO_FIRE_CLICK_PATH,
  COMPANY_TIME_ZONE,
  VAN_TIME_ZONE,
  decideSmsBeside,
  missSmsMessage,
  prefillSmsTo,
  shouldRecordReminderSent,
  type ReminderClient,
  type ReminderEmailSettings,
} from './jobReminder';

/** 18:00 Friday 21 Aug 2026 in Australia/Brisbane (08:00 UTC). Same calendar day in Perth. */
const now = new Date('2026-08-21T08:00:00.000Z');
const today = '2026-08-21';
const tomorrow = '2026-08-22';
/** 01:00 Saturday 22 Aug Brisbane. Perth is still Friday 21 Aug 23:00. */
const brisbaneRolled = new Date('2026-08-21T15:00:00.000Z');

const smtp: ReminderEmailSettings = {
  smtp_host: 'smtp.resend.com',
  smtp_pass: 're_test',
  from_name: 'BTS Electrical',
  from_email: 'jobs@bts.example',
};

const client: ReminderClient = {
  id: 'c1',
  company_id: 'co-1',
  name: 'Acme Plants',
  contact_person: 'Sam',
  email: 'sam@acme.example',
  phone: '0832110000',
};

const schemaWithNextTest: TemplateSchema = {
  meta: {
    requiresSiteName: true,
    requiresSiteAddress: true,
    requiresClientName: false,
    requiresJobNumber: false,
    customFields: [
      { id: 'nt', name: 'next_test', label: 'Next test date', type: 'date', required: false },
    ],
  },
  sections: [
    {
      id: 's1',
      title: 'RCD',
      isRepeating: true,
      questions: [
        { id: 'q-due', type: 'date', label: 'Next test due', required: false },
        { id: 'q-other', type: 'date', label: 'Installed', required: false },
      ],
    },
  ],
};

function job(over: Partial<DueInspectionJob> = {}): DueInspectionJob {
  return {
    id: 'job-1',
    company_id: 'co-1',
    client_id: 'c1',
    title: 'Switchboard test',
    status: 'scheduled',
    scheduled_date: today,
    start_time: '08:30:00',
    address: '12 Smith St, Suburb NSW 2000',
    job_number: 42,
    ...over,
  };
}

function insp(over: Partial<DueInspection> = {}): DueInspection {
  return {
    id: 'insp-1',
    inspector_id: 'u1',
    client_id: 'c1',
    crm_job_id: 'job-1',
    status: 'draft',
    archived: false,
    meta: { siteName: 'Plant 2', siteAddress: '12 Smith St' },
    responses: {},
    template_snapshot: { name: 'RCD test', schema: schemaWithNextTest },
    ...over,
  };
}

describe('who is due — existing inspection/testing dates', () => {
  it('uses Australia/Brisbane today, not leftover Perth or the runtime calendar', () => {
    expect(VAN_TIME_ZONE).toBe('Australia/Brisbane');
    expect(COMPANY_TIME_ZONE).toBe('Australia/Perth');
    expect(todayYmd(now, VAN_TIME_ZONE)).toBe(today);
    expect(perthTodaySqlDate(now)).toBe(today);
  });

  it('after midnight Brisbane, leftover Perth is still yesterday — due-test uses Brisbane today', () => {
    expect(brisbaneRolled.toISOString().slice(0, 10)).toBe('2026-08-21');
    expect(todayYmd(brisbaneRolled, 'UTC')).toBe('2026-08-21');
    expect(todayYmd(brisbaneRolled, COMPANY_TIME_ZONE)).toBe('2026-08-21');
    expect(todayYmd(brisbaneRolled, VAN_TIME_ZONE)).toBe('2026-08-22');
    expect(perthTodaySqlDate(brisbaneRolled)).toBe('2026-08-22');
  });

  it('reads next-test from existing meta keys', () => {
    expect(dueDatesFromMetaKeys({ next_test_date: '2026-08-21' })).toEqual(['2026-08-21']);
    expect(dueDatesFromMetaKeys({ dueDate: '2026-09-01', nextTest: '2026-08-21' })).toEqual([
      '2026-08-21',
      '2026-09-01',
    ]);
    expect(dueDatesFromMetaKeys({ siteName: 'Plant' })).toEqual([]);
  });

  it('reads next-test from template custom date fields by label', () => {
    expect(dueDatesFromCustomFields(schemaWithNextTest, { custom_nt: '2026-08-21' })).toEqual(['2026-08-21']);
    expect(dueDatesFromCustomFields(schemaWithNextTest, { custom_nt: 'not-a-date' })).toEqual([]);
    expect(dueLabelMatches('Next test date')).toBe(true);
    expect(dueLabelMatches('Installed')).toBe(false);
  });

  it('reads next-test from date questions, including repeating blocks, and ignores other dates', () => {
    expect(dueDatesFromDateQuestions(schemaWithNextTest, {
      'q-due__a': '2026-09-01',
      'q-due__b': '2026-08-21',
      'q-other__a': '2020-01-01',
    })).toEqual(['2026-08-21', '2026-09-01']);
  });

  it('prefers the earliest explicit next-test date over the linked job date', () => {
    const row = insp({
      meta: { next_test_date: '2026-09-01', custom_nt: '2026-08-21' },
    });
    expect(resolveInspectionDueDate(row, job({ scheduled_date: '2026-07-01' }))).toBe('2026-08-21');
  });

  it('open inspections fall back to the linked job scheduled_date', () => {
    expect(resolveInspectionDueDate(insp(), job({ scheduled_date: today }))).toBe(today);
    expect(resolveInspectionDueDate(insp({ crm_job_id: null }), null)).toBeNull();
    expect(isOpenInspectionStatus('draft')).toBe(true);
    expect(isOpenInspectionStatus('completed')).toBe(false);
    expect(isOpenInspectionStatus('issued')).toBe(false);
    expect(isOpenInspectionStatus('sent')).toBe(false);
  });

  it('completed inspections do not invent a due date from the last job date', () => {
    expect(resolveInspectionDueDate(
      insp({ status: 'completed' }),
      job({ scheduled_date: today }),
    )).toBeNull();
    expect(resolveInspectionDueDate(
      insp({ status: 'issued', meta: { nextTestDate: '2026-08-21' } }),
      job({ scheduled_date: '2020-01-01' }),
    )).toBe('2026-08-21');
  });

  it('does not invent an interval from completed_at', () => {
    expect(resolveInspectionDueDate(insp({
      status: 'completed',
      completed_at: '2025-08-21T00:00:00.000Z',
    }), job())).toBeNull();
  });
});

describe('who gets mailed', () => {
  it('selects today due inspections that have a client email, scoped to the company', () => {
    const rows = [
      insp(),
      insp({ id: 'insp-other-co', crm_job_id: 'job-other' }),
      insp({ id: 'insp-tomorrow', crm_job_id: 'job-tom' }),
      insp({ id: 'insp-no-mail', client_id: 'c-empty' }),
      insp({ id: 'insp-archived', archived: true }),
      insp({ id: 'insp-2', client_id: 'c1' }),
    ];
    const jobs = [
      job(),
      job({ id: 'job-other', company_id: 'co-2' }),
      job({ id: 'job-tom', scheduled_date: tomorrow }),
    ];
    const clients = new Map<string, ReminderClient>([
      ['c1', client],
      ['c-empty', { id: 'c-empty', email: null, company_id: 'co-1' }],
    ]);
    const pick = selectDueInspections(rows, jobs, clients, smtp, 'co-1', now);
    expect(pick.selected.map(s => s.inspection.id).sort()).toEqual(['insp-1', 'insp-2']);
    expect(pick.selected.every(s => s.to === 'sam@acme.example')).toBe(true);
    expect(pick.missed.map(m => m.inspection.id).sort()).toEqual(['insp-archived', 'insp-no-mail']);
    expect(pick.missed.find(m => m.inspection.id === 'insp-no-mail')?.reason).toBe('no_email');
  });

  it('resolves client from the job when the inspection has no client_id', () => {
    expect(resolveInspectionClientId(insp({ client_id: null }), job())).toBe('c1');
    expect(resolveInspectionCompanyId(insp({ client_id: null }), job(), null)).toBe('co-1');
  });

  it('does not walk other companies even when handed a mixed ledger', () => {
    const rows: DueInspection[] = [];
    for (let i = 0; i < 4000; i++) {
      rows.push(insp({
        id: `other-${i}`,
        crm_job_id: `job-other-${i}`,
        client_id: 'c-other',
      }));
    }
    rows.push(insp({ id: 'ours-a' }), insp({ id: 'ours-b' }));
    const jobs: DueInspectionJob[] = [
      job(),
    ];
    for (let i = 0; i < 4000; i++) {
      jobs.push(job({ id: `job-other-${i}`, company_id: 'co-other', client_id: 'c-other' }));
    }
    const started = performance.now();
    const pick = selectDueInspections(
      rows,
      jobs,
      [client, { id: 'c-other', email: 'x@other.example', company_id: 'co-other' }],
      smtp,
      'co-1',
      now,
    );
    const elapsed = performance.now() - started;
    expect(pick.selected.map(s => s.inspection.id).sort()).toEqual(['ours-a', 'ours-b']);
    expect(elapsed).toBeLessThan(80);
  });

  it('belongsToCompany uses job, then client, then inspector profile', () => {
    expect(belongsToCompany(insp(), job(), client, 'co-1')).toBe(true);
    expect(belongsToCompany(insp(), job({ company_id: 'co-2' }), client, 'co-1')).toBe(false);
    expect(belongsToCompany(
      insp({ crm_job_id: null, client_id: null, inspector_id: 'u1' }),
      null,
      null,
      'co-1',
      new Map([['u1', 'co-1']]),
    )).toBe(true);
  });
});

describe('honest misses — no send', () => {
  it('does not send without a client email', () => {
    const gate = inspectionDueEligibility({
      inspection: insp(), job: job(), client: { id: 'c1', email: null }, settings: smtp, companyId: 'co-1', now,
    });
    expect(gate).toMatchObject({ ok: false, reason: 'no_email' });
    expect(gate.ok === false && gate.message).toBe(missInspectionDueMessage('no_email'));
  });

  it('does not send without a due date', () => {
    const gate = inspectionDueEligibility({
      inspection: insp({ status: 'completed', meta: {}, responses: {} }),
      job: job(),
      client,
      settings: smtp,
      companyId: 'co-1',
      now,
    });
    expect(gate).toMatchObject({ ok: false, reason: 'no_due_date' });
    expect(missInspectionDueMessage('no_due_date')).toMatch(/no due date/i);
  });

  it('does not send when the inspection is not due yet', () => {
    const gate = inspectionDueEligibility({
      inspection: insp({ meta: { next_test_date: '2026-08-24' } }),
      job: job(),
      client,
      settings: smtp,
      companyId: 'co-1',
      now,
    });
    expect(gate).toMatchObject({ ok: false, reason: 'not_due' });
  });

  it('manual override may send overdue; auto-fire does not', () => {
    const overdue = insp({ meta: { next_test_date: '2026-08-01' } });
    expect(inspectionDueEligibility({
      inspection: overdue, job: job(), client, settings: smtp, companyId: 'co-1', now, mode: 'manual',
    }).ok).toBe(true);
    expect(inspectionDueEligibility({
      inspection: overdue, job: job(), client, settings: smtp, companyId: 'co-1', now, mode: 'auto',
    })).toMatchObject({ reason: 'not_due' });
  });

  it('does not send when SMTP / Resend is missing', () => {
    expect(emailSettingsReady(null)).toBe(false);
    const gate = inspectionDueEligibility({
      inspection: insp(), job: job(), client, settings: null, companyId: 'co-1', now,
    });
    expect(gate).toMatchObject({ ok: false, reason: 'no_smtp' });
  });

  it('does not send for another company or an archived inspection', () => {
    expect(inspectionDueEligibility({
      inspection: insp(), job: job({ company_id: 'co-2' }), client, settings: smtp, companyId: 'co-1', now,
    })).toMatchObject({ reason: 'wrong_company' });
    expect(inspectionDueEligibility({
      inspection: insp({ archived: true }), job: job(), client, settings: smtp, companyId: 'co-1', now,
    })).toMatchObject({ reason: 'archived' });
  });

  it('records sent only on success', () => {
    expect(shouldRecordInspectionDueSent(false)).toBe(false);
    expect(shouldRecordInspectionDueSent(true)).toBe(true);
    const sentAt = new Date('2026-08-21T09:00:00.000Z');
    expect(inspectionDueSuccessPatch(today, sentAt)).toEqual({
      due_reminder_sent_at: '2026-08-21T09:00:00.000Z',
      due_reminder_sent_for_date: today,
    });
  });
});

describe('auto-fire (cron, not the tray)', () => {
  it('fires on the same Perth cron as the 24h job ping — no new module, no tray click', () => {
    expect(INSPECTION_DUE_AUTO_FIRE_PATH[0]).toBe(AUTO_FIRE_CLICK_PATH[0]);
    expect(INSPECTION_DUE_AUTO_FIRE_PATH[1]).toBe(AUTO_FIRE_CLICK_PATH[1]);
    expect(INSPECTION_DUE_AUTO_FIRE_PATH[0]).toMatch(/job-client-reminder-perth-morning/);
    expect(INSPECTION_DUE_AUTO_FIRE_PATH[1]).toMatch(/job-client-reminder-perth-afternoon/);
    expect(INSPECTION_DUE_AUTO_FIRE_PATH.join(' → ')).toMatch(/invoke_job_client_reminders/);
    expect(INSPECTION_DUE_AUTO_FIRE_PATH.join(' ')).toMatch(/due=today/);
    expect(INSPECTION_DUE_AUTO_FIRE_PATH.join(' ')).toMatch(/functions\/v1\/job-reminder/);
    expect(INSPECTION_DUE_AUTO_FIRE_PATH.join(' ')).toMatch(/api\.resend\.com/);
    expect(INSPECTION_DUE_AUTO_FIRE_PATH.join(' ')).toMatch(/api\.twilio\.com/);
    expect(INSPECTION_DUE_AUTO_FIRE_PATH.join(' ')).not.toMatch(/send_due_inspection_reminders/);
    expect(INSPECTION_DUE_AUTO_FIRE_PATH.join(' ')).not.toMatch(/send_due_job_client_reminders/);
    expect(INSPECTION_DUE_AUTO_FIRE_PATH.join(' ')).not.toMatch(/inspection-due-reminder-perth/);
    expect(INSPECTION_DUE_AUTO_FIRE_PATH.join(' ')).not.toMatch(/tray/i);
  });

  it('auto-selects Brisbane-today inspections with email when SMTP is ready', () => {
    const pick = selectAutoFireInspections(
      [insp(), insp({ id: 'later', meta: { next_test_date: tomorrow } })],
      [job()],
      [client],
      smtp,
      'co-1',
      now,
    );
    expect(pick.selected.map(s => s.inspection.id)).toEqual(['insp-1']);
    expect(pick.selected[0]?.to).toBe('sam@acme.example');
  });

  it('does not send without SMTP — and does not scan other companies', () => {
    const pick = selectAutoFireInspections(
      [insp(), insp({ id: 'other', crm_job_id: 'job-2' })],
      [job(), job({ id: 'job-2', company_id: 'co-2' })],
      [client],
      null,
      'co-1',
      now,
    );
    expect(pick.selected).toEqual([]);
    expect(pick.missed.every(m => m.reason === 'no_smtp')).toBe(true);
    expect(pick.missed.map(m => m.inspection.id)).toEqual(['insp-1']);
  });

  it('skips already-sent for this due date', () => {
    const pick = selectAutoFireInspections(
      [insp({
        due_reminder_sent_at: '2026-08-21T01:00:00.000Z',
        due_reminder_sent_for_date: today,
      })],
      [job()],
      [client],
      smtp,
      'co-1',
      now,
    );
    expect(pick.selected).toEqual([]);
    expect(pick.missed[0]?.reason).toBe('already_sent');
  });

  it('keeps the auto query scoped to company + Brisbane today', () => {
    const filter = inspectionDueCompanyFilter('co-1', now);
    expect(filter).toEqual({
      table: 'inspections',
      company_id: 'co-1',
      due_on: today,
      timeZone: 'Australia/Brisbane',
    });
    expect(inspectionDueCompanyFilter('co-1', brisbaneRolled)?.due_on).toBe('2026-08-22');
    expect(inspectionDueCompanyFilter('')).toBeNull();
    expect(wouldScanUnscopedInspections(todayInspectionDueQuery({ companyId: 'co-1', now }))).toBe(false);
  });
});

describe('do not double-mail', () => {
  it('skips an inspection already reminded for this due date', () => {
    expect(alreadyRemindedForDueDate({
      due_on: today,
      due_reminder_sent_at: '2026-08-21T01:00:00.000Z',
      due_reminder_sent_for_date: today,
    })).toBe(true);
    expect(alreadyRemindedForDueDate({
      due_on: today,
      due_reminder_sent_at: '2026-08-18T01:00:00.000Z',
      due_reminder_sent_for_date: '2026-08-18',
    }, today)).toBe(false);
  });

  it('may send again after the due date changes', () => {
    const moved = insp({
      meta: { next_test_date: today },
      due_reminder_sent_at: '2026-08-18T01:00:00.000Z',
      due_reminder_sent_for_date: '2026-08-18',
    });
    expect(alreadyRemindedForDueDate(moved, today)).toBe(false);
    expect(selectDueInspections([moved], [job()], [client], smtp, 'co-1', now).selected).toHaveLength(1);
  });
});

describe('override auth — auto-fire does not use this', () => {
  it('auto-fire is the job-reminder due=today hop, not SQL Resend', () => {
    expect(INSPECTION_DUE_AUTO_FIRE_PATH.join(' ')).toMatch(/due=today/);
    expect(INSPECTION_DUE_AUTO_FIRE_PATH.join(' ')).not.toMatch(/send_due_inspection_reminders/);
    expect(resolveInspectionDueCaller({
      hasUser: false,
      cronAuthorized: true,
      due: 'today',
    })).toEqual({ ok: true, caller: { kind: 'cron' } });
    expect(resolveInspectionDueCaller({
      hasUser: false,
      cronAuthorized: false,
    }).ok).toBe(false);
  });

  it('single-inspectionId override still requires a logged-in member', () => {
    expect(resolveInspectionDueCaller({
      hasUser: false,
      cronAuthorized: true,
      inspectionId: 'insp-1',
    })).toEqual({ ok: false, error: 'Unauthorized' });
    expect(resolveInspectionDueCaller({
      hasUser: true,
      userCompanyId: 'co-1',
      cronAuthorized: false,
      inspectionId: 'insp-1',
    })).toEqual({ ok: true, caller: { kind: 'user', companyId: 'co-1' } });
  });
});

describe('scoped query — not a ledger scan', () => {
  it('filters inspections by due_on today only', () => {
    const scope = todayInspectionDueQuery({ companyId: 'co-1', now });
    expect(scope).toEqual({
      table: 'inspections',
      columns: expect.stringContaining('due_on'),
      eq: { due_on: today },
      inFilters: {},
    });
    expect(scope?.columns).toBe(INSPECTION_DUE_COLUMNS);
    expect(isInspectionDueQueryScoped(scope)).toBe(true);
    expect(wouldScanUnscopedInspections(scope)).toBe(false);
  });

  it('refuses an unscoped inspections query', () => {
    expect(todayInspectionDueQuery({ companyId: '', now })).toBeNull();
    expect(wouldScanUnscopedInspections({
      table: 'inspections',
      columns: '*',
      eq: {},
      inFilters: {},
    })).toBe(true);
    expect(isInspectionDueQueryScoped({
      table: 'inspections',
      columns: '*',
      eq: { due_on: today },
      inFilters: {},
    })).toBe(false);
  });

  it('loads only the jobs on those inspections, still company-scoped', () => {
    expect(inspectionDueJobsQuery('co-1', [])).toBeNull();
    const scope = inspectionDueJobsQuery('co-1', ['job-1', 'job-1', null, 'job-2']);
    expect(scope).toEqual({
      table: 'jobs',
      columns: expect.stringContaining('scheduled_date'),
      eq: { company_id: 'co-1' },
      inFilters: { id: ['job-1', 'job-2'] },
    });
    expect(isInspectionDueQueryScoped(scope)).toBe(true);
  });

  it('applyInspectionDueScope emits due_on equality, not a bare select', () => {
    const calls: Array<{ op: string; column: string; value: unknown }> = [];
    const builder = {
      select(columns: string) {
        calls.push({ op: 'select', column: columns, value: null });
        return {
          eq(column: string, value: string) {
            calls.push({ op: 'eq', column, value });
            return this;
          },
          in(column: string, values: readonly string[]) {
            calls.push({ op: 'in', column, value: values });
            return this;
          },
          lte(column: string, value: string) {
            calls.push({ op: 'lte', column, value });
            return this;
          },
        };
      },
    };
    const scope = todayInspectionDueQuery({ companyId: 'co-1', now })!;
    applyInspectionDueScope(builder, scope);
    expect(calls).toContainEqual({ op: 'select', column: scope.columns, value: null });
    expect(calls).toContainEqual({ op: 'eq', column: 'due_on', value: today });
    expect(calls.some(c => c.op === 'select' && c.column === '*')).toBe(false);
  });
});

describe('existing inspection surface — no new route', () => {
  it('lands on the existing fill page hash', () => {
    expect(inspectionDueHref('insp-1')).toBe('/inspections/insp-1#inspection-due');
    expect(isExistingInspectionDueSurface(inspectionDueHref('insp-1'))).toBe(true);
    expect(isExistingInspectionDueSurface('/inspections/insp-1')).toBe(true);
    expect(isExistingInspectionDueSurface('/notify')).toBe(false);
    expect(isExistingInspectionDueSurface('/portal/due')).toBe(false);
  });

  it('sendable reminder prefills To and never invents an address', () => {
    const decision = decideInspectionDueSend({
      inspection: insp(),
      job: job(),
      client,
      settings: smtp,
      company: { name: 'BTS Electrical', email: 'jobs@bts.example', phone: '1300 111 222' },
      companyId: 'co-1',
      appUrl: 'https://bts-inspect.pages.dev',
      now,
    });
    expect(decision.send).toBe(true);
    if (!decision.send) return;
    expect(decision.to).toBe('sam@acme.example');
    expect(decision.subject).toMatch(/due today/);
    expect(decision.html).toMatch(/Test due today/);
    expect(decision.dueHref).toBe('/inspections/insp-1#inspection-due');
    expect(decision.html).not.toContain('undefined');
  });

  it('list Next keeps site/fill, then points due inspections at the fill tray', () => {
    expect(withInspectionDueNext(
      insp(),
      job(),
      { href: '/inspections/insp-1', label: 'Add site', actionable: true },
      now,
    ).label).toBe('Add site');
    const reminded = withInspectionDueNext(
      insp({ status: 'issued', meta: { next_test_date: today } }),
      job(),
      { href: '/inspections/insp-1/report', label: 'View PDF', actionable: true },
      now,
    );
    expect(reminded).toEqual({
      href: '/inspections/insp-1#inspection-due',
      label: 'Remind client',
      actionable: true,
    });
  });

  it('buildInspectionDueEmail never invents a To', () => {
    const email = buildInspectionDueEmail({
      inspection: insp(),
      job: job(),
      client,
      company: { name: 'BTS Electrical' },
      settings: smtp,
      appUrl: 'https://app.example',
      to: 'sam@acme.example',
      dueOn: today,
    });
    expect(email.to).toBe('sam@acme.example');
    expect(email.html).not.toContain('undefined');
    expect(email.text).toMatch(/RCD test/i);
    expect(prefillReminderTo(client)).toBe('sam@acme.example');
  });

  it('SMS rides the same due send — phone from the client, email sent-at unchanged', () => {
    expect(prefillSmsTo(client.phone)).toBe('+61832110000');
    expect(decideSmsBeside({ phone: null }).send).toBe(false);
    expect(missSmsMessage('no_phone')).toMatch(/no phone/i);
    const body = buildInspectionDueSms({
      inspection: insp(),
      job: job(),
      company: { name: 'BTS Electrical', phone: '1300 111 222' },
      dueOn: today,
    });
    expect(body).toMatch(/RCD test/i);
    expect(body).toMatch(/due today/);
    expect(body).toMatch(/12 Smith St/);
    expect(body).not.toMatch(/portal/i);
    expect(shouldRecordReminderSent(true)).toBe(true);
    expect(shouldRecordInspectionDueSent(true)).toBe(true);
    expect(shouldRecordInspectionDueSent(false)).toBe(false);
    const noPhone = decideInspectionDueSend({
      inspection: insp(),
      job: job(),
      client: { ...client, phone: null },
      settings: smtp,
      company: { name: 'BTS Electrical' },
      companyId: 'co-1',
      appUrl: 'https://bts-inspect.pages.dev',
      now,
    });
    expect(noPhone.send).toBe(true);
  });

  it('inspectionDueOnToday follows Brisbane, not leftover Perth or UTC', () => {
    expect(inspectionDueOnToday(insp(), job(), now)).toBe(true);
    expect(inspectionDueOnToday(insp({ meta: { next_test_date: tomorrow } }), job(), now)).toBe(false);
    expect(inspectionDueOnToday(
      insp({ meta: { next_test_date: tomorrow } }),
      job({ scheduled_date: tomorrow }),
      brisbaneRolled,
    )).toBe(true);
    expect(inspectionDueOnToday(
      insp({ meta: { next_test_date: tomorrow } }),
      job({ scheduled_date: tomorrow }),
      now,
    )).toBe(false);
  });
});

describe('Perth inspection auto-fire rides job-reminder due=today', () => {
  const cron = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260821200000_062_job_reminder_edge_autofire.sql'),
    'utf8',
  );
  const edge = readFileSync(
    resolve(process.cwd(), 'supabase/functions/job-reminder/index.ts'),
    'utf8',
  );

  it('same Perth cron invokes due=today — no new cron stack', () => {
    expect(cron).toContain('{"due":"today","source":"cron"}');
    expect(cron).toContain("SELECT public.invoke_job_client_reminders()");
    expect(cron).not.toMatch(/SELECT public\.send_due_inspection_reminders\(\)/);
    expect(cron).not.toContain('CREATE TABLE');
    expect(edge).toContain('due === "today"');
    expect(edge).not.toContain('send_due_inspection_reminders');
    expect(edge).toContain('due_reminder_sent_at');
    expect(edge).toContain('api.twilio.com');
  });

  it('due=today uses Australia/Brisbane, not leftover Perth', () => {
    const dueStart = edge.indexOf('if (due === "today")');
    const dueEnd = edge.indexOf('if (due === "contract")');
    const dueBlock = edge.slice(dueStart, dueEnd);
    expect(edge).toContain('VAN_TZ = "Australia/Brisbane"');
    expect(dueBlock).toContain('vanTodayYmd');
    expect(dueBlock).not.toContain('todayYmd()');
    expect(INSPECTION_DUE_AUTO_FIRE_PATH.join(' ')).toMatch(/Australia\/Brisbane/);
    expect(INSPECTION_DUE_AUTO_FIRE_PATH.join(' ')).toMatch(/van_today/);
    expect(INSPECTION_DUE_AUTO_FIRE_PATH.join(' ')).not.toMatch(/perth_today/);
  });

  it('retires the 060 SQL-only Resend autofire', () => {
    const retired = cron.slice(
      cron.indexOf('CREATE OR REPLACE FUNCTION public.send_due_inspection_reminders('),
      cron.indexOf('CREATE OR REPLACE FUNCTION public.invoke_job_client_reminders()'),
    );
    expect(retired).toMatch(/Retired/);
    expect(retired).not.toContain('api.resend.com');
    expect(retired).not.toContain('http((');
  });

  it('SMS miss does not flip due_reminder_sent_at — sent follows email 2xx only', () => {
    const deliverStart = edge.indexOf('async function deliverInspectionDue');
    const deliver = edge.slice(deliverStart, edge.indexOf('function invoiceSmsBody'));
    const emailFail = deliver.indexOf('if (!res.ok)');
    const statusWrite = deliver.indexOf('due_reminder_sent_at: sentAt');
    expect(emailFail).toBeGreaterThan(-1);
    expect(statusWrite).toBeGreaterThan(emailFail);
    const statusBlock = deliver.slice(statusWrite, statusWrite + 280);
    expect(statusBlock).toContain('due_reminder_sent_for_date');
    expect(statusBlock).not.toContain('sms.sent');
  });
});
