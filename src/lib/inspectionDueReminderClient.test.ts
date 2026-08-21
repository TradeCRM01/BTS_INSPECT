import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clientEmailForSend, clientPhoneForSms } from './sendInvoice';
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
import {
  JOB_CLIENT_EMAIL_NO_CLIENT,
  decideJobClientEmailSave,
  jobClientEmailRow,
  jobClientEmailToStore,
} from './saveJobClientEmail';
import {
  JOB_CLIENT_PHONE_NO_CLIENT,
  decideJobClientPhoneSave,
  jobClientPhoneRow,
  jobClientPhoneToStore,
} from './saveJobClientPhone';
import {
  decideInspectionDueSend,
  missInspectionDueMessage,
  resolveInspectionClientId,
  type DueInspection,
  type DueInspectionJob,
} from './inspectionDueReminder';
import {
  prefillReminderTo,
  prefillSmsTo,
  type ReminderClient,
  type ReminderEmailSettings,
} from './jobReminder';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

/** 16:00 Friday 21 Aug 2026 in Australia/Perth (08:00 UTC). Today in Perth is 21 Aug. */
const now = new Date('2026-08-21T08:00:00.000Z');
const today = '2026-08-21';

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
  mode: 'manual' as const,
};

const acme = { id: 'c1', name: 'Acme Electrical' };
const brooks = { id: 'c2', name: 'Brooks Plumbing' };

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
    meta: { next_test_date: today },
    responses: {},
    template_snapshot: { name: 'RCD test' },
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

describe('due-test reminder client email — save / miss', () => {
  it('reuses saveJobClientEmail on this inspection client_id — blank stays empty, no second client', () => {
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
    expect(resolveInspectionClientId(insp({ client_id: null }), job({ client_id: null }))).toBeNull();
    const miss = decideInspectionDueSend({
      ...base,
      inspection: insp({ client_id: null }),
      job: job({ client_id: null }),
      client: null,
      settings: smtp,
    });
    expect(miss.send).toBe(false);
    if (miss.send) return;
    expect(miss.reason).toBe('no_email');
    expect(miss.message).toBe(missInspectionDueMessage('no_email'));
  });

  it('keeps blank / invalid as an honest no_email miss — Send uses a real saved address', () => {
    expect(clientEmailForSend(jobClientEmailToStore(''))).toBeNull();
    expect(clientEmailForSend(jobClientEmailToStore('not-an-email'))).toBeNull();
    expect(clientEmailForSend(jobClientEmailToStore('jane@acme.com.au'))).toBe('jane@acme.com.au');
    expect(missInspectionDueMessage('no_email')).toMatch(/no email/i);

    const afterBlank = decideInspectionDueSend({
      ...base,
      inspection: insp(),
      job: job(),
      client: client({ email: jobClientEmailToStore('') }),
      settings: smtp,
    });
    expect(afterBlank.send).toBe(false);
    if (!afterBlank.send) expect(afterBlank.reason).toBe('no_email');

    const afterInvalid = decideInspectionDueSend({
      ...base,
      inspection: insp(),
      job: job(),
      client: client({ email: jobClientEmailToStore('not-an-email') }),
      settings: smtp,
    });
    expect(afterInvalid.send).toBe(false);
    if (!afterInvalid.send) expect(afterInvalid.reason).toBe('no_email');

    const afterSave = decideInspectionDueSend({
      ...base,
      inspection: insp(),
      job: job(),
      client: client({ email: jobClientEmailToStore('jane@acme.com.au') }),
      settings: smtp,
    });
    expect(afterSave.send).toBe(true);
    if (!afterSave.send) return;
    expect(afterSave.to).toBe('jane@acme.com.au');
  });
});

