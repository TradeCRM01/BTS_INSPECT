import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  JOB_CLIENT_ATTACH_ALREADY,
  JOB_CLIENT_ATTACH_NO_CLIENTS,
  JOB_CLIENT_ATTACH_NO_JOB,
  JOB_CLIENT_ATTACH_NO_SELECTION,
  JOB_CLIENT_ATTACH_SAVED,
  JOB_CLIENT_ATTACH_UNKNOWN,
  companyClientsForAttach,
  decideJobClientAttach,
  jobClientAttachRow,
  jobClientAttachToast,
} from './attachJobClient';
import { jobClientEmailRow } from './saveJobClientEmail';
import { jobClientPhoneRow } from './saveJobClientPhone';
import {
  decideReminderSend,
  missMessage,
  prefillReminderTo,
  prefillSmsTo,
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

const acme = { id: 'c1', name: 'Acme Electrical' };
const brooks = { id: 'c2', name: 'Brooks Plumbing' };

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
    email: 'alex@acme.example',
    phone: '0412 345 678',
    ...over,
  };
}

describe('companyClientsForAttach', () => {
  it('lists existing company clients only — no invented placeholder', () => {
    expect(companyClientsForAttach([
      acme,
      { id: 'c-arch', name: 'Old Co', archived: true },
      { id: 'c-blank', name: '   ' },
      { id: '', name: 'Ghost' },
      brooks,
    ])).toEqual([acme, brooks]);
    expect(companyClientsForAttach([])).toEqual([]);
    expect(companyClientsForAttach(null)).toEqual([]);
    expect(companyClientsForAttach(undefined)).toEqual([]);
  });
});

describe('jobClientAttachRow on the 24h reminder no-client miss', () => {
  it('keeps the signed To / SMS To when this job already has client_id', () => {
    expect(jobClientAttachRow({
      jobClientId: 'c1',
      companyClients: [acme, brooks],
    })).toEqual({ kind: 'linked' });
    expect(jobClientAttachRow({
      jobClientId: 'c1',
      companyClients: [],
    }).kind).toBe('linked');
  });

  it('lets the operator pick when this job has no client_id and company clients exist', () => {
    expect(jobClientAttachRow({
      jobClientId: null,
      companyClients: [acme, brooks],
    })).toEqual({ kind: 'pick', clients: [acme, brooks] });
    expect(jobClientAttachRow({
      jobClientId: '',
      companyClients: [acme],
    }).kind).toBe('pick');
  });

  it('names the miss when there are no clients to pick — no fake picker', () => {
    expect(jobClientAttachRow({
      jobClientId: null,
      companyClients: [],
    })).toEqual({
      kind: 'miss',
      reason: 'no_clients',
      message: JOB_CLIENT_ATTACH_NO_CLIENTS,
    });
    expect(jobClientAttachRow({
      jobClientId: null,
      companyClients: [{ id: 'c-arch', name: 'Old Co', archived: true }],
    }).kind).toBe('miss');
    expect(JOB_CLIENT_ATTACH_NO_CLIENTS).toBe('No clients to attach');
  });

  it('stays quiet while the company list is still loading', () => {
    expect(jobClientAttachRow({
      jobClientId: null,
      companyClients: null,
    })).toEqual({ kind: 'pending' });
    expect(jobClientAttachRow({
      jobClientId: undefined,
      companyClients: undefined,
    }).kind).toBe('pending');
  });
});

