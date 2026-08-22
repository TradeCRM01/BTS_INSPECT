import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clientPhoneForSms, COMPANY_EMAIL_SETTINGS_HREF } from './sendInvoice';
import { recommendJobAction } from './jobNextAction';
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

const sendReady = {
  status: 'completed' as const,
  scheduledDate: '2026-08-20',
  crewCount: 1,
  jhaCount: 1,
  inspectionCount: 1,
  invoiceCount: 1,
  hasDraftInvoice: true,
  hasIssuedInvoice: false,
  hasAcceptedQuote: false,
  hasBillLines: true,
  clockedOn: true,
};

const invoiceReady = {
  ...sendReady,
  invoiceCount: 0,
  hasDraftInvoice: false,
  hasIssuedInvoice: false,
};

describe('jobClientPhoneToStore', () => {
  it('trims a real number and keeps blank empty — never invents one', () => {
    expect(jobClientPhoneToStore('0412 345 678')).toBe('0412 345 678');
    expect(jobClientPhoneToStore('  +61 412 345 678  ')).toBe('+61 412 345 678');
    expect(jobClientPhoneToStore('')).toBeNull();
    expect(jobClientPhoneToStore('   ')).toBeNull();
    expect(jobClientPhoneToStore(null)).toBeNull();
    expect(jobClientPhoneToStore(undefined)).toBeNull();
  });
});

describe('jobClientPhoneRow', () => {
  it('hides the editor when there is no existing client — does not invent one', () => {
    expect(jobClientPhoneRow({ clientId: null, client: { id: 'c1', phone: null } })).toEqual({ kind: 'none' });
    expect(jobClientPhoneRow({ clientId: '', client: { id: 'c1', phone: null } })).toEqual({ kind: 'none' });
    expect(jobClientPhoneRow({ clientId: 'c1', client: null })).toEqual({ kind: 'none' });
    expect(jobClientPhoneRow({ clientId: undefined, client: undefined })).toEqual({ kind: 'none' });
  });

  it('opens the write field when the existing client has no sendable phone', () => {
    expect(jobClientPhoneRow({
      clientId: 'c1',
      client: { id: 'c1', phone: null },
    })).toEqual({ kind: 'edit', clientId: 'c1', phone: '' });
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
  });

  it('keeps a sendable number as ink — does not replace it with an empty editor', () => {
    expect(jobClientPhoneRow({
      clientId: 'c1',
      client: { id: 'c1', phone: '  0412 345 678  ' },
    })).toEqual({ kind: 'tel', clientId: 'c1', phone: '0412 345 678' });
    expect(jobClientPhoneRow({
      clientId: 'c1',
      client: { id: 'c1', phone: '+61 412 345 678' },
    })).toEqual({ kind: 'tel', clientId: 'c1', phone: '+61 412 345 678' });
  });
});

describe('decideJobClientPhoneSave', () => {
  it('misses without inventing a client', () => {
    expect(decideJobClientPhoneSave({ clientId: null, phone: '0412 345 678' })).toEqual({
      action: 'miss',
      reason: 'no_client',
      message: JOB_CLIENT_PHONE_NO_CLIENT,
    });
    expect(decideJobClientPhoneSave({ clientId: '', phone: '0412 345 678' }).action).toBe('miss');
    expect(decideJobClientPhoneSave({ clientId: undefined, phone: '0412 345 678' })).toMatchObject({
      action: 'miss',
      reason: 'no_client',
    });
  });

  it('writes clients.phone on the existing client_id — blank stays empty', () => {
    expect(decideJobClientPhoneSave({
      clientId: 'c1',
      phone: '  0412 345 678  ',
    })).toEqual({ action: 'write', clientId: 'c1', phone: '0412 345 678' });
    expect(decideJobClientPhoneSave({
      clientId: 'c1',
      phone: '',
    })).toEqual({ action: 'write', clientId: 'c1', phone: null });
    expect(decideJobClientPhoneSave({
      clientId: 'c1',
      phone: '   ',
    })).toEqual({ action: 'write', clientId: 'c1', phone: null });
  });
});