describe('due-test reminder client phone — save / miss', () => {
  it('reuses saveJobClientPhone on this inspection client_id — blank stays empty, no second client', () => {
    expect(decideJobClientPhoneSave({ clientId: 'c1', phone: '  0412 345 678  ' })).toEqual({
      action: 'write',
      clientId: 'c1',
      phone: '0412 345 678',
    });
    expect(decideJobClientPhoneSave({ clientId: 'c1', phone: '' })).toEqual({
      action: 'write',
      clientId: 'c1',
      phone: null,
    });
    expect(decideJobClientPhoneSave({ clientId: null, phone: '0412 345 678' })).toEqual({
      action: 'miss',
      reason: 'no_client',
      message: JOB_CLIENT_PHONE_NO_CLIENT,
    });
    expect(jobClientPhoneRow({ clientId: null, client: { id: 'c1', phone: null } }).kind).toBe('none');
    expect(jobClientPhoneRow({ clientId: 'c1', client: null }).kind).toBe('none');
    expect(jobClientPhoneRow({
      clientId: 'c1',
      client: { id: 'c1', phone: null },
    })).toEqual({ kind: 'edit', clientId: 'c1', phone: '' });
  });

  it('opens the write field when the existing client has no sendable phone — invalid stays an honest miss', () => {
    expect(jobClientPhoneRow({
      clientId: 'c1',
      client: { id: 'c1', phone: null },
    })).toEqual({ kind: 'edit', clientId: 'c1', phone: '' });
    expect(jobClientPhoneRow({
      clientId: 'c1',
      client: { id: 'c1', phone: 'call me' },
    })).toEqual({ kind: 'edit', clientId: 'c1', phone: 'call me' });
    expect(clientPhoneForSms(jobClientPhoneToStore(''))).toBeNull();
    expect(clientPhoneForSms(jobClientPhoneToStore('call me'))).toBeNull();
    expect(prefillSmsTo(jobClientPhoneToStore('not-a-phone'))).toBe('');
  });

  it('already-has-phone stays the signed SMS To — does not replace a good number with an empty editor', () => {
    expect(jobClientPhoneRow({
      clientId: 'c1',
      client: { id: 'c1', phone: '  0412 345 678  ' },
    })).toEqual({ kind: 'tel', clientId: 'c1', phone: '0412 345 678' });
    expect(prefillSmsTo('0412 345 678')).toBe('+61412345678');
  });

  it('hides the editor when there is no client — does not invent one', () => {
    expect(jobClientPhoneRow({ clientId: null, client: null }).kind).toBe('none');
    expect(jobClientPhoneRow({ clientId: '', client: { id: 'c1', phone: null } }).kind).toBe('none');
    const miss = decideInspectionDueSend({
      ...base,
      inspection: insp({ client_id: null }),
      job: job({ client_id: null }),
      client: null,
      settings: smtp,
    });
    expect(miss.send).toBe(false);
    if (miss.send) return;
    expect(miss.reason).toBe('no_email');
    expect(prefillSmsTo(null)).toBe('');
  });

  it('does not invent a send gate — phone write leaves decideInspectionDueSend as signed', () => {
    const readyNoPhone = decideInspectionDueSend({
      ...base,
      inspection: insp(),
      job: job(),
      client: client({ email: 'alex@acme.example', phone: null }),
      settings: smtp,
    });
    expect(readyNoPhone.send).toBe(true);

    const readyWithPhone = decideInspectionDueSend({
      ...base,
      inspection: insp(),
      job: job(),
      client: client({ email: 'alex@acme.example', phone: '0412 345 678' }),
      settings: smtp,
    });
    expect(readyWithPhone.send).toBe(true);

    const stillEmailMiss = decideInspectionDueSend({
      ...base,
      inspection: insp(),
      job: job(),
      client: client({ email: null, phone: jobClientPhoneToStore('0412 345 678') }),
      settings: smtp,
    });
    expect(stillEmailMiss.send).toBe(false);
    if (!stillEmailMiss.send) expect(stillEmailMiss.reason).toBe('no_email');
  });
});

