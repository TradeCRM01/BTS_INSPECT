import { describe, expect, it } from 'vitest';
import {
  alreadyRemindedForScheduledDate,
  applyReminderScope,
  AUTO_FIRE_CLICK_PATH,
  autoFireJobFilter,
  buildReminderEmail,
  clientRescheduleMailto,
  COMPANY_TIME_ZONE,
  dateOnly,
  decideReminderSend,
  emailSettingsReady,
  isCronAuthorized,
  isExistingScheduleSurface,
  isJobDueTomorrow,
  isReminderQueryScoped,
  jobRescheduleQueryHref,
  jobScheduleHref,
  jobScheduleUrl,
  missMessage,
  parseMailto,
  prefillReminderTo,
  reminderClientsQuery,
  reminderEligibility,
  reminderEmailSettingsQuery,
  perthTomorrowSqlDate,
  reminderSuccessPatch,
  resolveReminderCaller,
  selectAutoFireJobs,
  selectTomorrowReminderJobs,
  shouldRecordReminderSent,
  tomorrowReminderQuery,
  tomorrowYmd,
  withReminderNext,
  wouldScanUnscopedJobs,
  type ReminderClient,
  type ReminderEmailSettings,
  type ReminderJob,
} from './jobReminder';

/** 16:00 Friday 21 Aug 2026 in Australia/Perth (08:00 UTC). Tomorrow in Perth is 22 Aug. */
const now = new Date('2026-08-21T08:00:00.000Z');
const tomorrow = '2026-08-22';

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

function job(over: Partial<ReminderJob> = {}): ReminderJob {
  return {
    id: 'job-1',
    company_id: 'co-1',
    client_id: 'c1',
    title: 'Switchboard test',
    status: 'scheduled',
    scheduled_date: tomorrow,
    start_time: '08:30:00',
    address: '12 Smith St, Suburb NSW 2000',
    job_number: 42,
    ...over,
  };
}

describe('tomorrow window', () => {
  it('uses Australia/Perth, not the runtime calendar', () => {
    expect(COMPANY_TIME_ZONE).toBe('Australia/Perth');
    expect(tomorrowYmd(now)).toBe('2026-08-22');
    expect(dateOnly('2026-08-22T00:00:00.000Z')).toBe('2026-08-22');
    expect(dateOnly('  ')).toBeNull();
    expect(dateOnly('not-a-date')).toBeNull();
  });

  it('at 4pm Perth, tomorrow is the Perth next day (not UTC)', () => {
    const fourPmPerth = new Date('2026-08-21T08:00:00.000Z');
    expect(tomorrowYmd(fourPmPerth)).toBe('2026-08-22');
    expect(isJobDueTomorrow(job({ scheduled_date: '2026-08-22' }), fourPmPerth)).toBe(true);
    expect(tomorrowReminderQuery({ companyId: 'co-1', now: fourPmPerth })?.eq.scheduled_date).toBe('2026-08-22');
  });

  it('after midnight Perth, UTC date is a day behind — still uses Perth tomorrow', () => {
    // 00:00 Sat 22 Aug Perth = 16:00 Fri 21 Aug UTC
    const midnightPerth = new Date('2026-08-21T16:00:00.000Z');
    expect(midnightPerth.toISOString().slice(0, 10)).toBe('2026-08-21');
    expect(tomorrowYmd(midnightPerth, 'UTC')).toBe('2026-08-22');
    expect(tomorrowYmd(midnightPerth)).toBe('2026-08-23');
    expect(isJobDueTomorrow(job({ scheduled_date: '2026-08-22' }), midnightPerth)).toBe(false);
    expect(isJobDueTomorrow(job({ scheduled_date: '2026-08-23' }), midnightPerth)).toBe(true);
    expect(tomorrowReminderQuery({ companyId: 'co-1', now: midnightPerth })?.eq.scheduled_date).toBe('2026-08-23');
  });

  it('before 8am Perth, UTC is still yesterday — does not mail UTC-tomorrow', () => {
    // 07:00 Fri 21 Aug Perth = 23:00 Thu 20 Aug UTC
    const morningPerth = new Date('2026-08-20T23:00:00.000Z');
    expect(morningPerth.toISOString().slice(0, 10)).toBe('2026-08-20');
    expect(tomorrowYmd(morningPerth, 'UTC')).toBe('2026-08-21');
    expect(tomorrowYmd(morningPerth)).toBe('2026-08-22');
    expect(selectTomorrowReminderJobs(
      [job({ scheduled_date: '2026-08-21' }), job({ id: 'due', scheduled_date: '2026-08-22' })],
      [client],
      'co-1',
      morningPerth,
    ).selected.map(s => s.job.id)).toEqual(['due']);
  });

  it('only open jobs booked tomorrow are due', () => {
    expect(isJobDueTomorrow(job(), now)).toBe(true);
    expect(isJobDueTomorrow(job({ scheduled_date: '2026-08-21' }), now)).toBe(false);
    expect(isJobDueTomorrow(job({ scheduled_date: '2026-08-23' }), now)).toBe(false);
    expect(isJobDueTomorrow(job({ scheduled_date: null }), now)).toBe(false);
    expect(isJobDueTomorrow(job({ status: 'completed' }), now)).toBe(false);
    expect(isJobDueTomorrow(job({ status: 'cancelled' }), now)).toBe(false);
    expect(isJobDueTomorrow(job({ status: 'in_progress' }), now)).toBe(true);
  });
});