describe('decideJobClientAttach on this job', () => {
  it('writes jobs.client_id on this job from an existing company client', () => {
    expect(decideJobClientAttach({
      jobId: 'job-1',
      jobClientId: null,
      clientId: 'c1',
      companyClients: [acme, brooks],
    })).toEqual({ action: 'write', jobId: 'job-1', clientId: 'c1' });
  });

  it('does not invent a client — unknown, blank, or empty list miss', () => {
    expect(decideJobClientAttach({
      jobId: 'job-1',
      jobClientId: null,
      clientId: 'invented',
      companyClients: [acme],
    })).toEqual({
      action: 'miss',
      reason: 'unknown_client',
      message: JOB_CLIENT_ATTACH_UNKNOWN,
    });
    expect(decideJobClientAttach({
      jobId: 'job-1',
      jobClientId: null,
      clientId: '',
      companyClients: [acme],
    })).toMatchObject({ action: 'miss', reason: 'no_selection', message: JOB_CLIENT_ATTACH_NO_SELECTION });
    expect(decideJobClientAttach({
      jobId: 'job-1',
      jobClientId: null,
      clientId: 'c1',
      companyClients: [],
    })).toMatchObject({ action: 'miss', reason: 'no_clients', message: JOB_CLIENT_ATTACH_NO_CLIENTS });
    expect(decideJobClientAttach({
      jobId: 'job-1',
      jobClientId: null,
      clientId: 'c-arch',
      companyClients: [{ id: 'c-arch', name: 'Old Co', archived: true }],
    })).toMatchObject({ action: 'miss', reason: 'no_clients' });
  });

  it('does not clobber a job that already has client_id', () => {
    expect(decideJobClientAttach({
      jobId: 'job-1',
      jobClientId: 'c1',
      clientId: 'c2',
      companyClients: [acme, brooks],
    })).toEqual({
      action: 'miss',
      reason: 'already_linked',
      message: JOB_CLIENT_ATTACH_ALREADY,
    });
  });

  it('misses without a job id', () => {
    expect(decideJobClientAttach({
      jobId: null,
      jobClientId: null,
      clientId: 'c1',
      companyClients: [acme],
    })).toEqual({
      action: 'miss',
      reason: 'no_job',
      message: JOB_CLIENT_ATTACH_NO_JOB,
    });
  });
});

describe('after attach — signed #49 email / #50 phone / Send unchanged', () => {
  it('reuses the #49 email field when the attached client has no sendable email', () => {
    expect(jobClientAttachRow({
      jobClientId: 'c1',
      companyClients: [acme],
    }).kind).toBe('linked');
    expect(jobClientEmailRow({
      clientId: 'c1',
      client: { id: 'c1', email: null },
    })).toEqual({ kind: 'edit', clientId: 'c1', email: '' });
    expect(jobClientEmailRow({
      clientId: 'c1',
      client: { id: 'c1', email: '  ' },
    }).kind).toBe('edit');
  });

  it('shows the signed To when the attached client already has email', () => {
    expect(jobClientEmailRow({
      clientId: 'c1',
      client: { id: 'c1', email: 'jane@acme.com.au' },
    })).toEqual({ kind: 'mailto', clientId: 'c1', email: 'jane@acme.com.au' });
    expect(prefillReminderTo({ id: 'c1', email: 'jane@acme.com.au' })).toBe('jane@acme.com.au');
  });

  it('reuses the #50 phone field when the attached client has no sendable phone', () => {
    expect(jobClientPhoneRow({
      clientId: 'c1',
      client: { id: 'c1', phone: null },
    })).toEqual({ kind: 'edit', clientId: 'c1', phone: '' });
    expect(jobClientPhoneRow({
      clientId: 'c1',
      client: { id: 'c1', phone: '  ' },
    }).kind).toBe('edit');
  });

  it('shows the signed SMS To when the attached client already has phone', () => {
    expect(jobClientPhoneRow({
      clientId: 'c1',
      client: { id: 'c1', phone: '0412 345 678' },
    })).toEqual({ kind: 'tel', clientId: 'c1', phone: '0412 345 678' });
    expect(prefillSmsTo('0412 345 678')).toBe('+61412345678');
  });

  it('does not invent a send gate — attach leaves decideReminderSend as signed', () => {
    const noClient = decideReminderSend({
      ...base,
      job: job({ client_id: null }),
      client: null,
      settings: smtp,
    });
    expect(noClient.send).toBe(false);
    if (!noClient.send) {
      expect(noClient.reason).toBe('no_email');
      expect(noClient.message).toBe(missMessage('no_email'));
    }

    const afterNoEmail = decideReminderSend({
      ...base,
      job: job(),
      client: client({ email: null, phone: null }),
      settings: smtp,
    });
    expect(afterNoEmail.send).toBe(false);
    if (!afterNoEmail.send) expect(afterNoEmail.reason).toBe('no_email');

    const afterReady = decideReminderSend({
      ...base,
      job: job(),
      client: client(),
      settings: smtp,
    });
    expect(afterReady.send).toBe(true);

    expect(jobClientAttachToast()).toEqual({
      message: JOB_CLIENT_ATTACH_SAVED,
      kind: 'success',
    });
    expect(JOB_CLIENT_ATTACH_SAVED).not.toMatch(/sent/i);
    expect(JOB_CLIENT_ATTACH_SAVED).not.toMatch(/sms/i);
    expect(JOB_CLIENT_ATTACH_SAVED).not.toMatch(/email/i);
  });

  it('hides email / phone editors when there is no client — does not invent one', () => {
    expect(jobClientEmailRow({ clientId: null, client: null }).kind).toBe('none');
    expect(jobClientPhoneRow({ clientId: null, client: null }).kind).toBe('none');
    expect(jobClientEmailRow({ clientId: '', client: { id: 'c1', email: null } }).kind).toBe('none');
    expect(jobClientPhoneRow({ clientId: '', client: { id: 'c1', phone: null } }).kind).toBe('none');
  });
});