describe('due-test reminder attach client — save / miss', () => {
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
    expect(JOB_CLIENT_ATTACH_NO_CLIENTS).toBe('No clients to attach');
  });

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

  it('does not invent a send gate — attach leaves decideInspectionDueSend as signed', () => {
    const noClient = decideInspectionDueSend({
      ...base,
      inspection: insp({ client_id: null }),
      job: job({ client_id: null }),
      client: null,
      settings: smtp,
    });
    expect(noClient.send).toBe(false);
    if (!noClient.send) {
      expect(noClient.reason).toBe('no_email');
      expect(noClient.message).toBe(missInspectionDueMessage('no_email'));
    }

    const afterNoEmail = decideInspectionDueSend({
      ...base,
      inspection: insp(),
      job: job(),
      client: client({ email: null, phone: null }),
      settings: smtp,
    });
    expect(afterNoEmail.send).toBe(false);
    if (!afterNoEmail.send) expect(afterNoEmail.reason).toBe('no_email');

    const afterReady = decideInspectionDueSend({
      ...base,
      inspection: insp(),
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
  });

  it('hides email / phone editors when there is no client — does not invent one', () => {
    expect(jobClientEmailRow({ clientId: null, client: null }).kind).toBe('none');
    expect(jobClientPhoneRow({ clientId: null, client: null }).kind).toBe('none');
  });
});

