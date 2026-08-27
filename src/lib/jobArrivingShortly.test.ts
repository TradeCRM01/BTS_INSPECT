import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { JobStatus } from '../types/crm';
import { jobListNext } from './jobNextAction';
import {
  ARRIVING_NEXT_LABEL,
  ARRIVING_PURPOSE,
  ARRIVING_SHORTLY_PIPE,
  AUTO_FIRE_CLICK_PATH,
  alreadyRemindedForScheduledDate,
  buildArrivingEmail,
  buildArrivingSms,
  buildReminderSms,
  cronIgnoresArrivingPurpose,
  decideArrivingSend,
  decideReminderSend,
  isArrivingPurpose,
  isExistingScheduleSurface,
  isJobArrivingWindow,
  isJobDueToday,
  isJobDueTomorrow,
  resolveReminderCaller,
  selectAutoFireJobs,
  shouldRecordArrivingSent,
  shouldSendArriving,
  withReminderNext,
  type ReminderClient,
  type ReminderEmailSettings,
  type ReminderJob,
} from './jobReminder';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

/** 16:00 Friday 21 Aug 2026 in Australia/Perth (08:00 UTC). Today in Perth is 21 Aug. */
const now = new Date('2026-08-21T08:00:00.000Z');
const today = '2026-08-21';
const tomorrow = '2026-08-22';

const smtp: ReminderEmailSettings = {
  smtp_host: 'smtp.resend.com',
  smtp_pass: 're_test',
  from_name: 'BTS Electrical',
  from_email: 'jobs@bts.example',
};

const twilio = {
  accountSid: 'ACtest',
  authToken: 'token',
  fromNumber: '+61400000000',
};

const client: ReminderClient = {
  id: 'c1',
  company_id: 'co-1',
  name: 'Acme Plants',
  contact_person: 'Sam',
  email: 'sam@acme.example',
  phone: '0412 345 678',
};

