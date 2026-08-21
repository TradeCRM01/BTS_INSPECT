import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clientEmailForSend } from './sendInvoice';
import {
  JOB_CLIENT_EMAIL_NO_CLIENT,
  decideJobClientEmailSave,
  jobClientEmailRow,
  jobClientEmailToStore,
} from './saveJobClientEmail';
import {
  decideReminderSend,
  missMessage,
  prefillReminderTo,
  type ReminderClient,
  type ReminderEmailSettings,
  type ReminderJob,
} from './jobReminder';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

/** 16:00 Friday 21 Aug 2026 in Australia/Perth (08:00 UTC). Tomorrow in Perth is 22 Aug. */
const now = new Date('2026-08-21T08:00:00.000Z');

const smtp: ReminderEmailSettings = {
  smtp_host: 'smtp.resend.com',
  smtp_pass: 're_test',
  from_name: 'BTS Electrical',
  from_email: 'jobs@bts.example',
};

const base = {
  companyId: 'co-1',
  company: { name: 'BTS Electrical', email: 'jobs@bts.example', phone: '1300 000 000' },
  appUrl: 'https://bts-inspect.pages.dev',
  now,
};

function job(over: Partial<ReminderJob> = {}): ReminderJob {
  return {
    id: 'job-1',
    company_id: 'co-1',
    client_id: 'c1',
    title: 'Switchboard test',
    status: 'scheduled',
    scheduled_date: '2026-08-22',
    start_time: '08:30:00',
    address: '12 Smith St, Suburb NSW 2000',
    job_number: 42,
    ...over,
  };
}

function client(over: Partial<ReminderClient> = {}): ReminderClient {
  return {
    id: 'c1',
    company_id: 'co-1',
    name: 'Acme Plants',
    contact_person: 'Sam',
    email: null,
    phone: '0412 345 678',
    ...over,
  };
}

describe('24h reminder client email — save / miss', () => {
  it('reuses saveJobClientEmail on this job client_id — blank stays empty, no second client', () => {
    expect(decideJobClientEmailSave({ clientId: 'c1', email: '  jane@acme.com.au  ' })).toEqual({
      action: 'write',
      clientId: 'c1',
      email: 'jane@acme.com.au',
    });
    expect(decideJobClientEmailSave({ clientId: 'c1', email: '' })).toEqual({
      action: 'write',
      clientId: 'c1',
      email: null,
    });
    expect(decideJobClientEmailSave({ clientId: null, email: 'jane@acme.com.au' })).toEqual({
      action: 'miss',
      reason: 'no_client',
      message: JOB_CLIENT_EMAIL_NO_CLIENT,
    });
    expect(jobClientEmailRow({ clientId: null, client: { id: 'c1', email: null } }).kind).toBe('none');
    expect(jobClientEmailRow({ clientId: 'c1', client: null }).kind).toBe('none');
    expect(jobClientEmailRow({
      clientId: 'c1',
      client: { id: 'c1', email: null },
    })).toEqual({ kind: 'edit', clientId: 'c1', email: '' });
  });

  it('opens the write field when the existing client has no sendable email — invalid stays an honest miss', () => {
    expect(jobClientEmailRow({
      clientId: 'c1',
      client: { id: 'c1', email: null },
    })).toEqual({ kind: 'edit', clientId: 'c1', email: '' });
    expect(jobClientEmailRow({
      clientId: 'c1',
      client: { id: 'c1', email: 'not-an-email' },
    })).toEqual({ kind: 'edit', clientId: 'c1', email: 'not-an-email' });
    expect(clientEmailForSend(jobClientEmailToStore(''))).toBeNull();
    expect(clientEmailForSend(jobClientEmailToStore('not-an-email'))).toBeNull();
    expect(prefillReminderTo({ id: 'c1', email: jobClientEmailToStore('not-an-email') })).toBe('');
  });

  it('already-has-email stays the signed To — does not replace a good address with an empty editor', () => {
    expect(jobClientEmailRow({
      clientId: 'c1',
      client: { id: 'c1', email: '  alex@acme.example  ' },
    })).toEqual({ kind: 'mailto', clientId: 'c1', email: 'alex@acme.example' });
    expect(prefillReminderTo({ id: 'c1', email: 'alex@acme.example' })).toBe('alex@acme.example');
  });

  it('hides the editor when there is no client — does not invent one', () => {
    expect(jobClientEmailRow({ clientId: null, client: null }).kind).toBe('none');
    expect(jobClientEmailRow({ clientId: '', client: { id: 'c1', email: null } }).kind).toBe('none');
    const miss = decideReminderSend({
      ...base,
      job: job({ client_id: null }),
      client: null,
      settings: smtp,
    });
    expect(miss.send).toBe(false);
    if (miss.send) return;
    expect(miss.reason).toBe('no_email');
    expect(miss.message).toBe(missMessage('no_email'));
  });

  it('keeps blank / invalid as an honest no_email miss — Send uses a real saved address', () => {
    expect(clientEmailForSend(jobClientEmailToStore(''))).toBeNull();
    expect(clientEmailForSend(jobClientEmailToStore('not-an-email'))).toBeNull();
    expect(clientEmailForSend(jobClientEmailToStore('jane@acme.com.au'))).toBe('jane@acme.com.au');
    expect(missMessage('no_email')).toMatch(/no email/i);

    const afterBlank = decideReminderSend({
      ...base,
      job: job(),
      client: client({ email: jobClientEmailToStore('') }),
      settings: smtp,
    });
    expect(afterBlank.send).toBe(false);
    if (!afterBlank.send) expect(afterBlank.reason).toBe('no_email');

    const afterInvalid = decideReminderSend({
      ...base,
      job: job(),
      client: client({ email: jobClientEmailToStore('not-an-email') }),
      settings: smtp,
    });
    expect(afterInvalid.send).toBe(false);
    if (!afterInvalid.send) expect(afterInvalid.reason).toBe('no_email');

    const afterSave = decideReminderSend({
      ...base,
      job: job(),
      client: client({ email: jobClientEmailToStore('jane@acme.com.au') }),
      settings: smtp,
    });
    expect(afterSave.send).toBe(true);
    if (!afterSave.send) return;
    expect(afterSave.to).toBe('jane@acme.com.au');
  });
});