describe('due-test reminder contact write — wiring', () => {
  it('saves clients.email on the existing due-test miss via saveJobClientEmail and does not auto-send', () => {
    const save = src('src/lib/saveJobClientEmail.ts');
    const due = src('src/components/inspection/InspectionDueReminder.tsx');
    const logic = src('src/lib/inspectionDueReminder.ts');
    const handleSaveStart = due.indexOf('const saveEmail');
    const handleSaveEnd = due.indexOf('const savePhone');
    expect(handleSaveStart).toBeGreaterThan(-1);
    expect(handleSaveEnd).toBeGreaterThan(handleSaveStart);
    const handle = due.slice(handleSaveStart, handleSaveEnd);
    const handleSendFn = due.slice(due.indexOf('const send = useMutation'), due.indexOf('const sentAt'));

    expect(save).toContain("from('clients')");
    expect(save).toContain('update({ email:');
    expect(save).not.toContain('insert({');
    expect(due).toContain('saveJobClientEmail');
    expect(due).toContain('jobClientEmailRow');
    expect(due).toContain('jobClientEmailSaveToast');
    expect(due).toContain('saveEmail.mutate()');
    expect(due).toContain('job-client-email');
    expect(due).toContain('job-client-email-save');
    expect(due).toContain('aria-label="Client email"');
    expect(due).toContain('clientId: resolvedClientId');
    expect(due).toContain('id: liveClient.id');
    expect(due).toContain('email: liveClient.email ?? null');
    expect(due).not.toContain('ClientEmailDialog');
    expect(due).not.toContain('className="btn-primary job-client-email-save"');
    expect(handle).toContain('saveJobClientEmail');
    expect(handle).toContain('emailRow.clientId');
    expect(handle).toContain('clientEmailDraft');
    expect(handle).not.toContain("functions.invoke('job-reminder'");
    expect(handle).not.toContain('send.mutate');
    expect(handleSendFn).toContain("functions.invoke('job-reminder'");
    expect(handleSendFn).not.toContain('saveJobClientEmail');
    expect(handleSendFn).toContain('if (!decision.send)');
    expect(logic).not.toContain('saveJobClientEmail');
  });

  it('saves clients.phone on the existing due-test SMS To via saveJobClientPhone and does not auto-send or auto-SMS', () => {
    const save = src('src/lib/saveJobClientPhone.ts');
    const due = src('src/components/inspection/InspectionDueReminder.tsx');
    const logic = src('src/lib/inspectionDueReminder.ts');
    const handle = due.slice(due.indexOf('const savePhone'), due.indexOf('const send = useMutation'));
    const handleSendFn = due.slice(due.indexOf('const send = useMutation'), due.indexOf('const sentAt'));

    expect(save).toContain("from('clients')");
    expect(save).toContain('update({ phone:');
    expect(save).not.toContain('insert({');
    expect(save).not.toContain('sendSms');
    expect(due).toContain('saveJobClientPhone');
    expect(due).toContain('jobClientPhoneRow');
    expect(due).toContain('jobClientPhoneSaveToast');
    expect(due).toContain('savePhone.mutate()');
    expect(due).toContain('job-client-phone');
    expect(due).toContain('job-client-phone-save');
    expect(due).toContain('aria-label="Client phone"');
    expect(due).not.toContain('ClientPhoneDialog');
    expect(due).not.toContain('className="btn-primary job-client-phone-save"');
    expect(handle).toContain('saveJobClientPhone');
    expect(handle).toContain('phoneRow.clientId');
    expect(handle).toContain('clientPhoneDraft');
    expect(handle).not.toContain("functions.invoke('job-reminder'");
    expect(handle).not.toContain('send.mutate');
    expect(handle).not.toContain('sendSms');
    expect(handleSendFn).not.toContain('saveJobClientPhone');
    expect(logic).not.toContain('saveJobClientPhone');
  });

  it('writes jobs.client_id on this job via attachJobClient and does not invent a client', () => {
    const attach = src('src/lib/attachJobClient.ts');
    const due = src('src/components/inspection/InspectionDueReminder.tsx');
    const handle = due.slice(due.indexOf('const attachClient'), due.indexOf('const saveEmail'));

    expect(attach).toContain("from('jobs')");
    expect(attach).toContain('update({ client_id:');
    expect(attach).not.toContain('insert({');
    expect(due).toContain('attachJobClient');
    expect(due).toContain('jobClientAttachRow');
    expect(due).toContain('companyClientsForAttach');
    expect(due).toContain('jobClientAttachToast');
    expect(due).toContain('attachClient.mutate()');
    expect(due).toContain('job-client-attach');
    expect(due).toContain('job-client-attach-save');
    expect(due).toContain('aria-label="Attach client"');
    expect(due).toContain("kind === 'pick'");
    expect(due).toContain("kind === 'miss'");
    expect(due).toContain('JOB_CLIENT_ATTACH_NO_CLIENTS');
    expect(due).toContain("queryKey: ['due-attach-clients'");
    expect(due).toContain("eq('archived', false)");
    expect(due).not.toContain('ClientAttachDialog');
    expect(due).not.toContain('Create client');
    expect(due).not.toContain('No client (walk-up)');
    expect(handle).toContain('attachJobClient');
    expect(handle).toContain('job?.id');
    expect(handle).toContain('clientAttachDraft');
    expect(handle).not.toContain("functions.invoke('job-reminder'");
    expect(handle).not.toContain('send.mutate');
    expect(handle).not.toContain('insert({');
  });

  it('does not add a second 44px — Save is muted, primary stays Send due reminder', () => {
    const due = src('src/components/inspection/InspectionDueReminder.tsx');
    const css = src('src/index.css');
    const emailCss = css.slice(
      css.indexOf('#inspection-due .job-client-email'),
      css.indexOf('/* end due reminder client email */'),
    );
    const phoneCss = css.slice(
      css.indexOf('#inspection-due .job-client-phone'),
      css.indexOf('/* end due reminder client phone */'),
    );
    const attachCss = css.slice(
      css.indexOf('#inspection-due .job-client-attach'),
      css.indexOf('/* end due reminder client attach */'),
    );

    expect(due).toContain('className="btn-primary"');
    expect(due).toContain('Send due reminder');
    expect(due).toContain('disabled={awaitingSmtp || !decision.send || send.isPending}');
    expect(due).not.toContain('className="btn-primary job-client-email-save"');
    expect(due).not.toContain('className="btn-primary job-client-phone-save"');
    expect(due).not.toContain('className="btn-primary job-client-attach-save"');
    expect(due).not.toContain('Open client');

    for (const reminderCss of [emailCss, phoneCss, attachCss]) {
      expect(reminderCss).not.toContain('min-height: 44px');
      expect(reminderCss).not.toContain('min-h-[44px]');
      expect(reminderCss).not.toContain('ops-next-control');
      expect(reminderCss).not.toContain('btn-primary');
      expect(reminderCss).toContain('font-size: 12px');
      expect(reminderCss).toContain('#D5DCE3');
      expect(reminderCss).toContain('gap: 8px');
      expect(reminderCss).toContain('#5B6B7C');
      expect(reminderCss).toContain('#0A2540');
      expect(reminderCss).not.toContain('indigo-500');
      expect(reminderCss).not.toContain('sky-500');
    }
    expect(emailCss).toMatch(/\.job-client-email-save[\s\S]*color: #5B6B7C/);
    expect(phoneCss).toMatch(/\.job-client-phone-save[\s\S]*color: #5B6B7C/);
    expect(attachCss).toMatch(/\.job-client-attach-save[\s\S]*color: #5B6B7C/);

    const primaryCss = css.slice(
      css.indexOf('#inspection-due .btn-primary'),
      css.indexOf('#inspection-due .job-reminder-body'),
    );
    expect(primaryCss).toContain('.btn-primary:disabled');
    expect(primaryCss).toContain('.btn-primary:disabled:hover');
    expect(primaryCss).toContain('opacity: 0.45');
    expect(primaryCss).toContain('cursor: not-allowed');
    expect(primaryCss).toMatch(/\.btn-primary:disabled:hover[\s\S]*background: #2E75B6/);
    expect(due).not.toContain('indigo-500');
    expect(due).not.toContain('sky-500');
  });

  it('does not change Send due reminder enablement — writes do not invent a send gate', () => {
    const due = src('src/components/inspection/InspectionDueReminder.tsx');
    const sendBtn = due.slice(
      due.indexOf('<div className="job-reminder-act">'),
      due.indexOf('<details className="job-reminder-more">'),
    );
    const handleSendFn = due.slice(due.indexOf('const send = useMutation'), due.indexOf('const sentAt'));

    expect(sendBtn).toContain('Send due reminder');
    expect(sendBtn).toContain('disabled={awaitingSmtp || !decision.send || send.isPending}');
    expect(handleSendFn).toContain("functions.invoke('job-reminder'");
    expect(handleSendFn).toContain('if (!decision.send)');
    expect(handleSendFn).not.toContain('saveJobClientEmail');
    expect(handleSendFn).not.toContain('saveJobClientPhone');
    expect(handleSendFn).not.toContain('attachJobClient');

    expect(decideInspectionDueSend({
      ...base,
      inspection: insp({ client_id: null }),
      job: job({ client_id: null }),
      client: null,
      settings: smtp,
    }).send).toBe(false);
    expect(decideInspectionDueSend({
      ...base,
      inspection: insp(),
      job: job(),
      client: client({ email: null }),
      settings: smtp,
    }).send).toBe(false);
    expect(decideInspectionDueSend({
      ...base,
      inspection: insp(),
      job: job(),
      client: client({ email: 'alex@acme.example', phone: null }),
      settings: smtp,
    }).send).toBe(true);
  });

  it('points the no_email / no_phone / no-client misses at the field — miss first, then the quiet field or picker', () => {
    const due = src('src/components/inspection/InspectionDueReminder.tsx');
    expect(due).toContain('DUE_REMINDER_NO_EMAIL_FIELD');
    expect(due).toContain('DUE_REMINDER_NO_PHONE_FIELD');
    expect(due).toContain('DUE_REMINDER_NO_CLIENT_FIELD');
    expect(due).toContain('This client has no email. Add one below before you send.');
    expect(due).toContain('This client has no phone. Add one below before you send.');
    expect(due).toContain('This job has no client. Add one below before you send.');
    expect(due).toContain('noEmailFieldMiss');
    expect(due).toContain('noPhoneFieldMiss');
    expect(due).toContain('noClientFieldMiss');
    expect(due).toContain('noClientMiss');

    const emailMiss = due.indexOf('{noEmailFieldMiss && (');
    const phoneMiss = due.indexOf('{noPhoneFieldMiss && (');
    const clientMiss = due.indexOf('{noClientFieldMiss && (');
    const attach = due.indexOf('{attachRow.kind === \'pick\' && (');
    const tos = due.indexOf('<div className="job-reminder-tos">');
    expect(emailMiss).toBeGreaterThan(-1);
    expect(phoneMiss).toBeGreaterThan(emailMiss);
    expect(clientMiss).toBeGreaterThan(phoneMiss);
    expect(attach).toBeGreaterThan(clientMiss);
    expect(tos).toBeGreaterThan(attach);

    expect(due).not.toContain('Add one on the client record');
    expect(due).not.toContain('client record');
    expect(due).not.toContain('/clients/');
    expect(due).not.toContain('Open client');
    expect(src('src/lib/inspectionDueReminder.ts')).toContain('This client has no email — reminder was not sent.');
    expect(src('src/lib/jobReminder.ts')).toContain('This client has no phone — SMS was not sent.');
  });

  it('shows one honest No clients to attach miss — no fake picker', () => {
    const due = src('src/components/inspection/InspectionDueReminder.tsx');
    expect(due).toContain('noClientsNamedMiss');
    expect(due).toContain('JOB_CLIENT_ATTACH_NO_CLIENTS');
    expect(due).toContain("kind === 'miss'");
    expect(JOB_CLIENT_ATTACH_NO_CLIENTS).toBe('No clients to attach');
    expect(due).toContain('noClientsNamedMiss && !decision.send && decision.reason === \'no_email\'');
    expect(due).toContain('noEmailFieldMiss || noClientFieldMiss || noClientsNamedMiss');
    expect(due).not.toContain('Create client');
    expect(due).not.toContain('No client (walk-up)');
  });

  it('already-has-client keeps the signed To / SMS To — no picker', () => {
    const due = src('src/components/inspection/InspectionDueReminder.tsx');
    expect(due).toContain('jobClientAttachRow({');
    expect(due).toContain('jobClientId: resolvedClientId');
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
    const linkedNoEmail = decideInspectionDueSend({
      ...base,
      inspection: insp(),
      job: job(),
      client: client({ email: null, phone: null }),
      settings: smtp,
    });
    expect(linkedNoEmail.send).toBe(false);
    if (!linkedNoEmail.send) expect(linkedNoEmail.reason).toBe('no_email');
    expect(due).toContain("emailRow.kind === 'edit'");
    expect(due).toContain("phoneRow.kind === 'edit'");
  });

  it('leaves job-sheet / invoice-sheet / report-send / JobClientReminder signed', () => {
    const reminder = src('src/components/jobs/JobClientReminder.tsx');
    const page = src('src/pages/JobDetailPage.tsx');
    const invoicesPage = src('src/pages/InvoicesPage.tsx');
    const dialog = src('src/components/inspection/ReportSendDialog.tsx');
    const due = src('src/components/inspection/InspectionDueReminder.tsx');

    expect(reminder).toContain('saveJobClientEmail');
    expect(reminder).toContain('saveJobClientPhone');
    expect(reminder).toContain('JobClientReminder');
    expect(page).toContain('attachJobClient');
    expect(page).toContain('saveJobClientEmail');
    expect(page).toContain('saveJobClientPhone');
    expect(invoicesPage).toContain('saveJobClientEmail');
    expect(invoicesPage).toContain('saveJobClientPhone');
    expect(dialog).toContain('saveJobClientEmail');
    expect(dialog).toContain('saveJobClientPhone');
    expect(dialog).toContain('attachReportClient');
    expect(due).toContain('saveJobClientEmail');
    expect(due).toContain('saveJobClientPhone');
    expect(due).toContain('attachJobClient');
    expect(due).not.toContain('JobClientReminder');
    expect(due).not.toContain('InvoiceSendDialog');
    expect(due).not.toContain('ReportSendDialog');
  });

  it('does not launch 24h autofire or change job-reminder / due-test cron', () => {
    const due = src('src/components/inspection/InspectionDueReminder.tsx');
    const logic = src('src/lib/inspectionDueReminder.ts');
    const cron = src('supabase/migrations/20260821200000_062_job_reminder_edge_autofire.sql');
    const cron057 = src('supabase/migrations/20260821133000_057_job_reminder_cron.sql');
    const dueCron = src('supabase/migrations/20260821170000_060_inspection_due_reminder_autofire.sql');
    const edge = src('supabase/functions/job-reminder/index.ts');

    expect(due).not.toContain('cron.schedule');
    expect(due).not.toContain('due=today');
    expect(due).not.toContain('due=tomorrow');
    expect(due).not.toContain('invoke_job_client_reminders');
    expect(due).not.toContain('selectAutoFireInspections');
    expect(due).not.toContain('selectAutoFireJobs');
    expect(logic).not.toContain('saveJobClientEmail');
    expect(logic).not.toContain('saveJobClientPhone');
    expect(logic).not.toContain('attachJobClient');
    expect(cron).not.toContain('saveJobClientEmail');
    expect(cron).not.toContain('saveJobClientPhone');
    expect(cron).not.toContain('attachJobClient');
    expect(cron057).not.toContain('saveJobClientEmail');
    expect(dueCron).not.toContain('saveJobClientEmail');
    expect(dueCron).not.toContain('saveJobClientPhone');
    expect(dueCron).not.toContain('attachJobClient');
    expect(edge).not.toContain('saveJobClientEmail');
    expect(edge).not.toContain('saveJobClientPhone');
    expect(edge).not.toContain('attachJobClient');
  });

  it('keeps Flameboy look shots for empty email, empty phone, attach pick, no-clients, and already-has', () => {
    const shots = [
      'docs/look/due-reminder-email-empty-desktop.png',
      'docs/look/due-reminder-email-empty-ute.png',
      'docs/look/due-reminder-phone-empty-desktop.png',
      'docs/look/due-reminder-phone-empty-ute.png',
      'docs/look/due-reminder-attach-pick-desktop.png',
      'docs/look/due-reminder-attach-pick-ute.png',
      'docs/look/due-reminder-attach-no-clients-desktop.png',
      'docs/look/due-reminder-attach-no-clients-ute.png',
      'docs/look/due-reminder-already-has-desktop.png',
      'docs/look/due-reminder-already-has-ute.png',
      'docs/look/due-reminder-after-attach-no-email-desktop.png',
      'docs/look/due-reminder-after-attach-no-email-ute.png',
    ];
    for (const shot of shots) {
      expect(existsSync(resolve(process.cwd(), shot)), shot).toBe(true);
    }
  });

  it('leaves quote convert / PR #17 off this control', () => {
    const due = src('src/components/inspection/InspectionDueReminder.tsx');
    const quoteConvert = src('src/lib/convertQuoteToInvoice.ts');
    const quotesPage = src('src/pages/QuotesPage.tsx');
    const quoteNext = src('src/lib/quoteNextAction.ts');
    expect(due).not.toContain('convertQuoteToInvoice');
    expect(due).not.toContain('sendQuote');
    expect(due).not.toContain('QuoteSendDialog');
    expect(due).not.toContain('Relovi');
    expect(due).not.toContain('Littleloop');
    expect(quoteConvert).not.toContain('InspectionDueReminder');
    expect(quotesPage).not.toContain('InspectionDueReminder');
    expect(quoteNext).not.toContain('InspectionDueReminder');
  });
});