describe('who gets mailed', () => {
  it('selects tomorrow jobs that have a client email, scoped to the company', () => {
    const rows = [
      job(),
      job({ id: 'job-other-co', company_id: 'co-2' }),
      job({ id: 'job-today', scheduled_date: '2026-08-21' }),
      job({ id: 'job-no-mail', client_id: 'c-empty' }),
      job({ id: 'job-closed', status: 'completed' }),
      job({ id: 'job-2', title: 'Meter', job_number: 43 }),
    ];
    const clients = new Map<string, ReminderClient>([
      ['c1', client],
      ['c-empty', { id: 'c-empty', email: null }],
    ]);
    const pick = selectTomorrowReminderJobs(rows, clients, 'co-1', now);
    expect(pick.selected.map(s => s.job.id).sort()).toEqual(['job-1', 'job-2']);
    expect(pick.selected.every(s => s.to === 'sam@acme.example')).toBe(true);
    expect(pick.missed.map(m => m.job.id).sort()).toEqual(['job-closed', 'job-no-mail']);
    expect(pick.missed.find(m => m.job.id === 'job-no-mail')?.reason).toBe('no_email');
  });

  it('prefills To from the client and refuses junk', () => {
    expect(prefillReminderTo(client)).toBe('sam@acme.example');
    expect(prefillReminderTo({ id: 'c', email: '  sam@acme.example  ' })).toBe('sam@acme.example');
    expect(prefillReminderTo({ id: 'c', email: 'no-at-sign' })).toBe('');
    expect(prefillReminderTo({ id: 'c', email: null })).toBe('');
    expect(prefillReminderTo(null)).toBe('');
  });

  it('does not walk other companies even when handed a mixed ledger', () => {
    const mixed: ReminderJob[] = [];
    for (let i = 0; i < 4000; i++) {
      mixed.push(job({
        id: `other-${i}`,
        company_id: 'co-other',
        scheduled_date: tomorrow,
      }));
    }
    mixed.push(job({ id: 'ours-a' }), job({ id: 'ours-b', job_number: 99 }));
    const started = performance.now();
    const pick = selectTomorrowReminderJobs(mixed, [client], 'co-1', now);
    const elapsed = performance.now() - started;
    expect(pick.selected.map(s => s.job.id).sort()).toEqual(['ours-a', 'ours-b']);
    expect(elapsed).toBeLessThan(80);
  });
});

