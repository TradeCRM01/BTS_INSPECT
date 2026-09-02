import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  alreadyRemindedForScheduledDate,
  applyReminderScope,
  AUTO_FIRE_CLICK_PATH,
  autoFireJobFilter,
  buildReminderEmail,
  buildReminderSms,
  decideSmsBeside,
  formatEmailAndSmsMessage,
  JOB_REMINDER_SMS_PIPE,
  missSmsMessage,
  prefillSmsTo,
  smsCredentialsReady,
  smsResultFromMiss,
  smsResultFromSend,
  clientRescheduleMailto,
  COMPANY_TIME_ZONE,
  VAN_TIME_ZONE,
  dateOnly,
  decideReminderSend,
  emailSettingsReady,
  formatJobDate,
  isCronAuthorized,
  isExistingScheduleSurface,
  isJobArrivingWindow,
  isJobDueToday,
  isJobDueTomorrow,
  isReminderQueryScoped,
  isJobRescheduleQuery,
  jobOfficeRescheduleBanner,
  jobRescheduleQueryHref,
  jobRescheduleUrl,
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
  todayYmd,
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

describe('van today — Australia/Brisbane', () => {
  it('a 2 Sep Brisbane morning is not UTC 1 Sep', () => {
    const brisbaneMorning = new Date('2026-09-01T22:00:00.000Z');
    expect(VAN_TIME_ZONE).toBe('Australia/Brisbane');
    expect(todayYmd(brisbaneMorning, VAN_TIME_ZONE)).toBe('2026-09-02');
    expect(todayYmd(brisbaneMorning, 'UTC')).toBe('2026-09-01');
    expect(isJobDueToday({ status: 'scheduled', scheduled_date: '2026-09-02' }, brisbaneMorning)).toBe(true);
    expect(isJobDueToday({ status: 'scheduled', scheduled_date: '2026-09-01' }, brisbaneMorning)).toBe(false);
    expect(isJobArrivingWindow({ status: 'scheduled', scheduled_date: '2026-09-02' }, brisbaneMorning)).toBe(true);
    expect(isJobArrivingWindow({ status: 'scheduled', scheduled_date: '2026-09-01' }, brisbaneMorning)).toBe(false);
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

describe('SMS beside email — same send, independent outcome', () => {
  const twilio = {
    accountSid: 'ACtest',
    authToken: 'token',
    fromNumber: '+61400000000',
  };

  it('prefills SMS To from clients.phone and never invents a number', () => {
    expect(prefillSmsTo('0832110000')).toBe('+61832110000');
    expect(prefillSmsTo('0412 345 678')).toBe('+61412345678');
    expect(prefillSmsTo('+61 412 345 678')).toBe('+61412345678');
    expect(prefillSmsTo('412345678')).toBe('+61412345678');
    expect(prefillSmsTo('')).toBe('');
    expect(prefillSmsTo('   ')).toBe('');
    expect(prefillSmsTo(null)).toBe('');
    expect(prefillSmsTo('no-digits')).toBe('');
    expect(prefillSmsTo('12')).toBe('');
  });

  it('needs Twilio sid, token, and from — secrets stay on the edge', () => {
    expect(smsCredentialsReady(null)).toBe(false);
    expect(smsCredentialsReady({ ...twilio, accountSid: '' })).toBe(false);
    expect(smsCredentialsReady({ ...twilio, authToken: '  ' })).toBe(false);
    expect(smsCredentialsReady({ ...twilio, fromNumber: '' })).toBe(false);
    expect(smsCredentialsReady(twilio)).toBe(true);
  });

  it('honest miss if no phone or no credentials — email eligibility is unchanged', () => {
    expect(decideSmsBeside({ phone: null, credentials: twilio })).toMatchObject({
      send: false, reason: 'no_phone',
    });
    expect(missSmsMessage('no_phone')).toMatch(/no phone/i);
    expect(decideSmsBeside({ phone: '0412 345 678', credentials: null })).toMatchObject({
      send: false, reason: 'no_sms_credentials',
    });
    expect(missSmsMessage('no_sms_credentials')).toBe('SMS is not set up.');
    const email = reminderEligibility({
      job: job(), client, settings: smtp, companyId: 'co-1', now,
    });
    expect(email.ok).toBe(true);
    expect(shouldRecordReminderSent(true)).toBe(true);
    expect(shouldRecordReminderSent(false)).toBe(false);
  });

  it('email still records sent when SMS misses; SMS success does not write sent-at', () => {
    expect(smsResultFromMiss('no_phone').sent).toBe(false);
    expect(smsResultFromSend(false, '+61412345678', 'Twilio 21211').message).toMatch(/Twilio 21211/);
    expect(smsResultFromSend(true, '+61412345678').sent).toBe(true);
    expect(shouldRecordReminderSent(true)).toBe(true);
    expect(formatEmailAndSmsMessage('Reminder sent to sam@acme.example', smsResultFromMiss('no_phone')))
      .toMatch(/Reminder sent to sam@acme.example.+no phone/i);
  });

  it('SMS body is the same visit, not a new product', () => {
    const body = buildReminderSms({
      job: job(),
      company: { name: 'BTS Electrical', phone: '1300 000 000' },
    });
    expect(body).toMatch(/#0042/);
    expect(body).toMatch(/tomorrow/);
    expect(body).toMatch(/12 Smith St/);
    expect(body).toMatch(/1300 000 000/);
    expect(body).not.toMatch(/portal/i);
    expect(JOB_REMINDER_SMS_PIPE.join(' ')).toMatch(/job-reminder/);
    expect(JOB_REMINDER_SMS_PIPE.join(' ')).toMatch(/api\.twilio\.com/);
    expect(JOB_REMINDER_SMS_PIPE.join(' ')).toMatch(/clients\.phone/);
    expect(JOB_REMINDER_SMS_PIPE.join(' ')).not.toMatch(/sms_settings/);
    expect(JOB_REMINDER_SMS_PIPE.join(' ')).not.toMatch(/send-quote/);
  });
});

describe('auto-fire (cron, not the tray)', () => {
  it('documents the click path that actually mails without a user', () => {
    expect(AUTO_FIRE_CLICK_PATH[0]).toMatch(/pg_cron/);
    expect(AUTO_FIRE_CLICK_PATH.join(' → ')).toMatch(/invoke_job_client_reminders/);
    expect(AUTO_FIRE_CLICK_PATH.join(' ')).toMatch(/due=tomorrow/);
    expect(AUTO_FIRE_CLICK_PATH.join(' ')).toMatch(/functions\/v1\/job-reminder/);
    expect(AUTO_FIRE_CLICK_PATH.join(' ')).toMatch(/api\.resend\.com/);
    expect(AUTO_FIRE_CLICK_PATH.join(' ')).toMatch(/api\.twilio\.com/);
    expect(AUTO_FIRE_CLICK_PATH.join(' ')).not.toMatch(/send_due_job_client_reminders/);
    expect(AUTO_FIRE_CLICK_PATH.join(' ')).not.toMatch(/send-quote/);
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
    expect(jobRescheduleUrl('https://bts-inspect.pages.dev/', 'job-1'))
      .toBe('https://bts-inspect.pages.dev/jobs/job-1?reschedule=1#job-schedule');
    expect(isExistingScheduleSurface(jobScheduleHref('job-1'))).toBe(true);
    expect(isExistingScheduleSurface(jobRescheduleQueryHref('job-1'))).toBe(true);
    expect(isExistingScheduleSurface('/notify')).toBe(false);
    expect(isExistingScheduleSurface('/portal/reschedule')).toBe(false);
  });

  it('honors ?reschedule=1 only — not a new route', () => {
    expect(isJobRescheduleQuery('reschedule=1')).toBe(true);
    expect(isJobRescheduleQuery('?reschedule=1')).toBe(true);
    expect(isJobRescheduleQuery(new URLSearchParams('reschedule=1'))).toBe(true);
    expect(isJobRescheduleQuery('reschedule=0')).toBe(false);
    expect(isJobRescheduleQuery('')).toBe(false);
    expect(isJobRescheduleQuery(null)).toBe(false);
  });

  it('office banner is honest — booked day or empty, never invented', () => {
    const dated = jobOfficeRescheduleBanner(job());
    expect(dated.kind).toBe('dated');
    expect(dated.booked).toBe(formatJobDate('2026-08-22'));
    expect(dated.message).toMatch(/needs a new date/i);
    expect(dated.message).toContain(formatJobDate('2026-08-22'));
    expect(dated.message).not.toMatch(/2026-08-2[13]/);

    const empty = jobOfficeRescheduleBanner(job({ scheduled_date: null }));
    expect(empty.kind).toBe('empty');
    expect(empty.booked).toBeNull();
    expect(empty.message).toMatch(/needs a new date/i);
    expect(empty.message).toMatch(/no day is booked yet/i);
    expect(empty.message).not.toMatch(/\d{1,2} \w{3} \d{4}/);

    expect(jobOfficeRescheduleBanner(job({ scheduled_date: '  ' })).kind).toBe('empty');
    expect(jobOfficeRescheduleBanner(job({ scheduled_date: undefined })).kind).toBe('empty');
  });

  it('JobDetailPage honors the query on the existing schedule block — no new dialog or route', () => {
    const page = readFileSync(resolve(process.cwd(), 'src/pages/JobDetailPage.tsx'), 'utf8');
    const panel = readFileSync(resolve(process.cwd(), 'src/components/jobs/JobDispatchPanel.tsx'), 'utf8');
    const reminder = readFileSync(resolve(process.cwd(), 'src/components/jobs/JobClientReminder.tsx'), 'utf8');

    expect(page).toContain('isJobRescheduleQuery');
    expect(page).toContain('jobOfficeRescheduleBanner');
    expect(page).toContain('id="job-schedule"');
    expect(page).toContain('rescheduleBanner');
    expect(page).toContain('JobDispatchPanel');
    expect(page).not.toContain('RescheduleDialog');
    expect(page).not.toContain('ReschedulePage');
    expect(page).not.toContain('/portal/reschedule');
    expect(page).not.toContain('createPortal');

    expect(panel).toContain('rescheduleBanner');
    expect(panel).toContain('job.scheduled_date ?? \'\'');
    expect(panel).toContain('scheduled_date: e.target.value || null');
    expect(panel).not.toContain('btn-primary');
    expect(panel).not.toContain('new Date().toISOString().slice(0, 10)');

    expect(reminder).toContain('btn-primary');
    expect(reminder).toContain('Send tomorrow reminder');
    expect(reminder).toContain('rescheduleAsked');
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
    expect(mail!.body).toContain('/jobs/job-1?reschedule=1#job-schedule');
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

describe('Perth auto-fire rides job-reminder — not SQL Resend', () => {
  const cron = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260821200000_062_job_reminder_edge_autofire.sql'),
    'utf8',
  );
  const edge = readFileSync(
    resolve(process.cwd(), 'supabase/functions/job-reminder/index.ts'),
    'utf8',
  );

  it('restores invoke_job_client_reminders to pg_net due=tomorrow', () => {
    expect(cron).toContain('CREATE OR REPLACE FUNCTION public.invoke_job_client_reminders()');
    expect(cron).toContain('net.http_post');
    expect(cron).toContain("/functions/v1/job-reminder");
    expect(cron).toContain('{"due":"tomorrow","source":"cron"}');
    expect(cron).toContain('{"due":"today","source":"cron"}');
    expect(cron).toContain("SELECT public.invoke_job_client_reminders()");
    expect(cron).toContain('job-client-reminder-perth-morning');
    expect(cron).toContain('job-client-reminder-perth-afternoon');
    expect(cron).not.toContain('CREATE TABLE');
    expect(cron).not.toContain('job-client-reminder-perth-evening');
    expect(cron).not.toMatch(/cron\.schedule\(\s*'inspection-due-reminder/);
  });

  it('retires the 058 SQL-only Resend autofire so cron cannot double-send', () => {
    const retired = cron.slice(
      cron.indexOf('CREATE OR REPLACE FUNCTION public.send_due_job_client_reminders()'),
      cron.indexOf('CREATE OR REPLACE FUNCTION public.invoke_job_client_reminders()'),
    );
    expect(retired).toMatch(/Retired/);
    expect(retired).not.toContain('api.resend.com');
    expect(retired).not.toContain('http((');
    expect(cron).not.toMatch(/SELECT public\.send_due_job_client_reminders\(\)/);
  });

  it('edge due=tomorrow still sends SMS beside email; SMS miss does not write sent-at', () => {
    expect(edge).toContain('due === "tomorrow"');
    expect(edge).toContain('api.twilio.com');
    expect(edge).toContain('client_reminder_sent_at');
    const jobStart = edge.indexOf('if (jobId)');
    const jobBlock = edge.slice(jobStart);
    const emailFail = jobBlock.indexOf('if (!res.ok)');
    const statusWrite = jobBlock.indexOf('client_reminder_sent_at: sentAt');
    expect(emailFail).toBeGreaterThan(-1);
    expect(statusWrite).toBeGreaterThan(emailFail);
    const statusBlock = jobBlock.slice(statusWrite, statusWrite + 280);
    expect(statusBlock).not.toContain('sms.sent');
    expect(edge).not.toContain('send_due_job_client_reminders');
  });
});