describe('24h reminder attach client — wiring', () => {
  it('writes jobs.client_id on this job via attachJobClient and does not invent a client', () => {
    const attach = src('src/lib/attachJobClient.ts');
    const reminder = src('src/components/jobs/JobClientReminder.tsx');
    const handleStart = reminder.indexOf('const attachClient');
    const handleEnd = reminder.indexOf('const saveEmail');
    expect(handleStart).toBeGreaterThan(-1);
    expect(handleEnd).toBeGreaterThan(handleStart);
    const handle = reminder.slice(handleStart, handleEnd);
    const handleSendFn = reminder.slice(
      reminder.indexOf('const send = useMutation'),
      reminder.indexOf('const sentAt'),
    );

    expect(attach).toContain("from('jobs')");
    expect(attach).toContain('update({ client_id:');
    expect(attach).toContain('.eq(\'id\', decision.jobId)');
    expect(attach).toContain('decideJobClientAttach');
    expect(attach).toContain('companyClientsForAttach');
    expect(attach).not.toContain('insert({');
    expect(attach).not.toContain("from('clients')");
    expect(attach).not.toContain('CREATE TABLE');
    expect(attach).not.toContain('ALTER TABLE');
    expect(attach).not.toContain('cron.schedule');
    expect(attach).not.toContain('JobClientReminder');
    expect(attach).not.toContain("functions.invoke('job-reminder'");

    expect(reminder).toContain('attachJobClient');
    expect(reminder).toContain('jobClientAttachRow');
    expect(reminder).toContain('jobClientAttachToast');
    expect(reminder).toContain('attachClient.mutate()');
    expect(reminder).toContain('job-client-attach');
    expect(reminder).toContain('job-client-attach-save');
    expect(reminder).toContain('aria-label="Attach client"');
    expect(reminder).toContain("kind === 'pick'");
    expect(reminder).toContain("kind === 'miss'");
    expect(reminder).toContain('JOB_CLIENT_ATTACH_NO_CLIENTS');
    expect(reminder).toContain('No clients to attach');
    expect(reminder).toContain('noClientMiss');
    expect(reminder).toContain('noClientsNamedMiss');
    expect(reminder).toContain("from('clients')");
    expect(reminder).toContain("eq('archived', false)");
    expect(reminder).toContain("eq('company_id', companyId)");
    expect(reminder).toContain("queryKey: ['job-attach-clients'");
    expect(reminder).toContain('jobClientAttachRow({');
    expect(reminder).toContain('jobClientId: job.client_id');
    expect(reminder).not.toContain('ClientAttachDialog');
    expect(reminder).not.toContain('AttachClientDialog');
    expect(reminder).not.toContain('ReminderAttachDialog');
    expect(reminder).not.toContain('Create client');
    expect(reminder).not.toContain('AU_EMAIL_PLACEHOLDER');
    expect(reminder).not.toContain('No client (walk-up)');
    expect(reminder).not.toContain('className="btn-primary job-client-attach-save"');
    expect(reminder).not.toContain('className="ops-next-control-block job-client-attach-save"');

    expect(handle).toContain('attachJobClient');
    expect(handle).toContain('job.id');
    expect(handle).toContain('job.client_id');
    expect(handle).toContain('clientAttachDraft');
    expect(handle).toContain("invalidateQueries({ queryKey: ['job', job.id] })");
    expect(handle).toContain("invalidateQueries({ queryKey: ['job-client', result.clientId] })");
    expect(handle).not.toContain("functions.invoke('job-reminder'");
    expect(handle).not.toContain('send.mutate');
    expect(handle).not.toContain('insert({');
    expect(handle).not.toContain('client_reminder_sent_at');
    expect(handle).not.toContain('cron.schedule');
    expect(handle).not.toContain('saveJobClientEmail');
    expect(handle).not.toContain('saveJobClientPhone');

    expect(handleSendFn).toContain("functions.invoke('job-reminder'");
    expect(handleSendFn).not.toContain('attachJobClient');
    expect(handleSendFn).toContain('if (!decision.send)');
  });

  it('reuses the signed #49 email field and #50 phone field after attach — does not invent a second editor', () => {
    const reminder = src('src/components/jobs/JobClientReminder.tsx');
    expect(reminder).toContain('jobClientEmailRow({');
    expect(reminder).toContain('clientId: job.client_id');
    expect(reminder).toContain('client: liveClient');
    expect(reminder).toContain("emailRow.kind === 'edit'");
    expect(reminder).toContain('job-client-email');
    expect(reminder).toContain('job-client-email-save');
    expect(reminder).toContain('saveJobClientEmail');
    expect(reminder).toContain('saveEmail.mutate()');
    expect(reminder).toContain('JOB_REMINDER_NO_EMAIL_FIELD');
    expect(reminder).toContain('jobClientPhoneRow({');
    expect(reminder).toContain("phoneRow.kind === 'edit'");
    expect(reminder).toContain('job-client-phone');
    expect(reminder).toContain('job-client-phone-save');
    expect(reminder).toContain('saveJobClientPhone');
    expect(reminder).toContain('savePhone.mutate()');
    expect(reminder).toContain('JOB_REMINDER_NO_PHONE_FIELD');
    expect(reminder.match(/job-client-email-save/g)?.length).toBeGreaterThanOrEqual(1);
    expect(reminder.match(/job-client-phone-save/g)?.length).toBeGreaterThanOrEqual(1);
    expect(reminder).not.toContain('job-client-attach-email');
    expect(reminder).not.toContain('job-client-attach-phone');
    expect(reminder).not.toContain('ClientEmailDialog');
    expect(reminder).not.toContain('ClientPhoneDialog');
  });

  it('does not add a second 44px — Save is muted on the miss, primary stays Send tomorrow reminder', () => {
    const reminder = src('src/components/jobs/JobClientReminder.tsx');
    const css = src('src/index.css');
    const reminderCssStart = css.indexOf('#job-schedule .job-reminder .job-client-attach');
    expect(reminderCssStart).toBeGreaterThan(-1);
    const reminderCss = css.slice(reminderCssStart, css.indexOf('/* end reminder client attach */'));

    expect(reminder).toContain('className="btn-primary"');
    expect(reminder).toContain('Send tomorrow reminder');
    expect(reminder).toContain('job-client-attach-save');
    expect(reminder).toContain('disabled={awaitingSmtp || !decision.send || send.isPending}');
    expect(reminder).not.toContain('Open client');
    expect(reminder).not.toContain('Add a client');
    expect(reminder).not.toContain('className="btn-primary job-client-attach-save"');
    expect(reminderCss).toContain('.job-client-attach-save');
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
    expect(reminderCss).toMatch(/\.job-client-attach-save[\s\S]*color: #5B6B7C/);

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

  it('does not change Send tomorrow reminder enablement — attach does not invent a send gate', () => {
    const reminder = src('src/components/jobs/JobClientReminder.tsx');
    const handle = reminder.slice(
      reminder.indexOf('const attachClient'),
      reminder.indexOf('const saveEmail'),
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
    expect(handle).toContain('attachJobClient');
    expect(handle).not.toContain("functions.invoke('job-reminder'");
    expect(handle).not.toContain('send.mutate');
    expect(handleSendFn).toContain("functions.invoke('job-reminder'");
    expect(handleSendFn).not.toContain('attachJobClient');

    const stillMiss = decideReminderSend({
      ...base,
      job: job({ client_id: null }),
      client: null,
      settings: smtp,
    });
    expect(stillMiss.send).toBe(false);
    const afterAttachNoEmail = decideReminderSend({
      ...base,
      job: job(),
      client: client({ email: null }),
      settings: smtp,
    });
    expect(afterAttachNoEmail.send).toBe(false);
    const afterAttachReady = decideReminderSend({
      ...base,
      job: job(),
      client: client(),
      settings: smtp,
    });
    expect(afterAttachReady.send).toBe(true);
  });

  it('leaves the signed #49 email / #50 phone fields and job-sheet / invoice-sheet / report-send signed', () => {
    const reminder = src('src/components/jobs/JobClientReminder.tsx');
    const page = src('src/pages/JobDetailPage.tsx');
    const invoicesPage = src('src/pages/InvoicesPage.tsx');
    const dialog = src('src/components/inspection/ReportSendDialog.tsx');
    const due = src('src/components/inspection/InspectionDueReminder.tsx');

    expect(reminder).toContain('saveJobClientEmail');
    expect(reminder).toContain('jobClientEmailRow');
    expect(reminder).toContain('job-client-email');
    expect(reminder).toContain('job-client-email-save');
    expect(reminder).toContain('JOB_REMINDER_NO_EMAIL_FIELD');
    expect(reminder).toContain('saveJobClientPhone');
    expect(reminder).toContain('jobClientPhoneRow');
    expect(reminder).toContain('job-client-phone');
    expect(reminder).toContain('job-client-phone-save');
    expect(reminder).toContain('JOB_REMINDER_NO_PHONE_FIELD');
    expect(reminder).toContain('SMS To');
    expect(reminder).toContain('aria-label="Reminder SMS To"');
    expect(reminder).toContain('prefillSmsTo(liveClient?.phone)');

    expect(page).toContain('attachJobClient');
    expect(page).toContain('jobClientAttachRow({');
    expect(page).toContain('JobClientReminder');
    expect(invoicesPage).toContain('attachInvoiceClient');
    expect(dialog).toContain('attachReportClient');
    expect(due).not.toContain('attachJobClient');
    expect(due).not.toContain('job-client-attach');
    expect(due).not.toContain('jobClientAttachRow');
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
    expect(logic).not.toContain('attachJobClient');
    expect(logic).not.toContain('jobClientAttachRow');
    expect(cron).not.toContain('attachJobClient');
    expect(cron057).not.toContain('attachJobClient');
    expect(edge).not.toContain('attachJobClient');
    expect(cron).toContain('SELECT public.invoke_job_client_reminders()');
    expect(cron).toContain('{"due":"tomorrow","source":"cron"}');
  });

  it('keeps the existing no-client miss and puts the attach control on this tray — does not bounce to the client record', () => {
    const reminder = src('src/components/jobs/JobClientReminder.tsx');
    expect(reminder).toContain('noClientMiss');
    expect(reminder).toContain("kind === 'pick'");
    expect(reminder).toContain('job-client-attach');
    expect(src('src/lib/jobReminder.ts')).toContain('This client has no email — reminder was not sent.');
    const tos = reminder.indexOf('<div className="job-reminder-tos">');
    const missSlot = reminder.indexOf('{awaitingSmtp ? (');
    const attach = reminder.indexOf('{attachRow.kind === \'pick\' && (');
    expect(tos).toBeGreaterThan(-1);
    expect(missSlot).toBeGreaterThan(tos);
    expect(attach).toBeGreaterThan(missSlot);
    expect(reminder).not.toContain('Add one on the client record');
    expect(reminder).not.toContain('client record');
    expect(reminder).not.toContain('/clients/');
    expect(reminder).not.toContain('Open client');
  });

  it('shows one honest No clients to attach miss — no fake picker', () => {
    const reminder = src('src/components/jobs/JobClientReminder.tsx');
    expect(reminder).toContain('noClientsNamedMiss');
    expect(reminder).toContain('JOB_CLIENT_ATTACH_NO_CLIENTS');
    expect(reminder).toContain("kind === 'miss'");
    expect(JOB_CLIENT_ATTACH_NO_CLIENTS).toBe('No clients to attach');
    expect(reminder).toContain('noClientsNamedMiss && !decision.send && decision.reason === \'no_email\'');
    expect(reminder).toContain("kind === 'pick'");
    expect(reminder).not.toContain('Create client');
    expect(reminder).not.toContain('No client (walk-up)');
  });

  it('already-has-client keeps the signed To / SMS To — no picker', () => {
    const reminder = src('src/components/jobs/JobClientReminder.tsx');
    expect(reminder).toContain('jobClientAttachRow({');
    expect(reminder).toContain('jobClientId: job.client_id');
    expect(jobClientAttachRow({
      jobClientId: 'c1',
      companyClients: [acme, brooks],
    }).kind).toBe('linked');
    expect(jobClientEmailRow({
      clientId: 'c1',
      client: { id: 'c1', email: 'alex@acme.example' },
    }).kind).toBe('mailto');
    expect(jobClientPhoneRow({
      clientId: 'c1',
      client: { id: 'c1', phone: '0412 345 678' },
    }).kind).toBe('tel');
    const linkedNoEmail = decideReminderSend({
      ...base,
      job: job(),
      client: client({ email: null, phone: null }),
      settings: smtp,
    });
    expect(linkedNoEmail.send).toBe(false);
    if (!linkedNoEmail.send) expect(linkedNoEmail.reason).toBe('no_email');
    expect(reminder).toContain("emailRow.kind === 'edit'");
    expect(reminder).toContain("phoneRow.kind === 'edit'");
  });

  it('leaves quote convert / PR #17 off this control', () => {
    const attach = src('src/lib/attachJobClient.ts');
    const reminder = src('src/components/jobs/JobClientReminder.tsx');
    const quoteConvert = src('src/lib/convertQuoteToInvoice.ts');
    const quotesPage = src('src/pages/QuotesPage.tsx');
    const quoteNext = src('src/lib/quoteNextAction.ts');
    expect(attach).not.toContain('convertQuoteToInvoice');
    expect(attach).not.toContain('sendQuote');
    expect(attach).not.toContain('QuoteSendDialog');
    expect(quoteConvert).not.toContain('attachJobClient');
    expect(quotesPage).not.toContain('attachJobClient');
    expect(quoteNext).not.toContain('attachJobClient');
    expect(reminder).not.toContain('QuoteSendDialog');
    expect(reminder).not.toContain('sendQuote');
    expect(reminder).not.toContain('sendQuoteDeliver');
    expect(reminder).not.toContain('convertQuoteToInvoice');
  });
});