describe('honest misses — no send', () => {
  const base = {
    companyId: 'co-1',
    company: { name: 'BTS Electrical', email: 'jobs@bts.example', phone: '1300 000 000' },
    appUrl: 'https://bts-inspect.pages.dev',
    now,
  };

  it('does not send without a client email', () => {
    const gate = reminderEligibility({
      job: job(), client: { id: 'c1', email: null }, settings: smtp, companyId: 'co-1', now,
    });
    expect(gate).toMatchObject({ ok: false, reason: 'no_email' });
    expect(gate.ok === false && gate.message).toBe(missMessage('no_email'));
    expect(decideReminderSend({ ...base, job: job(), client: { id: 'c1', email: '' }, settings: smtp }).send).toBe(false);
  });

  it('does not send without a scheduled date', () => {
    const gate = reminderEligibility({
      job: job({ scheduled_date: null }), client, settings: smtp, companyId: 'co-1', now,
    });
    expect(gate).toMatchObject({ ok: false, reason: 'no_scheduled_date' });
    expect(missMessage('no_scheduled_date')).toMatch(/no scheduled date/i);
  });

  it('does not send when the job is not tomorrow', () => {
    const gate = reminderEligibility({
      job: job({ scheduled_date: '2026-08-24' }), client, settings: smtp, companyId: 'co-1', now,
    });
    expect(gate).toMatchObject({ ok: false, reason: 'not_tomorrow' });
  });

  it('does not send when SMTP / Resend is missing', () => {
    expect(emailSettingsReady(null)).toBe(false);
    expect(emailSettingsReady({ smtp_host: 'smtp.mailgun.org', smtp_pass: 'x', from_email: 'a@b.c' })).toBe(false);
    expect(emailSettingsReady({ smtp_host: 'smtp.resend.com', smtp_pass: '', from_email: 'a@b.c' })).toBe(false);
    expect(emailSettingsReady(smtp)).toBe(true);
    const gate = reminderEligibility({
      job: job(), client, settings: null, companyId: 'co-1', now,
    });
    expect(gate).toMatchObject({ ok: false, reason: 'no_smtp' });
    expect(missMessage('no_smtp')).toBe('Email is not set up.');
  });

  it('does not send for another company or a closed job', () => {
    expect(reminderEligibility({
      job: job({ company_id: 'co-2' }), client, settings: smtp, companyId: 'co-1', now,
    }).ok).toBe(false);
    expect(reminderEligibility({
      job: job({ status: 'cancelled' }), client, settings: smtp, companyId: 'co-1', now,
    })).toMatchObject({ reason: 'closed' });
  });

  it('records sent only on success', () => {
    expect(shouldRecordReminderSent(false)).toBe(false);
    expect(shouldRecordReminderSent(true)).toBe(true);
    const sentAt = new Date('2026-08-21T09:00:00.000Z');
    expect(reminderSuccessPatch('2026-08-22', sentAt)).toEqual({
      client_reminder_sent_at: '2026-08-21T09:00:00.000Z',
      client_reminder_sent_for_date: '2026-08-22',
    });
  });
});

describe('auto-fire (cron, not the tray)', () => {
  it('documents the click path that actually mails without a user', () => {
    expect(AUTO_FIRE_CLICK_PATH[0]).toMatch(/pg_cron/);
    expect(AUTO_FIRE_CLICK_PATH.join(' → ')).toMatch(/send_due_job_client_reminders/);
    expect(AUTO_FIRE_CLICK_PATH.join(' ')).toMatch(/api\.resend\.com/);
    expect(AUTO_FIRE_CLICK_PATH.join(' ')).not.toMatch(/vault/i);
  });

  it('auto-selects tomorrow Perth jobs with email when SMTP is ready', () => {
    const pick = selectAutoFireJobs(
      [job(), job({ id: 'today', scheduled_date: '2026-08-21' })],
      [client],
      smtp,
      'co-1',
      now,
    );
    expect(perthTomorrowSqlDate(now)).toBe('2026-08-22');
    expect(pick.selected.map(s => s.job.id)).toEqual(['job-1']);
    expect(pick.selected[0]?.to).toBe('sam@acme.example');
  });

  it('does not send without SMTP — and does not scan other companies', () => {
    const pick = selectAutoFireJobs(
      [job(), job({ id: 'other', company_id: 'co-2' })],
      [client],
      null,
      'co-1',
      now,
    );
    expect(pick.selected).toEqual([]);
    expect(pick.missed.every(m => m.reason === 'no_smtp')).toBe(true);
    expect(pick.missed.map(m => m.job.id)).toEqual(['job-1']);
  });

  it('does not send without a client email', () => {
    const pick = selectAutoFireJobs(
      [job()],
      [{ id: 'c1', email: null }],
      smtp,
      'co-1',
      now,
    );
    expect(pick.selected).toEqual([]);
    expect(pick.missed[0]?.reason).toBe('no_email');
  });

  it('skips already-sent for this scheduled_date', () => {
    const pick = selectAutoFireJobs(
      [job({
        client_reminder_sent_at: '2026-08-21T01:00:00.000Z',
        client_reminder_sent_for_date: tomorrow,
      })],
      [client],
      smtp,
      'co-1',
      now,
    );
    expect(pick.selected).toEqual([]);
    expect(pick.missed[0]?.reason).toBe('already_sent');
  });

  it('keeps the auto query scoped to company + Perth tomorrow + open', () => {
    const filter = autoFireJobFilter('co-1', now);
    expect(filter).toEqual({
      table: 'jobs',
      company_id: 'co-1',
      scheduled_date: '2026-08-22',
      status: ['scheduled', 'in_progress'],
      timeZone: 'Australia/Perth',
    });
    expect(autoFireJobFilter('')).toBeNull();
    expect(wouldScanUnscopedJobs(tomorrowReminderQuery({ companyId: 'co-1', now }))).toBe(false);
  });
});

