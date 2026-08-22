import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clientEmailForSend, clientPhoneForSms } from './sendInvoice';
import {
  JOB_CLIENT_EMAIL_CLEARED,
  JOB_CLIENT_EMAIL_NO_CLIENT,
  JOB_CLIENT_EMAIL_SAVED,
  decideJobClientEmailSave,
  jobClientEmailRow,
  jobClientEmailSaveToast,
  jobClientEmailToStore,
} from './saveJobClientEmail';
import {
  JOB_CLIENT_PHONE_CLEARED,
  JOB_CLIENT_PHONE_NO_CLIENT,
  JOB_CLIENT_PHONE_SAVED,
  decideJobClientPhoneSave,
  jobClientPhoneRow,
  jobClientPhoneSaveToast,
  jobClientPhoneToStore,
} from './saveJobClientPhone';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('client-sheet contact — save / miss', () => {
  it('reuses saveJobClientEmail on this existing client — blank stays empty, no second client', () => {
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
    expect(decideJobClientEmailSave({ clientId: 'c1', email: '   ' })).toEqual({
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

  it('reuses saveJobClientPhone on this existing client — blank stays empty, no second client', () => {
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
    expect(decideJobClientPhoneSave({ clientId: 'c1', phone: '   ' })).toEqual({
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

  it('opens the write field when the existing client has no sendable email — invalid stays an honest miss', () => {
    expect(jobClientEmailRow({
      clientId: 'c1',
      client: { id: 'c1', email: '  ' },
    })).toEqual({ kind: 'edit', clientId: 'c1', email: '  ' });
    expect(jobClientEmailRow({
      clientId: 'c1',
      client: { id: 'c1', email: 'not-an-email' },
    })).toEqual({ kind: 'edit', clientId: 'c1', email: 'not-an-email' });
    expect(clientEmailForSend(jobClientEmailToStore(''))).toBeNull();
    expect(clientEmailForSend(jobClientEmailToStore('not-an-email'))).toBeNull();
    expect(clientEmailForSend(jobClientEmailToStore('jane@acme.com.au'))).toBe('jane@acme.com.au');
  });

  it('opens the write field when the existing client has no sendable phone — invalid stays an honest miss', () => {
    expect(jobClientPhoneRow({
      clientId: 'c1',
      client: { id: 'c1', phone: '  ' },
    })).toEqual({ kind: 'edit', clientId: 'c1', phone: '  ' });
    expect(jobClientPhoneRow({
      clientId: 'c1',
      client: { id: 'c1', phone: 'call me' },
    })).toEqual({ kind: 'edit', clientId: 'c1', phone: 'call me' });
    expect(jobClientPhoneRow({
      clientId: 'c1',
      client: { id: 'c1', phone: '12' },
    })).toEqual({ kind: 'edit', clientId: 'c1', phone: '12' });
    expect(clientPhoneForSms(jobClientPhoneToStore(''))).toBeNull();
    expect(clientPhoneForSms(jobClientPhoneToStore('call me'))).toBeNull();
    expect(clientPhoneForSms(jobClientPhoneToStore('12'))).toBeNull();
    expect(clientPhoneForSms(jobClientPhoneToStore('0412 345 678'))).toBe('+61412345678');
  });

  it('already-has-email stays ink — does not replace a good address with an empty editor', () => {
    expect(jobClientEmailRow({
      clientId: 'c1',
      client: { id: 'c1', email: '  jane@acme.com.au  ' },
    })).toEqual({ kind: 'mailto', clientId: 'c1', email: 'jane@acme.com.au' });
  });

  it('already-has-phone stays ink — does not replace a good number with an empty editor', () => {
    expect(jobClientPhoneRow({
      clientId: 'c1',
      client: { id: 'c1', phone: '  0412 345 678  ' },
    })).toEqual({ kind: 'tel', clientId: 'c1', phone: '0412 345 678' });
    expect(jobClientPhoneRow({
      clientId: 'c1',
      client: { id: 'c1', phone: '+61 412 345 678' },
    })).toEqual({ kind: 'tel', clientId: 'c1', phone: '+61 412 345 678' });
  });

  it('names save vs clear — never a send toast', () => {
    expect(jobClientEmailSaveToast('jane@acme.com.au')).toEqual({
      message: JOB_CLIENT_EMAIL_SAVED,
      kind: 'success',
    });
    expect(jobClientEmailSaveToast(null)).toEqual({
      message: JOB_CLIENT_EMAIL_CLEARED,
      kind: 'info',
    });
    expect(jobClientPhoneSaveToast('0412 345 678')).toEqual({
      message: JOB_CLIENT_PHONE_SAVED,
      kind: 'success',
    });
    expect(jobClientPhoneSaveToast(null)).toEqual({
      message: JOB_CLIENT_PHONE_CLEARED,
      kind: 'info',
    });
    expect(JOB_CLIENT_EMAIL_SAVED).not.toMatch(/sent/i);
    expect(JOB_CLIENT_EMAIL_CLEARED).not.toMatch(/sent/i);
    expect(JOB_CLIENT_PHONE_SAVED).not.toMatch(/sent/i);
    expect(JOB_CLIENT_PHONE_CLEARED).not.toMatch(/sent/i);
  });
});

describe('client-sheet contact — wiring', () => {
  it('saves clients.email and clients.phone on the existing /clients card via the signed kits', () => {
    const saveEmail = src('src/lib/saveJobClientEmail.ts');
    const savePhone = src('src/lib/saveJobClientPhone.ts');
    const page = src('src/pages/ClientDetailPage.tsx');
    const list = src('src/pages/ClientsPage.tsx');
    const handleEmailStart = page.indexOf('const saveClientEmail');
    const handleEmailEnd = page.indexOf('const saveClientPhone');
    const handlePhoneEnd = page.indexOf('if (isLoading)');
    expect(handleEmailStart).toBeGreaterThan(-1);
    expect(handleEmailEnd).toBeGreaterThan(handleEmailStart);
    expect(handlePhoneEnd).toBeGreaterThan(handleEmailEnd);
    const handleEmail = page.slice(handleEmailStart, handleEmailEnd);
    const handlePhone = page.slice(handleEmailEnd, handlePhoneEnd);

    expect(saveEmail).toContain("from('clients')");
    expect(saveEmail).toContain('update({ email:');
    expect(saveEmail).toContain('.eq(\'id\', decision.clientId)');
    expect(saveEmail).not.toContain('insert({');
    expect(saveEmail).not.toContain('CREATE TABLE');
    expect(saveEmail).not.toContain('ALTER TABLE');
    expect(saveEmail).not.toContain('cron.schedule');
    expect(savePhone).toContain("from('clients')");
    expect(savePhone).toContain('update({ phone:');
    expect(savePhone).toContain('.eq(\'id\', decision.clientId)');
    expect(savePhone).not.toContain('insert({');
    expect(savePhone).not.toContain('CREATE TABLE');
    expect(savePhone).not.toContain('ALTER TABLE');
    expect(savePhone).not.toContain('cron.schedule');

    expect(page).toContain('saveJobClientEmail');
    expect(page).toContain('jobClientEmailRow');
    expect(page).toContain('jobClientEmailSaveToast');
    expect(page).toContain('saveClientEmail.mutate()');
    expect(page).toContain('job-client-email');
    expect(page).toContain('job-client-email-save');
    expect(page).toContain('job-client-email-addr');
    expect(page).toContain('aria-label="Client email"');
    expect(page).toContain("kind === 'edit'");
    expect(page).toContain("kind === 'mailto'");
    expect(page).toContain('jobClientEmailRow({ clientId: client.id, client })');
    expect(page).toContain('saveJobClientPhone');
    expect(page).toContain('jobClientPhoneRow');
    expect(page).toContain('jobClientPhoneSaveToast');
    expect(page).toContain('saveClientPhone.mutate()');
    expect(page).toContain('job-client-phone');
    expect(page).toContain('job-client-phone-save');
    expect(page).toContain('job-client-phone-num');
    expect(page).toContain('aria-label="Client phone"');
    expect(page).toContain("kind === 'tel'");
    expect(page).toContain('jobClientPhoneRow({ clientId: client.id, client })');
    expect(page).toContain('CLIENT_SHEET_NO_EMAIL');
    expect(page).toContain('CLIENT_SHEET_NO_PHONE');
    expect(page).not.toContain('ClientEmailDialog');
    expect(page).not.toContain('ClientPhoneDialog');
    expect(page).not.toContain('AU_EMAIL_PLACEHOLDER');
    expect(page).not.toContain('AU_PHONE_PLACEHOLDER');
    expect(page).not.toContain('className="btn-primary job-client-email-save"');
    expect(page).not.toContain('className="btn-primary job-client-phone-save"');
    expect(page).not.toContain('className="ops-next-control-block job-client-email-save"');
    expect(page).not.toContain('className="ops-next-control-block job-client-phone-save"');

    expect(handleEmail).toContain('saveJobClientEmail');
    expect(handleEmail).toContain('client?.id');
    expect(handleEmail).toContain('clientEmailDraft');
    expect(handleEmail).toContain("invalidateQueries({ queryKey: ['client', id] })");
    expect(handleEmail).toContain("invalidateQueries({ queryKey: ['clients'] })");
    expect(handleEmail).toContain("invalidateQueries({ queryKey: ['job-client', result.clientId] })");
    expect(handleEmail).not.toContain('insert({');
    expect(handleEmail).not.toContain('deliverInvoice');
    expect(handleEmail).not.toContain('deliverReport');
    expect(handleEmail).not.toContain('job-reminder');
    expect(handleEmail).not.toContain('navigate(');

    expect(handlePhone).toContain('saveJobClientPhone');
    expect(handlePhone).toContain('client?.id');
    expect(handlePhone).toContain('clientPhoneDraft');
    expect(handlePhone).toContain("invalidateQueries({ queryKey: ['client', id] })");
    expect(handlePhone).not.toContain('insert({');
    expect(handlePhone).not.toContain('deliverInvoice');
    expect(handlePhone).not.toContain('decideSmsBeside');
    expect(handlePhone).not.toContain('job-reminder');

    expect(list).not.toContain('saveJobClientEmail');
    expect(list).not.toContain('saveJobClientPhone');
    expect(list).not.toContain('job-client-email');
    expect(list).not.toContain('job-client-phone');
  });

  it('puts the honest miss above the quiet field — already-has stays ink', () => {
    const page = src('src/pages/ClientDetailPage.tsx');
    expect(page).toContain("This client has no email. Add one below.");
    expect(page).toContain("This client has no phone. Add one below.");
    expect(page).not.toContain('Add one below before you send.');
    expect(page).not.toContain('before you send');
    expect(page).toContain('{phoneRow.kind === \'edit\' && (');
    expect(page).toContain('{CLIENT_SHEET_NO_PHONE}');
    expect(page).toContain('{emailRow.kind === \'edit\' && (');
    expect(page).toContain('{CLIENT_SHEET_NO_EMAIL}');

    const phoneMiss = page.indexOf('{CLIENT_SHEET_NO_PHONE}');
    const phoneForm = page.indexOf('className="job-client-phone"');
    const phoneInk = page.indexOf('className="job-client-phone-num"');
    const emailMiss = page.indexOf('{CLIENT_SHEET_NO_EMAIL}');
    const emailForm = page.indexOf('className="job-client-email"');
    const emailInk = page.indexOf('className="job-client-email-addr"');
    expect(phoneMiss).toBeGreaterThan(-1);
    expect(phoneForm).toBeGreaterThan(phoneMiss);
    expect(phoneInk).toBeGreaterThan(-1);
    expect(emailMiss).toBeGreaterThan(phoneForm);
    expect(emailForm).toBeGreaterThan(emailMiss);
    expect(emailInk).toBeGreaterThan(-1);
    expect(page).not.toContain('phone={client.phone}');
    expect(page).not.toContain('email={client.email}');
  });

  it('does not add a second 44px primary — Save is muted, New job stays the one primary', () => {
    const page = src('src/pages/ClientDetailPage.tsx');
    const css = src('src/index.css');
    const clientCssStart = css.indexOf('/* Client sheet contact write only');
    const clientCssEnd = css.indexOf('/* End client sheet contact write */');
    expect(clientCssStart).toBeGreaterThan(-1);
    expect(clientCssEnd).toBeGreaterThan(clientCssStart);
    const clientCss = css.slice(clientCssStart, clientCssEnd);

    expect(page).toContain('className="btn-primary"');
    expect(page).toContain('New job');
    expect(page).toContain('job-client-email-save');
    expect(page).toContain('job-client-phone-save');
    expect(page).not.toContain('className="btn-primary job-client-email-save"');
    expect(page).not.toContain('className="btn-primary job-client-phone-save"');
    expect(clientCss).toContain('.job-client-email-save');
    expect(clientCss).toContain('.job-client-phone-save');
    expect(clientCss).toContain('.job-client-email-addr');
    expect(clientCss).toContain('.job-client-phone-num');
    expect(clientCss).not.toContain('min-height: 44px');
    expect(clientCss).not.toContain('min-h-[44px]');
    expect(clientCss).not.toContain('ops-next-control');
    expect(clientCss).not.toContain('btn-primary');
    expect(clientCss).toContain('font-size: 12px');
    expect(clientCss).toContain('#D5DCE3');
    expect(clientCss).toContain('gap: 8px');
    expect(clientCss).toContain('white-space: nowrap');
    expect(clientCss).toContain('text-overflow: clip');
    expect(clientCss).not.toContain('ellipsis');
    expect(clientCss).toContain('#5B6B7C');
    expect(clientCss).toContain('#0A2540');
    expect(clientCss).toContain('#2E75B6');
    expect(clientCss).toMatch(/\.job-client-email-save[\s\S]*color: #5B6B7C/);
    expect(clientCss).toMatch(/\.job-client-phone-save[\s\S]*color: #5B6B7C/);
    expect(clientCss).toMatch(/\.job-client-email-addr[\s\S]*color: #0A2540/);
    expect(clientCss).toMatch(/\.job-client-phone-num[\s\S]*color: #0A2540/);
  });

  it('does not change job-sheet / invoice-sheet / report-send / JobClientReminder / InspectionDueReminder', () => {
    const page = src('src/pages/ClientDetailPage.tsx');
    const jobPage = src('src/pages/JobDetailPage.tsx');
    const invoicesPage = src('src/pages/InvoicesPage.tsx');
    const dialog = src('src/components/inspection/ReportSendDialog.tsx');
    const reminder = src('src/components/jobs/JobClientReminder.tsx');
    const due = src('src/components/inspection/InspectionDueReminder.tsx');

    expect(jobPage).toContain('saveJobClientEmail');
    expect(jobPage).toContain('saveJobClientPhone');
    expect(jobPage).toContain('jobClientEmailRow({ clientId: job.client_id, client: client ?? null })');
    expect(invoicesPage).toContain('saveJobClientEmail');
    expect(invoicesPage).toContain('saveJobClientPhone');
    expect(dialog).toContain('saveJobClientEmail');
    expect(dialog).toContain('saveJobClientPhone');
    expect(reminder).toContain('saveJobClientEmail');
    expect(reminder).toContain('This client has no email. Add one below before you send.');
    expect(due).not.toContain('saveJobClientEmail');
    expect(due).not.toContain('saveJobClientPhone');
    expect(due).not.toContain('job-client-email');
    expect(due).not.toContain('job-client-phone');
    expect(page).not.toContain('JobClientReminder');
    expect(page).not.toContain('InspectionDueReminder');
    expect(page).not.toContain('InvoiceSendDialog');
    expect(page).not.toContain('ReportSendDialog');
    expect(page).not.toContain('deliverInvoice');
    expect(page).not.toContain('deliverReport');
  });

  it('does not launch 24h autofire or change job-reminder cron', () => {
    const page = src('src/pages/ClientDetailPage.tsx');
    const logic = src('src/lib/jobReminder.ts');
    const cron = src('supabase/migrations/20260821200000_062_job_reminder_edge_autofire.sql');
    const cron057 = src('supabase/migrations/20260821133000_057_job_reminder_cron.sql');
    const edge = src('supabase/functions/job-reminder/index.ts');

    expect(page).not.toContain('cron.schedule');
    expect(page).not.toContain('due=tomorrow');
    expect(page).not.toContain('invoke_job_client_reminders');
    expect(page).not.toContain('selectAutoFireJobs');
    expect(logic).not.toContain('saveJobClientEmail');
    expect(logic).not.toContain('saveJobClientPhone');
    expect(cron).not.toContain('saveJobClientEmail');
    expect(cron).not.toContain('saveJobClientPhone');
    expect(cron057).not.toContain('saveJobClientEmail');
    expect(cron057).not.toContain('saveJobClientPhone');
    expect(edge).not.toContain('saveJobClientEmail');
    expect(edge).not.toContain('saveJobClientPhone');
    expect(cron).toContain('SELECT public.invoke_job_client_reminders()');
  });

  it('leaves quote convert / PR #17 off this control', () => {
    const saveEmail = src('src/lib/saveJobClientEmail.ts');
    const savePhone = src('src/lib/saveJobClientPhone.ts');
    const page = src('src/pages/ClientDetailPage.tsx');
    const quoteConvert = src('src/lib/convertQuoteToInvoice.ts');
    const quotesPage = src('src/pages/QuotesPage.tsx');
    const quoteNext = src('src/lib/quoteNextAction.ts');
    expect(saveEmail).not.toContain('convertQuoteToInvoice');
    expect(saveEmail).not.toContain('sendQuote');
    expect(saveEmail).not.toContain('QuoteSendDialog');
    expect(savePhone).not.toContain('convertQuoteToInvoice');
    expect(savePhone).not.toContain('sendQuote');
    expect(savePhone).not.toContain('QuoteSendDialog');
    expect(quoteConvert).not.toContain('saveJobClientEmail');
    expect(quoteConvert).not.toContain('saveJobClientPhone');
    expect(quotesPage).toContain('saveJobClientEmail');
    expect(quotesPage).toContain('saveJobClientPhone');
    expect(quoteNext).not.toContain('saveJobClientEmail');
    expect(quoteNext).not.toContain('saveJobClientPhone');
    expect(page).not.toContain('QuoteSendDialog');
    expect(page).not.toContain('sendQuote');
    expect(page).not.toContain('convertQuoteToInvoice');
  });
});