describe('clientPhoneForSms after save', () => {
  it('keeps empty / invalid as an honest no-phone miss — does not invent To', () => {
    expect(clientPhoneForSms(jobClientPhoneToStore(''))).toBeNull();
    expect(clientPhoneForSms(jobClientPhoneToStore(null))).toBeNull();
    expect(clientPhoneForSms(jobClientPhoneToStore('call me'))).toBeNull();
    expect(clientPhoneForSms(jobClientPhoneToStore('12'))).toBeNull();
    expect(clientPhoneForSms(jobClientPhoneToStore('0412 345 678'))).toBe('+61412345678');
  });
});

describe('jobClientPhoneSaveToast / Next stays Invoice or Send', () => {
  it('names save vs clear — never a send or SMS toast', () => {
    expect(jobClientPhoneSaveToast('0412 345 678')).toEqual({
      message: JOB_CLIENT_PHONE_SAVED,
      kind: 'success',
    });
    expect(jobClientPhoneSaveToast(null)).toEqual({
      message: JOB_CLIENT_PHONE_CLEARED,
      kind: 'info',
    });
    expect(JOB_CLIENT_PHONE_SAVED).not.toMatch(/sent/i);
    expect(JOB_CLIENT_PHONE_CLEARED).not.toMatch(/sent/i);
    expect(JOB_CLIENT_PHONE_SAVED).not.toMatch(/sms/i);
    expect(JOB_CLIENT_PHONE_CLEARED).not.toMatch(/sms/i);
  });

  it('does not move Next off Invoice or Send after a client-phone write', () => {
    expect(recommendJobAction(invoiceReady)).toMatchObject({ key: 'invoice', label: 'Invoice' });
    expect(recommendJobAction(sendReady)).toMatchObject({ key: 'send', label: 'Send' });
    expect(recommendJobAction({
      ...sendReady,
      hasDraftInvoice: true,
      hasIssuedInvoice: false,
    }).key).toBe('send');
  });
});