describe('do not double-mail', () => {
  it('skips a job already reminded for this scheduled_date', () => {
    expect(alreadyRemindedForScheduledDate(job({
      client_reminder_sent_at: '2026-08-21T01:00:00.000Z',
      client_reminder_sent_for_date: tomorrow,
    }))).toBe(true);
    const pick = selectTomorrowReminderJobs(
      [job({
        client_reminder_sent_at: '2026-08-21T01:00:00.000Z',
        client_reminder_sent_for_date: tomorrow,
      })],
      [client],
      'co-1',
      now,
    );
    expect(pick.selected).toEqual([]);
    expect(pick.missed[0]?.reason).toBe('already_sent');
  });

  it('may send again after the scheduled date changes', () => {
    const moved = job({
      scheduled_date: '2026-08-22',
      client_reminder_sent_at: '2026-08-18T01:00:00.000Z',
      client_reminder_sent_for_date: '2026-08-19',
    });
    expect(alreadyRemindedForScheduledDate(moved)).toBe(false);
    expect(selectTomorrowReminderJobs([moved], [client], 'co-1', now).selected).toHaveLength(1);
  });

  it('legacy sent-at without a for-date still skips auto (no double-mail)', () => {
    expect(alreadyRemindedForScheduledDate(job({
      client_reminder_sent_at: '2026-08-21T01:00:00.000Z',
      client_reminder_sent_for_date: null,
    }))).toBe(true);
  });
});

describe('cron vs tray auth', () => {
  it('cron due=tomorrow does not need a user JWT', () => {
    expect(isCronAuthorized({
      authHeader: 'Bearer cron-secret',
      cronSecret: 'cron-secret',
    })).toBe(true);
    expect(isCronAuthorized({
      cronHeader: 'cron-secret',
      cronSecret: 'cron-secret',
    })).toBe(true);
    expect(isCronAuthorized({
      authHeader: 'Bearer service-role',
      serviceRoleKey: 'service-role',
    })).toBe(true);
    expect(isCronAuthorized({ authHeader: 'Bearer user-jwt' })).toBe(false);
    expect(resolveReminderCaller({
      hasUser: false,
      cronAuthorized: true,
      due: 'tomorrow',
    })).toEqual({ ok: true, caller: { kind: 'cron' } });
  });

  it('single-jobId send still requires a logged-in member', () => {
    expect(resolveReminderCaller({
      hasUser: false,
      cronAuthorized: true,
      jobId: 'job-1',
    })).toEqual({ ok: false, error: 'Unauthorized' });
    expect(resolveReminderCaller({
      hasUser: true,
      userCompanyId: 'co-1',
      cronAuthorized: false,
      jobId: 'job-1',
    })).toEqual({ ok: true, caller: { kind: 'user', companyId: 'co-1' } });
  });
});

describe('scoped query — not a ledger scan', () => {
  it('filters jobs by company + tomorrow only', () => {
    const scope = tomorrowReminderQuery({ companyId: 'co-1', now });
    expect(scope).toEqual({
      table: 'jobs',
      columns: expect.stringContaining('scheduled_date'),
      eq: { company_id: 'co-1', scheduled_date: tomorrow },
      inFilters: { status: ['scheduled', 'in_progress'] },
    });
    expect(isReminderQueryScoped(scope)).toBe(true);
    expect(wouldScanUnscopedJobs(scope)).toBe(false);
  });

  it('refuses an unscoped jobs query', () => {
    expect(tomorrowReminderQuery({ companyId: '', now })).toBeNull();
    expect(tomorrowReminderQuery({ companyId: '   ', now })).toBeNull();
    expect(wouldScanUnscopedJobs({
      table: 'jobs',
      columns: '*',
      eq: {},
      inFilters: {},
    })).toBe(true);
    expect(isReminderQueryScoped({
      table: 'jobs',
      columns: '*',
      eq: { company_id: 'co-1', scheduled_date: tomorrow },
      inFilters: {},
    })).toBe(false);
  });

  it('loads only the clients on those jobs, still company-scoped', () => {
    expect(reminderClientsQuery('co-1', [])).toBeNull();
    expect(reminderClientsQuery('', ['c1'])).toBeNull();
    const scope = reminderClientsQuery('co-1', ['c1', 'c1', null, 'c2']);
    expect(scope).toEqual({
      table: 'clients',
      columns: expect.stringContaining('email'),
      eq: { company_id: 'co-1' },
      inFilters: { id: ['c1', 'c2'] },
    });
    expect(isReminderQueryScoped(scope)).toBe(true);
    expect(isReminderQueryScoped(reminderEmailSettingsQuery('co-1'))).toBe(true);
    expect(reminderEmailSettingsQuery('')).toBeNull();
  });

  it('applyReminderScope emits company + date equality, not a bare select', () => {
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
        };
      },
    };
    const scope = tomorrowReminderQuery({ companyId: 'co-1', now })!;
    applyReminderScope(builder, scope);
    expect(calls).toContainEqual({ op: 'select', column: scope.columns, value: null });
    expect(calls).toContainEqual({ op: 'eq', column: 'company_id', value: 'co-1' });
    expect(calls).toContainEqual({ op: 'eq', column: 'scheduled_date', value: tomorrow });
    expect(calls.some(c => c.op === 'select' && c.column === '*')).toBe(false);
  });
});