describe('24h reminder client email — wiring', () => {
  it('saves clients.email on the existing reminder tray miss via saveJobClientEmail and does not auto-send', () => {
    const save = src('src/lib/saveJobClientEmail.ts');
    const reminder = src('src/components/jobs/JobClientReminder.tsx');
    const logic = src('src/lib/jobReminder.ts');
    const handleSaveStart = reminder.indexOf('const saveEmail');
    const handleSaveEnd = reminder.indexOf('const send = useMutation');
    expect(handleSaveStart).toBeGreaterThan(-1);
    expect(handleSaveEnd).toBeGreaterThan(handleSaveStart);
    const handle = reminder.slice(handleSaveStart, handleSaveEnd);
    const handleSendFn = reminder.slice(handleSaveEnd, reminder.indexOf('const sentAt'));

    expect(save).toContain("from('clients')");
    expect(save).toContain('update({ email:');
    expect(save).toContain('.eq(\'id\', decision.clientId)');
    expect(save).not.toContain('insert({');
    expect(save).not.toContain('CREATE TABLE');
    expect(save).not.toContain('ALTER TABLE');
    expect(save).not.toContain('cron.schedule');
    expect(save).not.toContain('job-reminder');
    expect(save).not.toContain('JobClientReminder');

    expect(reminder).toContain('saveJobClientEmail');
    expect(reminder).toContain('jobClientEmailRow');
    expect(reminder).toContain('jobClientEmailSaveToast');
    expect(reminder).toContain('saveEmail.mutate()');
    expect(reminder).toContain('job-client-email');
    expect(reminder).toContain('job-client-email-save');
    expect(reminder).toContain('aria-label="Client email"');
    expect(reminder).toContain("kind === 'edit'");
    expect(reminder).toContain('jobClientEmailRow({');
    expect(reminder).toContain('clientId: job.client_id');
    expect(reminder).toContain('client: liveClient');
    expect(reminder).not.toContain('ClientEmailDialog');
    expect(reminder).not.toContain('ReminderEmailDialog');
    expect(reminder).not.toContain('AU_EMAIL_PLACEHOLDER');
    expect(reminder).not.toContain('className="btn-primary job-client-email-save"');
    expect(reminder).not.toContain('className="ops-next-control-block job-client-email-save"');
    expect(reminder).not.toContain('job-client-email-addr');

    expect(handle).toContain('saveJobClientEmail');
    expect(handle).toContain('emailRow.clientId');
    expect(handle).toContain('clientEmailDraft');
    expect(handle).toContain("invalidateQueries({ queryKey: ['job-client', result.clientId] })");
    expect(handle).not.toContain("functions.invoke('job-reminder'");
    expect(handle).not.toContain('send.mutate');
    expect(handle).not.toContain('insert({');
    expect(handle).not.toContain('client_reminder_sent_at');
    expect(handle).not.toContain('cron.schedule');

    expect(handleSendFn).toContain("functions.invoke('job-reminder'");
    expect(handleSendFn).not.toContain('saveJobClientEmail');
    expect(handleSendFn).toContain('if (!decision.send)');

    expect(logic).not.toContain('saveJobClientEmail');
  });

  it('does not add a second 44px — Save is muted on the miss, primary stays Send tomorrow reminder', () => {
    const reminder = src('src/components/jobs/JobClientReminder.tsx');
    const css = src('src/index.css');
    const reminderCssStart = css.indexOf('#job-schedule .job-reminder .job-client-email');
    expect(reminderCssStart).toBeGreaterThan(-1);
    const reminderCss = css.slice(reminderCssStart, css.indexOf('/* end reminder client email */'));

    expect(reminder).toContain('className="btn-primary"');
    expect(reminder).toContain('Send tomorrow reminder');
    expect(reminder).toContain('job-client-email-save');
    expect(reminder).toContain('disabled={awaitingSmtp || !decision.send || send.isPending}');
    expect(reminder).not.toContain('Open client');
    expect(reminder).not.toContain('Add client email');
    expect(reminder).not.toContain('className="btn-primary job-client-email-save"');
    expect(reminderCss).toContain('.job-client-email-save');
    expect(reminderCss).not.toContain('min-height: 44px');
    expect(reminderCss).not.toContain('min-h-[44px]');
    expect(reminderCss).not.toContain('ops-next-control');
    expect(reminderCss).not.toContain('btn-primary');
    expect(reminderCss).toContain('font-size: 12px');
    expect(reminderCss).toContain('#D5DCE3');
    expect(reminderCss).toContain('gap: 8px');
    expect(reminderCss).toContain('white-space: nowrap');
    expect(reminderCss).toContain('text-overflow: clip');
    expect(reminderCss).not.toContain('ellipsis');
    expect(reminderCss).toContain('#5B6B7C');
    expect(reminderCss).toContain('#0A2540');
    expect(reminderCss).toContain('#2E75B6');
    expect(reminderCss).toMatch(/\.job-client-email-save[\s\S]*color: #5B6B7C/);

    const primaryCss = css.slice(
      css.indexOf('#job-schedule .btn-primary'),
      css.indexOf('#job-schedule .ops-tray > .px-3'),
    );
    expect(primaryCss).toContain('.btn-primary:disabled');
    expect(primaryCss).toContain('.btn-primary:disabled:hover');
    expect(primaryCss).toContain('opacity: 0.45');
    expect(primaryCss).toContain('cursor: not-allowed');
    expect(primaryCss).toMatch(/\.btn-primary:disabled:hover[\s\S]*background: #2E75B6/);
    expect(reminder).not.toContain('indigo-500');
    expect(reminder).not.toContain('sky-500');
    expect(reminderCss).not.toContain('indigo-500');
    expect(reminderCss).not.toContain('sky-500');
  });

  it('disables Send tomorrow reminder on no_email until a sendable save — no auto-send', () => {
    const reminder = src('src/components/jobs/JobClientReminder.tsx');
    const handle = reminder.slice(
      reminder.indexOf('const saveEmail'),
      reminder.indexOf('const send = useMutation'),
    );
    const handleSendFn = reminder.slice(
      reminder.indexOf('const send = useMutation'),
      reminder.indexOf('const sentAt'),
    );
    const sendBtn = reminder.slice(
      reminder.indexOf('<div className="job-reminder-act">'),
      reminder.indexOf('<details className="job-reminder-more">'),
    );

    expect(sendBtn).toContain('Send tomorrow reminder');
    expect(sendBtn).toContain('disabled={awaitingSmtp || !decision.send || send.isPending}');
    expect(handle).toContain('saveJobClientEmail');
    expect(handle).not.toContain("functions.invoke('job-reminder'");
    expect(handle).not.toContain('send.mutate');
    expect(handleSendFn).toContain("functions.invoke('job-reminder'");
    expect(handleSendFn).not.toContain('saveJobClientEmail');

    const afterSave = decideReminderSend({
      ...base,
      job: job(),
      client: client({ email: jobClientEmailToStore('jane@acme.com.au') }),
      settings: smtp,
    });
    expect(afterSave.send).toBe(true);
    const stillMiss = decideReminderSend({
      ...base,
      job: job(),
      client: client({ email: jobClientEmailToStore('') }),
      settings: smtp,
    });
    expect(stillMiss.send).toBe(false);
  });

  it('keeps SMS To as-is and leaves job-sheet / invoice-sheet / report-send signed', () => {
    const reminder = src('src/components/jobs/JobClientReminder.tsx');
    const page = src('src/pages/JobDetailPage.tsx');
    const invoicesPage = src('src/pages/InvoicesPage.tsx');
    const dialog = src('src/components/inspection/ReportSendDialog.tsx');
    const due = src('src/components/inspection/InspectionDueReminder.tsx');

    expect(reminder).toContain('SMS To');
    expect(reminder).toContain('aria-label="Reminder SMS To"');
    expect(reminder).toContain('prefillSmsTo(liveClient?.phone)');
    expect(reminder).not.toContain('saveJobClientPhone');
    expect(reminder).not.toContain('job-client-phone');

    expect(page).toContain('saveJobClientEmail');
    expect(page).toContain('jobClientEmailRow({ clientId: job.client_id, client: client ?? null })');
    expect(page).toContain('JobClientReminder');
    expect(invoicesPage).toContain('saveJobClientEmail');
    expect(dialog).toContain('saveJobClientEmail');
    expect(due).not.toContain('saveJobClientEmail');
    expect(due).not.toContain('job-client-email');
  });

  it('does not launch 24h autofire or change job-reminder cron', () => {
    const reminder = src('src/components/jobs/JobClientReminder.tsx');
    const logic = src('src/lib/jobReminder.ts');
    const cron = src('supabase/migrations/20260821200000_062_job_reminder_edge_autofire.sql');
    const cron057 = src('supabase/migrations/20260821133000_057_job_reminder_cron.sql');
    const edge = src('supabase/functions/job-reminder/index.ts');

    expect(reminder).not.toContain('cron.schedule');
    expect(reminder).not.toContain('due=tomorrow');
    expect(reminder).not.toContain('invoke_job_client_reminders');
    expect(reminder).not.toContain('selectAutoFireJobs');
    expect(logic).not.toContain('saveJobClientEmail');
    expect(cron).not.toContain('saveJobClientEmail');
    expect(cron057).not.toContain('saveJobClientEmail');
    expect(edge).not.toContain('saveJobClientEmail');
    expect(cron).toContain('SELECT public.invoke_job_client_reminders()');
    expect(cron).toContain('{"due":"tomorrow","source":"cron"}');
  });

  it('points the no_email editor miss at the field on this tray — does not bounce to the client record', () => {
    const reminder = src('src/components/jobs/JobClientReminder.tsx');
    expect(reminder).toContain('JOB_REMINDER_NO_EMAIL_FIELD');
    expect(reminder).toContain('Add one below before you send.');
    expect(reminder).toContain('This client has no email. Add one below before you send.');
    expect(reminder).toContain('noEmailFieldMiss');
    expect(reminder).toContain("kind === 'edit'");
    const emptyMiss = reminder.indexOf('{noEmailFieldMiss && (');
    const tos = reminder.indexOf('<div className="job-reminder-tos">');
    expect(emptyMiss).toBeGreaterThan(-1);
    expect(tos).toBeGreaterThan(emptyMiss);
    expect(reminder).not.toContain('Add one on the client record');
    expect(reminder).not.toContain('client record');
    expect(reminder).not.toContain('/clients/');
    expect(reminder).not.toContain('Open client');
    expect(src('src/lib/jobReminder.ts')).toContain('This client has no email — reminder was not sent.');
  });

  it('keeps Flameboy look shots for empty, saved, already-has-email, and no-client', () => {
    const shots = [
      'docs/look/job-reminder-email-empty-desktop.png',
      'docs/look/job-reminder-email-empty-ute.png',
      'docs/look/job-reminder-email-saved-desktop.png',
      'docs/look/job-reminder-email-saved-ute.png',
      'docs/look/job-reminder-email-has-email-desktop.png',
      'docs/look/job-reminder-email-has-email-ute.png',
      'docs/look/job-reminder-email-no-client-desktop.png',
      'docs/look/job-reminder-email-no-client-ute.png',
    ];
    for (const shot of shots) {
      expect(existsSync(resolve(process.cwd(), shot)), shot).toBe(true);
    }
  });

  it('leaves quote convert / PR #17 off this control', () => {
    const save = src('src/lib/saveJobClientEmail.ts');
    const reminder = src('src/components/jobs/JobClientReminder.tsx');
    const quoteConvert = src('src/lib/convertQuoteToInvoice.ts');
    const quotesPage = src('src/pages/QuotesPage.tsx');
    const quoteNext = src('src/lib/quoteNextAction.ts');
    expect(save).not.toContain('convertQuoteToInvoice');
    expect(save).not.toContain('sendQuote');
    expect(save).not.toContain('QuoteSendDialog');
    expect(quoteConvert).not.toContain('saveJobClientEmail');
    expect(quotesPage).not.toContain('saveJobClientEmail');
    expect(quoteNext).not.toContain('saveJobClientEmail');
    expect(reminder).not.toContain('QuoteSendDialog');
    expect(reminder).not.toContain('sendQuote');
    expect(reminder).not.toContain('sendQuoteDeliver');
    expect(reminder).not.toContain('convertQuoteToInvoice');
  });
});