function job(over: Partial<ReminderJob> = {}): ReminderJob {
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

function listNext(over: {
  id?: string;
  status?: JobStatus;
  scheduled_date?: string | null;
  assigned_team?: string[] | null;
} = {}) {
  const row = {
    id: 'job-1',
    status: 'scheduled' as JobStatus,
    scheduled_date: today as string | null,
    assigned_team: ['crew-1'] as string[] | null,
    ...over,
  };
  return withReminderNext(row, jobListNext(row, now), now);
}

describe('Arriving shortly Next — today / in_progress only', () => {
  it('labels Next Arriving shortly for today and in_progress, and lands on the existing tray', () => {
    const todayNext = listNext();
    expect(todayNext).toEqual({
      href: '/jobs/job-1#job-schedule',
      label: ARRIVING_NEXT_LABEL,
      actionable: true,
    });
    expect(todayNext.label).toBe('Arriving shortly');
    expect(isExistingScheduleSurface(todayNext.href)).toBe(true);

    const onSite = listNext({ status: 'in_progress', scheduled_date: today });
    expect(onSite.label).toBe('Arriving shortly');
    expect(onSite.href).toBe('/jobs/job-1#job-schedule');

    const lateOpen = listNext({ status: 'in_progress', scheduled_date: '2026-08-20' });
    expect(lateOpen.label).toBe('Arriving shortly');
    expect(isJobArrivingWindow(job({ status: 'in_progress', scheduled_date: '2026-08-20' }), now)).toBe(true);
  });

  it('keeps tomorrow as Remind client — arriving does not take that Next', () => {
    const reminded = listNext({ scheduled_date: tomorrow });
    expect(reminded).toEqual({
      href: '/jobs/job-1#job-schedule',
      label: 'Remind client',
      actionable: true,
    });
    expect(isJobDueTomorrow(job({ scheduled_date: tomorrow }), now)).toBe(true);
    expect(isJobArrivingWindow(job({ scheduled_date: tomorrow }), now)).toBe(false);
    expect(isJobArrivingWindow(job({ status: 'in_progress', scheduled_date: tomorrow }), now)).toBe(false);
    expect(withReminderNext(
      job({ status: 'in_progress', scheduled_date: tomorrow }),
      { href: '/jobs/job-1', label: 'On site', actionable: true },
      now,
    ).label).toBe('Remind client');
  });

  it('keeps Set a date / Assign crew first — no date and no crew are not arriving', () => {
    expect(listNext({ scheduled_date: null, assigned_team: ['crew-1'] }).label).toBe('Set a date');
    expect(listNext({ scheduled_date: today, assigned_team: [] }).label).toBe('Assign crew');
    expect(listNext({ scheduled_date: today, assigned_team: null }).label).toBe('Assign crew');
    expect(withReminderNext(
      job({ scheduled_date: null }),
      { href: '/jobs/job-1#job-schedule', label: 'Set a date', actionable: true },
      now,
    ).label).toBe('Set a date');
    expect(withReminderNext(
      job(),
      { href: '/jobs/job-1#job-schedule', label: 'Assign crew', actionable: true },
      now,
    ).label).toBe('Assign crew');
  });

  it('does not rewrite upcoming, completed, or cancelled', () => {
    expect(listNext({ scheduled_date: '2026-08-24' }).label).not.toBe('Arriving shortly');
    expect(listNext({ scheduled_date: '2026-08-24' }).label).not.toBe('Remind client');
    expect(listNext({ status: 'completed', scheduled_date: today }).actionable).toBe(false);
    expect(listNext({ status: 'cancelled', scheduled_date: today }).actionable).toBe(false);
    expect(isJobDueToday(job({ status: 'completed' }), now)).toBe(false);
    expect(isJobArrivingWindow(job({ status: 'completed' }), now)).toBe(false);
  });
});

describe('decide / send — SMS required, email optional beside', () => {
  const base = {
    companyId: 'co-1',
    company: { name: 'BTS Electrical', email: 'jobs@bts.example', phone: '1300 000 000' },
    now,
  };

  it('sends when there is a sendable phone — email rides beside when SMTP is ready', () => {
    const decision = decideArrivingSend({
      ...base,
      job: job(),
      client,
      settings: smtp,
      credentials: twilio,
    });
    expect(decision.send).toBe(true);
    if (!decision.send) return;
    expect(decision.to).toBe('+61412345678');
    expect(decision.sendEmail).toBe(true);
    expect(decision.emailTo).toBe('sam@acme.example');
    expect(decision.email?.to).toBe('sam@acme.example');
    expect(decision.scheduleHref).toBe('/jobs/job-1#job-schedule');
  });

  it('misses without a phone — email-only is not enough', () => {
    const noPhone = decideArrivingSend({
      ...base,
      job: job(),
      client: { ...client, phone: null },
      settings: smtp,
      credentials: twilio,
    });
    expect(noPhone.send).toBe(false);
    if (noPhone.send) return;
    expect(noPhone.reason).toBe('no_phone');
    expect(noPhone.message).toMatch(/no phone/i);

    const emailOnlyStillMiss = decideArrivingSend({
      ...base,
      job: job(),
      client: { ...client, phone: '', email: 'sam@acme.example' },
      settings: smtp,
      credentials: twilio,
    });
    expect(emailOnlyStillMiss.send).toBe(false);
    if (!emailOnlyStillMiss.send) expect(emailOnlyStillMiss.reason).toBe('no_phone');
  });

  it('email is optional — no email / no SMTP still send SMS', () => {
    const noEmail = decideArrivingSend({
      ...base,
      job: job(),
      client: { ...client, email: null },
      settings: smtp,
      credentials: twilio,
    });
    expect(noEmail.send).toBe(true);
    if (noEmail.send) {
      expect(noEmail.sendEmail).toBe(false);
      expect(noEmail.email).toBeNull();
    }

    const noSmtp = decideArrivingSend({
      ...base,
      job: job(),
      client,
      settings: null,
      credentials: twilio,
    });
    expect(noSmtp.send).toBe(true);
    if (noSmtp.send) expect(noSmtp.sendEmail).toBe(false);
  });

  it('named misses: no_client, no_sms_credentials, closed, wrong_company, no_job', () => {
    expect(decideArrivingSend({
      ...base, job: job({ client_id: null }), client: null, credentials: twilio,
    })).toMatchObject({ send: false, reason: 'no_client' });
    expect(decideArrivingSend({
      ...base, job: job(), client, credentials: null,
    })).toMatchObject({ send: false, reason: 'no_sms_credentials' });
    expect(decideArrivingSend({
      ...base, job: job({ status: 'completed' }), client, credentials: twilio,
    })).toMatchObject({ send: false, reason: 'closed' });
    expect(decideArrivingSend({
      ...base, job: job({ company_id: 'co-2' }), client, credentials: twilio,
    })).toMatchObject({ send: false, reason: 'wrong_company' });
    expect(decideArrivingSend({
      ...base, job: null, client, credentials: twilio,
    })).toMatchObject({ send: false, reason: 'no_job' });
  });

  it('24h not_tomorrow / already_sent do not block arriving on today', () => {
    const alreadySentToday = job({
      client_reminder_sent_at: '2026-08-20T01:00:00.000Z',
      client_reminder_sent_for_date: today,
    });
    expect(alreadyRemindedForScheduledDate(alreadySentToday)).toBe(true);
    const reminder = decideReminderSend({
      ...base,
      job: alreadySentToday,
      client,
      settings: smtp,
      appUrl: 'https://bts-inspect.pages.dev',
    });
    expect(reminder.send).toBe(false);
    if (!reminder.send) expect(reminder.reason).toBe('not_tomorrow');

    const arriving = decideArrivingSend({
      ...base,
      job: alreadySentToday,
      client,
      settings: smtp,
      credentials: twilio,
    });
    expect(arriving.send).toBe(true);
    expect(shouldRecordArrivingSent(true)).toBe(false);
  });
});

describe('copy says arriving shortly, not tomorrow', () => {
  it('SMS and email say arriving shortly — no reschedule, no tomorrow, no ETA', () => {
    const sms = buildArrivingSms({
      job: job(),
      company: { name: 'BTS Electrical', phone: '1300 000 000' },
    });
    expect(sms).toBe('BTS Electrical is arriving shortly for #0042 Switchboard test. 12 Smith St, Suburb NSW 2000.');
    expect(sms).toMatch(/arriving shortly/i);
    expect(sms).not.toMatch(/tomorrow/i);
    expect(sms).not.toMatch(/reschedule/i);
    expect(sms).not.toMatch(/minute/i);
    expect(sms).not.toMatch(/maps\.google/i);
    expect(sms).not.toMatch(/eta/i);

    const email = buildArrivingEmail({
      job: job(),
      client,
      company: { name: 'BTS Electrical', phone: '1300 000 000' },
      to: 'sam@acme.example',
    });
    expect(email.subject).toMatch(/arriving shortly/i);
    expect(email.text).toMatch(/arriving shortly/i);
    expect(email.html).toMatch(/arriving shortly/i);
    expect(email.html).toContain('12 Smith St');
    expect(`${email.subject} ${email.text} ${email.html}`).not.toMatch(/tomorrow/i);
    expect(`${email.subject} ${email.text} ${email.html}`).not.toMatch(/reschedule/i);

    const reminderSms = buildReminderSms({
      job: job({ scheduled_date: tomorrow }),
      company: { name: 'BTS Electrical', phone: '1300 000 000' },
    });
    expect(reminderSms).toMatch(/tomorrow/);
    expect(reminderSms).not.toMatch(/arriving shortly/i);
  });
});

describe('cron / auto-fire does not select arriving jobs', () => {
  it('auto-select stays Perth tomorrow — today arriving jobs are not mailed', () => {
    const pick = selectAutoFireJobs(
      [
        job(),
        job({ id: 'tomorrow', scheduled_date: tomorrow }),
        job({ id: 'on-site', status: 'in_progress', scheduled_date: today }),
      ],
      [client],
      smtp,
      'co-1',
      now,
    );
    expect(pick.selected.map(s => s.job.id)).toEqual(['tomorrow']);
    expect(pick.selected.every(s => dateOnlySafe(s.job.scheduled_date) === tomorrow)).toBe(true);
  });

  it('purpose arriving is ignored on the cron hop — user tap + jobId only', () => {
    expect(isArrivingPurpose(ARRIVING_PURPOSE)).toBe(true);
    expect(isArrivingPurpose('receipt')).toBe(false);
    expect(cronIgnoresArrivingPurpose({ purpose: 'arriving', due: 'tomorrow' })).toBe(true);
    expect(cronIgnoresArrivingPurpose({ purpose: 'arriving', jobId: '' })).toBe(true);
    expect(cronIgnoresArrivingPurpose({ purpose: 'arriving', jobId: 'job-1' })).toBe(false);
    expect(shouldSendArriving({ purpose: 'arriving', due: 'tomorrow', hasUser: false })).toBe(false);
    expect(shouldSendArriving({ purpose: 'arriving', due: 'tomorrow', hasUser: true })).toBe(false);
    expect(shouldSendArriving({
      purpose: 'arriving', jobId: 'job-1', hasUser: false,
    })).toBe(false);
    expect(shouldSendArriving({
      purpose: 'arriving', jobId: 'job-1', hasUser: true,
    })).toBe(true);
    expect(resolveReminderCaller({
      hasUser: false,
      cronAuthorized: true,
      due: 'tomorrow',
      purpose: 'arriving',
    })).toEqual({ ok: true, caller: { kind: 'cron' } });
    expect(resolveReminderCaller({
      hasUser: false,
      cronAuthorized: true,
      jobId: 'job-1',
      purpose: 'arriving',
    })).toEqual({ ok: false, error: 'Unauthorized' });
    expect(resolveReminderCaller({
      hasUser: true,
      userCompanyId: 'co-1',
      cronAuthorized: false,
      jobId: 'job-1',
      purpose: 'arriving',
    })).toEqual({ ok: true, caller: { kind: 'user', companyId: 'co-1' } });
  });

  it('auto-fire click path and cron SQL never mention arriving', () => {
    expect(AUTO_FIRE_CLICK_PATH.join(' ')).toMatch(/due=tomorrow/);
    expect(AUTO_FIRE_CLICK_PATH.join(' ')).not.toMatch(/arriving/);
    expect(AUTO_FIRE_CLICK_PATH.join(' ')).not.toMatch(/purpose/);
    expect(ARRIVING_SHORTLY_PIPE.join(' ')).toMatch(/purpose: arriving/);
    expect(ARRIVING_SHORTLY_PIPE.join(' ')).toMatch(/user tap/);
    expect(ARRIVING_SHORTLY_PIPE.join(' ')).toMatch(/ignores purpose arriving/);

    const cron = src('supabase/migrations/20260821200000_062_job_reminder_edge_autofire.sql');
    expect(cron).toContain('{"due":"tomorrow","source":"cron"}');
    expect(cron).not.toContain('arriving');
    expect(cron).not.toContain('purpose');
  });

  it('edge arriving branch requires a user jobId and does not write reminder sent-at', () => {
    const edge = src('supabase/functions/job-reminder/index.ts');
    expect(edge).toContain('purpose === "arriving"');
    expect(edge).toContain('arriving shortly');
    expect(edge).toContain('is arriving shortly for');
    expect(edge).toContain('Arriving does not write client_reminder_sent_at');
    const arrivingStart = edge.indexOf('if (purpose === "arriving")');
    const arrivingEnd = edge.indexOf('} else if (due === "tomorrow")');
    expect(arrivingStart).toBeGreaterThan(-1);
    expect(arrivingEnd).toBeGreaterThan(arrivingStart);
    const arrivingBlock = edge.slice(arrivingStart, arrivingEnd);
    expect(arrivingBlock).toContain('user tap only');
    expect(arrivingBlock).toContain('no_phone');
    expect(arrivingBlock).toContain('no_client');
    expect(arrivingBlock).toContain('sendTwilioSms');
    expect(arrivingBlock).not.toContain('not_tomorrow');
    expect(arrivingBlock).not.toContain('already_sent');
    expect(arrivingBlock).not.toContain('client_reminder_sent_at: sentAt');
    expect(arrivingBlock).not.toContain('Need to reschedule');
    expect(arrivingBlock).not.toContain('booked for tomorrow');
    expect(arrivingBlock).not.toMatch(/maps\.google|eta|minutes? away/i);
  });
});

describe('tray invoke stays on the existing job-reminder pipe', () => {
  it('job sheet primary invokes purpose arriving on the existing tray', () => {
    const reminder = src('src/components/jobs/JobClientReminder.tsx');
    expect(reminder).toContain("purpose: 'arriving'");
    expect(reminder).toContain("functions.invoke('job-reminder'");
    expect(reminder).toContain('Arriving shortly');
    expect(reminder).toContain('Send tomorrow reminder');
    expect(reminder).toContain('disabled={awaitingSmtp || !decision.send || send.isPending}');
    expect(reminder).toContain('if (!decision.send)');
    expect(reminder).toContain('saveJobClientPhone');
    expect(reminder).toContain('saveJobClientEmail');
    expect(reminder).toContain('attachJobClient');
    expect(reminder).not.toContain('CREATE TABLE');
    expect(reminder).not.toContain('arriving_shortly_sent_at');
    expect(src('src/lib/jobReminder.ts')).not.toContain('arriving_shortly_sent_at');
  });
});

describe('isolation from quote / invoice / PO send and PR #17', () => {
  it('does not fork quote, invoice, PO, How to pay, login, landing, AppShell, or Relovi', () => {
    const logic = src('src/lib/jobReminder.ts');
    const reminder = src('src/components/jobs/JobClientReminder.tsx');
    const edge = src('supabase/functions/job-reminder/index.ts');
    const quoteDeliver = src('src/lib/sendQuoteDeliver.ts');
    const invoiceDeliver = src('src/lib/sendInvoiceDeliver.ts');
    const poDeliver = src('src/lib/sendPurchaseOrderDeliver.ts');
    const login = src('src/pages/LoginPage.tsx');
    const landing = src('src/pages/MarketingPage.tsx');
    const appShell = src('src/components/layout/AppShell.tsx');

    expect(logic).not.toContain('convertQuoteToInvoice');
    expect(logic).not.toContain('sendQuote');
    expect(logic).not.toContain('QuoteSendDialog');
    expect(logic).not.toContain('InvoiceSendDialog');
    expect(logic).not.toContain('PurchaseOrderSendDialog');
    expect(logic).not.toContain('deliverQuote');
    expect(logic).not.toContain('deliverInvoice');
    expect(logic).not.toContain('deliverPurchaseOrder');
    expect(logic).not.toContain('How to pay');
    expect(logic).not.toContain('payment_methods');
    expect(logic).not.toContain('Relovi');
    expect(logic).not.toContain('Littleloop');
    expect(logic).not.toContain('Manrope');

    expect(reminder).not.toContain('QuoteSendDialog');
    expect(reminder).not.toContain('InvoiceSendDialog');
    expect(reminder).not.toContain('PurchaseOrderSendDialog');
    expect(reminder).not.toContain('sendQuote');
    expect(reminder).not.toContain('convertQuoteToInvoice');
    expect(reminder).not.toContain('Relovi');
    expect(reminder).not.toContain('Littleloop');
    expect(reminder).not.toContain('Manrope');

    expect(quoteDeliver).not.toContain("purpose: 'arriving'");
    expect(invoiceDeliver).not.toContain("purpose: 'arriving'");
    expect(poDeliver).not.toContain("purpose: 'arriving'");
    expect(login).not.toContain('arriving');
    expect(landing).not.toContain('arriving');
    expect(appShell).not.toContain('arriving');
    expect(edge).toContain('purpose === "arriving"');
    expect(edge).toContain('purpose === "receipt"');
  });
});

function dateOnlySafe(value: string | null | undefined): string | null {
  const day = (value ?? '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}
