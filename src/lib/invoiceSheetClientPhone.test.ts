import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clientPhoneForSms, COMPANY_EMAIL_SETTINGS_HREF } from './sendInvoice';
import { invoiceActionContext, recommendInvoiceAction } from './invoiceNextAction';
import {
  JOB_CLIENT_PHONE_CLEARED,
  JOB_CLIENT_PHONE_NO_CLIENT,
  JOB_CLIENT_PHONE_SAVED,
  decideJobClientPhoneSave,
  jobClientPhoneRow,
  jobClientPhoneSaveToast,
  jobClientPhoneToStore,
} from './saveJobClientPhone';
import { invoiceClientAttachRow } from './attachInvoiceClient';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const now = new Date(2026, 7, 20);

describe('invoice-sheet client phone — save / Next / miss', () => {
  it('reuses saveJobClientPhone on this invoice client_id — blank stays empty, no second client', () => {
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

  it('does not move Next off Send or Add client email — no auto-send, no auto-SMS', () => {
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

    expect(recommendInvoiceAction(invoiceActionContext(
      { status: 'draft', client_id: 'c1', client_email: 'jane@acme.com.au', line_items: [{ description: 'Board', quantity: 1 }] },
      { smtpReady: true },
    ), now)).toMatchObject({ key: 'send', label: 'Send' });
    expect(recommendInvoiceAction(invoiceActionContext(
      {
        status: 'sent',
        due_date: '2026-08-19',
        client_id: 'c1',
        client_email: 'jane@acme.com.au',
        line_items: [{ description: 'Board', quantity: 1 }],
      },
      { smtpReady: true },
    ), now)).toMatchObject({ key: 'send', label: 'Send again' });
    expect(recommendInvoiceAction(invoiceActionContext(
      { status: 'draft', client_id: 'c1', client_email: '', line_items: [{ description: 'Board', quantity: 1 }] },
      { smtpReady: true },
    ), now).key).toBe('add_email');
    expect(recommendInvoiceAction(invoiceActionContext(
      { status: 'draft', client_id: 'c1', client_email: null, line_items: [{ description: 'Board', quantity: 1 }] },
      { smtpReady: true },
    ), now).label).toBe('Add client email');
    expect(recommendInvoiceAction(invoiceActionContext(
      { status: 'draft', client_id: null, client_email: null, line_items: [{ description: 'Board', quantity: 1 }] },
      { smtpReady: true },
    ), now).label).toBe('Add a client');
  });
});

describe('invoice-sheet client phone — wiring', () => {
  it('saves clients.phone on the Bill-to chrome via saveJobClientPhone and does not auto-send or auto-SMS', () => {
    const save = src('src/lib/saveJobClientPhone.ts');
    const page = src('src/pages/InvoicesPage.tsx');
    const editorStart = page.indexOf('function InvoiceEditorModal');
    expect(editorStart).toBeGreaterThan(-1);
    const editor = page.slice(editorStart);
    const handleSaveStart = editor.indexOf('const saveClientPhone');
    const handleSaveEnd = editor.indexOf('const rawSubtotal');
    expect(handleSaveStart).toBeGreaterThan(-1);
    expect(handleSaveEnd).toBeGreaterThan(handleSaveStart);
    const handle = editor.slice(handleSaveStart, handleSaveEnd);
    const startSend = editor.slice(editor.indexOf('const startSend'), editor.indexOf('const editorMoney'));

    expect(save).toContain("from('clients')");
    expect(save).toContain('update({ phone:');
    expect(save).toContain('.eq(\'id\', decision.clientId)');
    expect(save).toContain('clientPhoneForSms');
    expect(save).toContain('decideJobClientPhoneSave');
    expect(save).not.toContain('insert({');
    expect(save).not.toContain('CREATE TABLE');
    expect(save).not.toContain('ALTER TABLE');
    expect(save).not.toContain('cron.schedule');
    expect(save).not.toContain('deliverInvoice');
    expect(save).not.toContain('InvoiceSendDialog');
    expect(save).not.toContain('startSend');
    expect(save).not.toContain('sendSms');
    expect(save).not.toContain('decideSmsBeside');
    expect(save).not.toContain('job-reminder');

    expect(page).toContain('saveJobClientPhone');
    expect(page).toContain('jobClientPhoneRow');
    expect(page).toContain('jobClientPhoneSaveToast');
    expect(editor).toContain('hub-invoice-kicker');
    expect(editor).toContain('Bill to');
    expect(editor).toContain('saveClientPhone.mutate()');
    expect(editor).toContain('job-client-phone');
    expect(editor).toContain('job-client-phone-save');
    expect(editor).toContain('job-client-phone-num');
    expect(editor).toContain('aria-label="Client phone"');
    expect(editor).toContain("kind === 'edit'");
    expect(editor).toContain("kind === 'tel'");
    expect(editor).toContain('jobClientPhoneRow({ clientId: form.client_id || null');
    expect(editor).not.toContain('ClientPhoneDialog');
    expect(editor).not.toContain('InvoiceClientPhoneDialog');
    expect(editor).not.toContain('AU_PHONE_PLACEHOLDER');
    expect(editor).toContain("next.key === 'add_email'");
    expect(editor).toContain("next.key === 'send'");
    expect(editor).toContain('{next.label}');
    expect(editor).not.toContain('className="btn-primary job-client-phone-save"');
    expect(editor).not.toContain('className="ops-next-control-block job-client-phone-save"');
    expect(editor).not.toContain('QuoteSendDialog');

    expect(handle).toContain('saveJobClientPhone');
    expect(handle).toContain('form.client_id');
    expect(handle).toContain('clientPhoneDraft');
    expect(handle).toContain("invalidateQueries({ queryKey: ['invoices'] })");
    expect(handle).toContain("invalidateQueries({ queryKey: ['job-client'");
    expect(handle).not.toContain('startSend');
    expect(handle).not.toContain('onRequestSend');
    expect(handle).not.toContain('deliverInvoice');
    expect(handle).not.toContain('deliverInvoiceReceiptAfterMarkPaid');
    expect(handle).not.toContain('attachXeroPaymentAfterMarkPaid');
    expect(handle).not.toContain('insert({');
    expect(handle).not.toContain('persist(');
    expect(handle).not.toContain('chased_at');
    expect(handle).not.toContain('sendSms');
    expect(handle).not.toContain('decideSmsBeside');
    expect(handle).not.toContain('job-reminder');

    expect(startSend).toContain('onRequestSend');
    expect(startSend).not.toContain('saveJobClientPhone');
  });

  it('does not add a second 44px primary — Save is quiet on Bill-to, Next stays the one primary', () => {
    const page = src('src/pages/InvoicesPage.tsx');
    const css = src('src/index.css');
    const editor = page.slice(page.indexOf('function InvoiceEditorModal'));
    const invoiceCss = css.slice(css.indexOf('/* Invoice surfaces only'), css.indexOf('/* Job-hub JHA/SWMS'));
    const clientCssStart = invoiceCss.indexOf('.hub-invoice-editor .job-client-phone');
    expect(clientCssStart).toBeGreaterThan(-1);
    const clientCss = invoiceCss.slice(clientCssStart, invoiceCss.indexOf('.hub-invoice-table'));

    expect(editor).toContain('hub-invoice-editor-act');
    expect(editor).toContain("next.key === 'add_email'");
    expect(editor).toContain("next.key === 'send'");
    expect(editor).toContain('className="btn-primary"');
    expect(editor).toContain('job-client-phone-save');
    expect(editor).toContain('job-client-phone-num');
    expect(editor).toContain('{next.label}');
    expect(editor).toContain('Send again');
    expect(editor).toContain('Mark paid');
    expect(editor).not.toContain('className="btn-primary job-client-phone-save"');
    expect(editor).not.toContain('className="ops-next-control-block job-client-phone-save"');
    expect(clientCss).toContain('.job-client-phone-save');
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
    expect(clientCss).toMatch(/\.job-client-phone-save[\s\S]*color: #5B6B7C/);
    expect(clientCss).toMatch(/\.job-client-phone-num[\s\S]*color: #0A2540/);
  });

  it('list-row Add a client / add_email opens this sheet — does not grow an inline phone field', () => {
    const page = src('src/pages/InvoicesPage.tsx');
    const hit = page.slice(page.indexOf('function InvoiceHit'), page.indexOf('function InvoiceNextControl'));
    const listNext = page.slice(page.indexOf('function InvoiceNextControl'), page.indexOf('interface EditorState'));
    const editor = page.slice(page.indexOf('function InvoiceEditorModal'));

    expect(hit).not.toContain('job-client-phone');
    expect(hit).not.toContain('type="tel"');
    expect(hit).not.toContain('aria-label="Client phone"');
    expect(hit).not.toContain('saveJobClientPhone');
    expect(listNext).not.toContain('job-client-phone');
    expect(listNext).not.toContain('type="tel"');
    expect(listNext).not.toContain('saveJobClientPhone');
    expect(listNext).toContain("next.key === 'add_email'");
    expect(listNext).toContain("next.label === 'Add a client'");
    expect(listNext).toContain('onClick={onOpen}');
    expect(editor).toContain('type="tel"');
    expect(editor).toContain('job-client-phone');
  });

  it('keeps the signed #43 attach when this invoice has no client — no phone editor without a client', () => {
    const page = src('src/pages/InvoicesPage.tsx');
    const editor = page.slice(page.indexOf('function InvoiceEditorModal'));

    expect(invoiceClientAttachRow({
      invoiceClientId: null,
      companyClients: [{ id: 'c1', name: 'Acme Electrical' }],
    }).kind).toBe('pick');
    expect(jobClientPhoneRow({ clientId: null, client: { id: 'c1', phone: null } }).kind).toBe('none');
    expect(editor).toContain('invoiceClientAttachRow');
    expect(editor).toContain('job-client-attach');
    expect(editor).toContain('aria-label="Attach client"');
    expect(editor).toContain("attachRow.kind === 'pick'");
    expect(editor).toContain("phoneRow.kind === 'edit'");
    expect(editor).toContain("phoneRow.kind === 'tel'");
    expect(editor.indexOf("attachRow.kind === 'pick'")).toBeLessThan(editor.indexOf("phoneRow.kind === 'edit'"));
  });

  it('leaves Send / Send again / Mark paid / Xero / receipt / stamp / chase and SMTP Company settings as signed', () => {
    const page = src('src/pages/InvoicesPage.tsx');
    const dialog = src('src/components/invoicing/InvoiceSendDialog.tsx');
    const invoiceNext = src('src/lib/invoiceNextAction.ts');
    const send = src('src/lib/sendInvoice.ts');
    const deliver = src('src/lib/sendInvoiceDeliver.ts');
    const editor = page.slice(page.indexOf('function InvoiceEditorModal'));
    const startSend = editor.slice(editor.indexOf('const startSend'), editor.indexOf('const editorMoney'));
    const patchPaid = page.slice(page.indexOf('const patchPaid'), page.indexOf('let primary'));
    const persistStart = editor.indexOf('const persist');
    const persistFn = editor.slice(persistStart, editor.indexOf('const startSend'));

    expect(page).toContain('InvoiceSendDialog');
    expect(page).toContain('Send again');
    expect(page).toContain('Mark paid');
    expect(page).toContain('attachXeroPaymentAfterMarkPaid');
    expect(page).toContain('deliverInvoiceReceiptAfterMarkPaid');
    expect(page).toContain("chasePrimary ? 'btn-primary' : 'hub-next'");
    expect(dialog).toContain('deliverInvoice');
    expect(dialog).not.toContain('saveJobClientPhone');
    expect(dialog).not.toContain('jobClientPhoneRow');
    expect(invoiceNext).toContain("label: 'Send again'");
    expect(invoiceNext).toContain('invoiceOverflowPaidAction');
    expect(invoiceNext).toContain('COMPANY_EMAIL_SETTINGS_HREF');
    expect(send).toContain('NO_SMTP_MESSAGE');
    expect(send).toContain('clientEmailForSend');
    expect(send).toContain(COMPANY_EMAIL_SETTINGS_HREF);
    expect(send).not.toContain('saveJobClientPhone');
    expect(deliver).toContain('export async function deliverInvoice');
    expect(deliver).not.toContain('saveJobClientPhone');
    expect(page).toContain('Set up email');
    expect(startSend).toContain('onRequestSend');
    expect(startSend).not.toContain('saveJobClientPhone');
    expect(patchPaid).not.toContain('saveJobClientPhone');
    expect(persistFn).not.toContain('saveJobClientPhone');
  });

  it('leaves job-sheet, report-send, and SMS cron / job-reminder as signed', () => {
    const jobPage = src('src/pages/JobDetailPage.tsx');
    const dialog = src('src/components/inspection/ReportSendDialog.tsx');
    const reportSend = src('src/lib/sendReport.ts');
    const reminder = src('src/lib/jobReminder.ts');
    const reminderEdge = src('supabase/functions/job-reminder/index.ts');
    const invoicesPage = src('src/pages/InvoicesPage.tsx');

    expect(jobPage).toContain('saveJobClientPhone');
    expect(jobPage).toContain('jobClientPhoneRow');
    expect(jobPage).toContain('job-client-phone-save');
    expect(jobPage).toContain('jobClientPhoneRow({ clientId: job.client_id, client: client ?? null })');
    expect(dialog).not.toContain('saveJobClientPhone');
    expect(dialog).not.toContain('jobClientPhoneRow');
    expect(reportSend).not.toContain('saveJobClientPhone');
    expect(reminder).not.toContain('saveJobClientPhone');
    expect(reminderEdge).not.toContain('saveJobClientPhone');
    expect(invoicesPage).toContain('saveJobClientEmail');
    expect(invoicesPage).toContain('job-client-email');
    expect(invoicesPage).toContain('job-client-email-save');
  });

  it('keeps Flameboy look shots for empty, saved, already-has-phone, and no-client', () => {
    const shots = [
      'docs/look/invoice-client-phone-empty-desktop.png',
      'docs/look/invoice-client-phone-empty-ute.png',
      'docs/look/invoice-client-phone-saved-desktop.png',
      'docs/look/invoice-client-phone-saved-ute.png',
      'docs/look/invoice-client-phone-has-phone-desktop.png',
      'docs/look/invoice-client-phone-has-phone-ute.png',
      'docs/look/invoice-client-phone-no-client-desktop.png',
      'docs/look/invoice-client-phone-no-client-ute.png',
    ];
    for (const shot of shots) {
      expect(existsSync(resolve(process.cwd(), shot)), shot).toBe(true);
    }
  });

  it('leaves quote convert / PR #17 off this control', () => {
    const save = src('src/lib/saveJobClientPhone.ts');
    const page = src('src/pages/InvoicesPage.tsx');
    const quoteConvert = src('src/lib/convertQuoteToInvoice.ts');
    const quotesPage = src('src/pages/QuotesPage.tsx');
    const quoteNext = src('src/lib/quoteNextAction.ts');
    expect(save).not.toContain('convertQuoteToInvoice');
    expect(save).not.toContain('sendQuote');
    expect(save).not.toContain('QuoteSendDialog');
    expect(quoteConvert).not.toContain('saveJobClientPhone');
    expect(quotesPage).not.toContain('saveJobClientPhone');
    expect(quoteNext).not.toContain('saveJobClientPhone');
    expect(page).not.toContain('QuoteSendDialog');
    expect(page).not.toContain('sendQuote');
    expect(page).not.toContain('sendQuoteDeliver');
    expect(page).not.toContain('convertQuoteToInvoice');
  });
});