describe('reschedule target exists on the existing job schedule', () => {
  it('lands on the job schedule hash, not a new portal or inbox', () => {
    expect(jobScheduleHref('job-1')).toBe('/jobs/job-1#job-schedule');
    expect(jobRescheduleQueryHref('job-1')).toBe('/jobs/job-1?reschedule=1#job-schedule');
    expect(jobScheduleUrl('https://bts-inspect.pages.dev/', 'job-1'))
      .toBe('https://bts-inspect.pages.dev/jobs/job-1#job-schedule');
    expect(isExistingScheduleSurface(jobScheduleHref('job-1'))).toBe(true);
    expect(isExistingScheduleSurface(jobRescheduleQueryHref('job-1'))).toBe(true);
    expect(isExistingScheduleSurface('/notify')).toBe(false);
    expect(isExistingScheduleSurface('/portal/reschedule')).toBe(false);
  });

  it('client reschedule mailto is prefilled — no retype', () => {
    const href = clientRescheduleMailto({
      to: 'jobs@bts.example',
      job: job(),
      clientName: 'Acme Plants',
      appUrl: 'https://bts-inspect.pages.dev',
    });
    const mail = parseMailto(href);
    expect(mail).not.toBeNull();
    expect(mail!.to).toBe('jobs@bts.example');
    expect(mail!.subject).toMatch(/#0042/);
    expect(mail!.subject).toMatch(/22 Aug 2026/);
    expect(mail!.body).toMatch(/need to reschedule/i);
    expect(mail!.body).toContain('/jobs/job-1#job-schedule');
    expect(mail!.body).toContain('12 Smith St');
  });

  it('sendable reminder includes the reschedule path and prefilled To', () => {
    const decision = decideReminderSend({
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
    expect(decision.subject).toMatch(/tomorrow/);
    expect(decision.html).toMatch(/I need to reschedule/);
    expect(decision.html).toContain('mailto:');
    expect(decision.scheduleHref).toBe('/jobs/job-1#job-schedule');
    expect(isExistingScheduleSurface(decision.scheduleHref)).toBe(true);
    const mail = parseMailto(decision.rescheduleMailto);
    expect(mail?.body).toContain('#job-schedule');
  });

  it('list Next keeps date/crew, then points tomorrow jobs at the schedule tray', () => {
    expect(withReminderNext(
      job({ scheduled_date: null }),
      { href: '/jobs/job-1#job-schedule', label: 'Set a date', actionable: true },
      now,
    ).label).toBe('Set a date');
    expect(withReminderNext(
      job({ assigned_team: [] }),
      { href: '/jobs/job-1#job-schedule', label: 'Assign crew', actionable: true },
      now,
    ).label).toBe('Assign crew');
    const reminded = withReminderNext(
      job(),
      { href: '/jobs/job-1', label: 'Scheduled', actionable: true },
      now,
    );
    expect(reminded).toEqual({
      href: '/jobs/job-1#job-schedule',
      label: 'Remind client',
      actionable: true,
    });
    expect(isExistingScheduleSurface(reminded.href)).toBe(true);
  });

  it('buildReminderEmail never invents a To', () => {
    const email = buildReminderEmail({
      job: job(),
      client,
      company: { name: 'BTS Electrical' },
      settings: smtp,
      appUrl: 'https://app.example',
      to: 'sam@acme.example',
    });
    expect(email.to).toBe('sam@acme.example');
    expect(email.html).not.toContain('undefined');
    expect(email.text).toMatch(/Switchboard test/);
  });
});