describe('job-sheet client phone — wiring', () => {
  it('saves clients.phone on the existing client row and does not auto-send or auto-SMS', () => {
    const save = src('src/lib/saveJobClientPhone.ts');
    const page = src('src/pages/JobDetailPage.tsx');
    const next = src('src/lib/jobNextAction.ts');
    const send = src('src/lib/sendJobDraftInvoice.ts');
    const reminder = src('src/lib/jobReminder.ts');
    const reminderEdge = src('supabase/functions/job-reminder/index.ts');
    const handleSaveStart = page.indexOf('const saveClientPhone');
    const handleSaveEnd = page.indexOf('const updateStatus');
    expect(handleSaveStart).toBeGreaterThan(-1);
    expect(handleSaveEnd).toBeGreaterThan(handleSaveStart);
    const handle = page.slice(handleSaveStart, handleSaveEnd);

    expect(save).toContain("from('clients')");
    expect(save).toContain('update({ phone:');
    expect(save).toContain('.eq(\'id\', decision.clientId)');
    expect(save).toContain('clientPhoneForSms');
    expect(save).toContain('decideJobClientPhoneSave');
    expect(save).not.toContain('insert({');
    expect(save).not.toContain('CREATE TABLE');
    expect(save).not.toContain('ALTER TABLE');
    expect(save).not.toContain('cron.schedule');
    expect(save).not.toContain('sendJobDraftInvoice');
    expect(save).not.toContain('deliverInvoice');
    expect(save).not.toContain('InvoiceSendDialog');
    expect(save).not.toContain('decideInvoiceSend');
    expect(save).not.toContain('job-reminder');
    expect(save).not.toContain('from(\'jobs\')');
    expect(save).not.toContain('sendSms');
    expect(save).not.toContain('decideSmsBeside');

    expect(page).toContain('saveJobClientPhone');
    expect(page).toContain('jobClientPhoneRow');
    expect(page).toContain('jobClientPhoneSaveToast');
    expect(page).toContain('saveClientPhone.mutate()');
    expect(page).toContain('job-client-phone');
    expect(page).toContain('job-client-phone-save');
    expect(page).toContain('job-client-phone-num');
    expect(page).toContain("aria-label=\"Client phone\"");
    expect(page).not.toContain('{client?.phone && (');
    expect(page).not.toContain('tel:${phoneRow.phone}`} className="flex items-center gap-1.5 text-accent');
    expect(page).toContain("invalidateQueries({ queryKey: ['job-client', job?.client_id] })");
    expect(page).toContain("kind === 'edit'");
    expect(page).toContain("kind === 'tel'");
    expect(page).toContain('No client');
    expect(page).toContain('jobClientPhoneRow({ clientId: job.client_id, client: client ?? null })');
    expect(page).not.toContain('InvoiceSendDialog');
    expect(page).not.toContain('QuoteSendDialog');
    expect(page).not.toContain('ClientPhoneDialog');
    expect(page).not.toContain('AU_PHONE_PLACEHOLDER');

    expect(handle).toContain('saveJobClientPhone');
    expect(handle).toContain('job?.client_id');
    expect(handle).toContain('clientPhoneDraft');
    expect(handle).not.toContain('sendJobDraftInvoice');
    expect(handle).not.toContain('sendJobDraft.mutate');
    expect(handle).not.toContain('deliverInvoice');
    expect(handle).not.toContain('insert({');
    expect(handle).not.toContain('navigate(');
    expect(handle).not.toContain('decideSmsBeside');
    expect(handle).not.toContain('job-reminder');

    expect(next).toContain("label: 'Send'");
    expect(next).toContain("label: 'Invoice'");
    expect(send).toContain('deliverInvoice');
    expect(send).not.toContain('saveJobClientPhone');
    expect(reminder).not.toContain('saveJobClientPhone');
    expect(reminderEdge).not.toContain('saveJobClientPhone');
  });

  it('does not add a second 44px primary — Next Invoice / Send stays the one primary', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    const css = src('src/index.css');
    const clientCssStart = css.indexOf('.job-cal-host .job-client-email');
    expect(clientCssStart).toBeGreaterThan(-1);
    const clientCss = css.slice(clientCssStart, css.indexOf('.job-cal-act'));

    expect(page).toContain('ops-next-control-block');
    expect(page).toContain("next.key === 'invoice'");
    expect(page).toContain("next.key === 'send'");
    expect(page).toContain('job-client-phone-save');
    expect(page).toContain('job-client-phone-num');
    expect(page).not.toContain('className="ops-next-control-block job-client-phone-save"');
    expect(page).not.toContain('className="btn-primary job-client-phone-save"');
    expect(clientCss).toContain('.job-client-phone-save');
    expect(clientCss).toContain('.job-client-phone-num');
    expect(clientCss).not.toContain('min-height: 44px');
    expect(clientCss).not.toContain('min-h-[44px]');
    expect(clientCss).not.toContain('ops-next-control');
    expect(clientCss).toContain('font-size: 12px');
    expect(clientCss).toContain('#D5DCE3');
    expect(clientCss).toContain('gap: 8px');
    expect(clientCss).toContain('white-space: nowrap');
    expect(clientCss).toContain('text-overflow: clip');
    expect(clientCss).not.toContain('ellipsis');
    expect(clientCss).toContain('#5B6B7C');
    expect(clientCss).toContain('#0A2540');
    expect(clientCss).toMatch(/\.job-client-phone-save[\s\S]*color: #5B6B7C/);
    expect(clientCss).toMatch(/\.job-client-phone-num[\s\S]*color: #0A2540/);
  });

  it('leaves Invoice-sheet Send / Send again / Mark paid / Xero / receipt and SMTP Company settings as signed', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    const invoicesPage = src('src/pages/InvoicesPage.tsx');
    const dialog = src('src/components/invoicing/InvoiceSendDialog.tsx');
    const invoiceNext = src('src/lib/invoiceNextAction.ts');
    const send = src('src/lib/sendInvoice.ts');
    const deliver = src('src/lib/sendInvoiceDeliver.ts');

    expect(page).not.toContain('Mark paid');
    expect(page).not.toContain('Send again');
    expect(page).not.toContain('InvoiceSendDialog');
    expect(invoicesPage).toContain('InvoiceSendDialog');
    expect(invoicesPage).toContain('Send again');
    expect(invoicesPage).toContain('Mark paid');
    expect(dialog).toContain('deliverInvoice');
    expect(dialog).toContain('saveJobClientPhone');
    expect(invoiceNext).toContain("label: 'Send again'");
    expect(invoiceNext).toContain('invoiceOverflowPaidAction');
    expect(invoiceNext).toContain('COMPANY_EMAIL_SETTINGS_HREF');
    expect(send).toContain('NO_SMTP_MESSAGE');
    expect(send).toContain('COMPANY_EMAIL_SETTINGS_HREF');
    expect(send).toContain(COMPANY_EMAIL_SETTINGS_HREF);
    expect(deliver).toContain('export async function deliverInvoice');
    expect(deliver).not.toContain('saveJobClientPhone');
    expect(send).not.toContain('saveJobClientPhone');

    const startSend = invoicesPage.indexOf('const startSend');
    const startSendFn = invoicesPage.slice(startSend, invoicesPage.indexOf('const editorMoney'));
    const patchPaid = invoicesPage.indexOf('const patchPaid');
    const patchPaidFn = invoicesPage.slice(patchPaid, invoicesPage.indexOf('let primary'));
    const finishPaid = invoicesPage.indexOf('const finishPaid');
    const finishPaidFn = invoicesPage.slice(finishPaid, invoicesPage.indexOf('const id = savedId'));
    expect(startSendFn).not.toContain('saveJobClientPhone');
    expect(startSendFn).toContain('onRequestSend');
    expect(patchPaidFn).not.toContain('saveJobClientPhone');
    expect(finishPaidFn).not.toContain('saveJobClientPhone');
  });

  it('leaves report-send and the signed #40 email kit as they are', () => {
    const dialog = src('src/components/inspection/ReportSendDialog.tsx');
    const reportSend = src('src/lib/sendReport.ts');
    const page = src('src/pages/JobDetailPage.tsx');
    expect(dialog).toContain('saveJobClientPhone');
    expect(dialog).toContain('jobClientPhoneRow');
    expect(reportSend).not.toContain('saveJobClientPhone');
    expect(page).toContain('saveJobClientEmail');
    expect(page).toContain('jobClientEmailRow');
    expect(page).toContain('job-client-email');
    expect(page).toContain('job-client-email-save');
  });

  it('keeps Flameboy look shots for empty, saved, already-has-phone, and no-client', () => {
    const shots = [
      'docs/look/job-client-phone-empty-desktop.png',
      'docs/look/job-client-phone-empty-ute.png',
      'docs/look/job-client-phone-saved-desktop.png',
      'docs/look/job-client-phone-saved-ute.png',
      'docs/look/job-client-phone-has-phone-desktop.png',
      'docs/look/job-client-phone-has-phone-ute.png',
      'docs/look/job-client-phone-no-client-desktop.png',
      'docs/look/job-client-phone-no-client-ute.png',
    ];
    for (const shot of shots) {
      expect(existsSync(resolve(process.cwd(), shot)), shot).toBe(true);
    }
  });

  it('leaves quote convert / PR #17 off this control', () => {
    const save = src('src/lib/saveJobClientPhone.ts');
    const quoteConvert = src('src/lib/convertQuoteToInvoice.ts');
    const quotesPage = src('src/pages/QuotesPage.tsx');
    const quoteNext = src('src/lib/quoteNextAction.ts');
    expect(save).not.toContain('convertQuoteToInvoice');
    expect(save).not.toContain('sendQuote');
    expect(save).not.toContain('QuoteSendDialog');
    expect(quoteConvert).not.toContain('saveJobClientPhone');
    expect(quotesPage).toContain('saveJobClientPhone');
    expect(quoteNext).not.toContain('saveJobClientPhone');
  });
});
