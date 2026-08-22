import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clientPhoneForSms, decideInvoiceSend, type InvoiceSendBundle, type InvoiceSendInvoice } from './sendInvoice';
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

const smtp = {
  smtp_host: 'smtp.resend.com',
  smtp_pass: 're_test',
  from_name: 'BTS Electrical',
  from_email: 'invoices@btselectrical.com.au',
};

const company = { name: 'BTS Electrical', email: 'office@btselectrical.com.au' };

const invoice: InvoiceSendInvoice = {
  id: 'inv-1',
  company_id: 'co1',
  invoice_number: 18,
  client_id: 'c1',
  job_id: 'job-1',
  status: 'draft',
  line_items: [{ description: 'Switchboard test', quantity: 2, unit_price: 220 }],
  subtotal: 440,
  tax_rate: 10,
  tax_amount: 44,
  total: 484,
  payment_terms: 'Net 30',
  due_date: '2026-09-19',
  notes: 'Side gate',
  inclusions: ['Materials'],
  exclusions: ['After hours'],
};

const client = {
  id: 'c1',
  name: 'Acme Plumbing',
  email: null as string | null,
  phone: null as string | null,
  address: '12 Smith St',
};

function bundle(over: Partial<InvoiceSendBundle> = {}): InvoiceSendBundle {
  return {
    invoice,
    client,
    jobAddress: 'Warehouse B',
    smtp,
    company,
    ...over,
  };
}

describe('invoice-send client phone — save / miss', () => {
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

  it('hides the editor when there is no client — does not invent one', () => {
    expect(jobClientPhoneRow({ clientId: null, client: null }).kind).toBe('none');
    const miss = decideInvoiceSend(bundle({
      invoice: { ...invoice, client_id: null },
      client: null,
    }));
    expect(miss.ok).toBe(false);
    if (miss.ok) return;
    expect(miss.blocker).toBe('no_client');
    expect(miss.message).toBe('Pick a client before you can send this invoice.');
    expect(miss.href).toBeUndefined();
  });

  it('does not invent a send gate — phone write leaves decideInvoiceSend as signed', () => {
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

    const noEmail = decideInvoiceSend(bundle({
      client: { ...client, email: null, phone: jobClientPhoneToStore('0412 345 678') },
    }));
    expect(noEmail.ok).toBe(false);
    if (!noEmail.ok) expect(noEmail.blocker).toBe('no_email');

    const readyNoPhone = decideInvoiceSend(bundle({
      client: { ...client, email: 'jane@acme.com.au', phone: null },
    }));
    expect(readyNoPhone.ok).toBe(true);
    if (!readyNoPhone.ok) return;
    expect(readyNoPhone.smsTo).toBeNull();

    const readyWithPhone = decideInvoiceSend(bundle({
      client: {
        ...client,
        email: 'jane@acme.com.au',
        phone: jobClientPhoneToStore('0412 345 678'),
      },
    }));
    expect(readyWithPhone.ok).toBe(true);
    if (!readyWithPhone.ok) return;
    expect(readyWithPhone.smsTo).toBe('+61412345678');
    expect(readyWithPhone.to).toBe('jane@acme.com.au');
    expect(clientPhoneForSms(jobClientPhoneToStore('0412 345 678'))).toBe('+61412345678');
  });
});

describe('invoice-send client phone — wiring', () => {
  it('saves clients.phone on the existing send miss via saveJobClientPhone and does not auto-send or auto-SMS', () => {
    const save = src('src/lib/saveJobClientPhone.ts');
    const dialog = src('src/components/invoicing/InvoiceSendDialog.tsx');
    const send = src('src/lib/sendInvoice.ts');
    const deliver = src('src/lib/sendInvoiceDeliver.ts');
    const handleSaveStart = dialog.indexOf('const handleSavePhone');
    const handleSaveEnd = dialog.indexOf('const handleSend');
    expect(handleSaveStart).toBeGreaterThan(-1);
    expect(handleSaveEnd).toBeGreaterThan(handleSaveStart);
    const handle = dialog.slice(handleSaveStart, handleSaveEnd);
    const handleSendFn = dialog.slice(dialog.indexOf('const handleSend'), dialog.indexOf('const ready'));

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
    expect(save).not.toContain('sendSms');
    expect(save).not.toContain('job-reminder');

    expect(dialog).toContain('saveJobClientPhone');
    expect(dialog).toContain('jobClientPhoneRow');
    expect(dialog).toContain('handleSavePhone()');
    expect(dialog).toContain('job-client-phone');
    expect(dialog).toContain('job-client-phone-save');
    expect(dialog).toContain('job-client-phone-num');
    expect(dialog).toContain('aria-label="Client phone"');
    expect(dialog).toContain("kind === 'edit'");
    expect(dialog).toContain("kind === 'tel'");
    expect(dialog).toContain('jobClientPhoneRow({');
    expect(dialog).toContain('clientId: invoiceClientId');
    expect(dialog).not.toContain('ClientPhoneDialog');
    expect(dialog).not.toContain('InvoiceClientPhoneDialog');
    expect(dialog).not.toContain('AU_PHONE_PLACEHOLDER');
    expect(dialog).not.toContain('className="btn-primary job-client-phone-save"');
    expect(dialog).not.toContain('className="ops-next-control-block job-client-phone-save"');
    expect(dialog).not.toContain('attachInvoiceClient');

    expect(handle).toContain('saveJobClientPhone');
    expect(handle).toContain('phoneRow.clientId');
    expect(handle).toContain('clientPhoneDraft');
    expect(handle).toContain('decideInvoiceSend(next)');
    expect(handle).not.toContain('deliverInvoice');
    expect(handle).not.toContain('handleSend');
    expect(handle).not.toContain('onSent');
    expect(handle).not.toContain('insert({');
    expect(handle).not.toContain('chased_at');
    expect(handle).not.toContain('sendSms');
    expect(handle).not.toContain('job-reminder');

    expect(handleSendFn).toContain('deliverInvoice');
    expect(handleSendFn).not.toContain('saveJobClientPhone');
    expect(handleSendFn).not.toContain('if (!decision?.ok) return');

    expect(send).not.toContain('saveJobClientPhone');
    expect(deliver).not.toContain('saveJobClientPhone');
  });

  it('does not add a second 44px — Save is muted on the miss, primary stays Send', () => {
    const dialog = src('src/components/invoicing/InvoiceSendDialog.tsx');
    const css = src('src/index.css');
    const sendCssStart = css.indexOf('.hub-invoice-send .job-client-phone');
    expect(sendCssStart).toBeGreaterThan(-1);
    const sendCss = css.slice(sendCssStart, css.indexOf('.hub-invoice-send .job-client-attach'));

    expect(dialog).toContain('className="btn-primary"');
    expect(dialog).toContain('Send invoice');
    expect(dialog).toContain('job-client-phone-save');
    expect(dialog).toContain('job-client-phone-num');
    expect(dialog).toContain('showSend');
    expect(dialog).toContain('disabled={sending || !ready}');
    expect(dialog).toContain('Open client');
    expect(dialog).not.toContain('Add client phone');
    expect(dialog).not.toContain('className="btn-primary job-client-phone-save"');
    expect(sendCss).toContain('.job-client-phone-save');
    expect(sendCss).toContain('.job-client-phone-num');
    expect(sendCss).not.toContain('min-height: 44px');
    expect(sendCss).not.toContain('min-h-[44px]');
    expect(sendCss).not.toContain('ops-next-control');
    expect(sendCss).not.toContain('btn-primary');
    expect(sendCss).toContain('font-size: 12px');
    expect(sendCss).toContain('#D5DCE3');
    expect(sendCss).toContain('gap: 8px');
    expect(sendCss).toContain('white-space: nowrap');
    expect(sendCss).toContain('text-overflow: clip');
    expect(sendCss).not.toContain('ellipsis');
    expect(sendCss).toContain('#5B6B7C');
    expect(sendCss).toContain('#0A2540');
    expect(sendCss).toContain('#2E75B6');
    expect(sendCss).toMatch(/\.job-client-phone-save[\s\S]*color: #5B6B7C/);
    expect(sendCss).toMatch(/\.job-client-phone-num[\s\S]*color: #0A2540/);

    const primaryCss = css.slice(
      css.indexOf('.hub-invoice-send .btn-primary'),
      css.indexOf('.hub-invoices-chrome'),
    );
    expect(primaryCss).toContain('.btn-primary:disabled');
    expect(primaryCss).toContain('.btn-primary:disabled:hover');
    expect(primaryCss).toContain('opacity: 0.45');
    expect(primaryCss).toContain('cursor: not-allowed');
    expect(primaryCss).toMatch(/\.btn-primary:disabled:hover[\s\S]*background: #2E75B6/);
    expect(css).toContain('.hub-invoice-send-body > .hub-invoice-err');
    expect(dialog).not.toContain('indigo-500');
    expect(dialog).not.toContain('sky-500');
    expect(sendCss).not.toContain('indigo-500');
    expect(sendCss).not.toContain('sky-500');
  });

  it('keeps Open client when this invoice has no client — no phone editor without a client', () => {
    const dialog = src('src/components/invoicing/InvoiceSendDialog.tsx');
    expect(jobClientPhoneRow({ clientId: null, client: { id: 'c1', phone: null } }).kind).toBe('none');
    expect(dialog).toContain('Open client');
    expect(dialog).toContain('showOpenClient');
    expect(dialog).toContain("phoneRow.kind === 'edit'");
    expect(dialog).toContain("phoneRow.kind === 'tel'");
    expect(dialog).toContain('!noClientMiss');
    expect(dialog).not.toContain('attachInvoiceClient');
    expect(dialog.indexOf("showPhoneEditor && noEmailMiss")).toBeGreaterThan(dialog.indexOf('!noClientMiss'));
  });

  it('does not change Send enablement unless decideInvoiceSend already needs phone', () => {
    const dialog = src('src/components/invoicing/InvoiceSendDialog.tsx');
    const handleSave = dialog.slice(dialog.indexOf('const handleSavePhone'), dialog.indexOf('const handleSend'));
    const handleSendFn = dialog.slice(dialog.indexOf('const handleSend'), dialog.indexOf('const ready'));
    const sendBtn = dialog.slice(dialog.indexOf('{showSend &&'), dialog.indexOf('{showSmtpSettings'));

    expect(dialog).toContain('disabled={sending || !ready}');
    expect(sendBtn).toContain('Send invoice');
    expect(sendBtn).toContain('disabled={sending || !ready}');
    expect(handleSave).toContain('decideInvoiceSend(next)');
    expect(handleSave).not.toContain('deliverInvoice');
    expect(handleSave).not.toContain('onSent');
    expect(handleSendFn).toContain('deliverInvoice');
    expect(handleSendFn).not.toContain('if (!decision?.ok) return');

    const afterBlank = decideInvoiceSend(bundle({
      client: { ...client, email: 'jane@acme.com.au', phone: jobClientPhoneToStore('') },
    }));
    expect(afterBlank.ok).toBe(true);
    if (afterBlank.ok) expect(afterBlank.smsTo).toBeNull();

    const afterInvalid = decideInvoiceSend(bundle({
      client: { ...client, email: 'jane@acme.com.au', phone: jobClientPhoneToStore('call me') },
    }));
    expect(afterInvalid.ok).toBe(true);
    if (afterInvalid.ok) expect(afterInvalid.smsTo).toBeNull();

    const afterSave = decideInvoiceSend(bundle({
      client: { ...client, email: 'jane@acme.com.au', phone: jobClientPhoneToStore('0412 345 678') },
    }));
    expect(afterSave.ok).toBe(true);
    if (afterSave.ok) expect(afterSave.smsTo).toBe('+61412345678');

    const stillEmailMiss = decideInvoiceSend(bundle({
      client: { ...client, email: null, phone: jobClientPhoneToStore('0412 345 678') },
    }));
    expect(stillEmailMiss.ok).toBe(false);
    if (!stillEmailMiss.ok) expect(stillEmailMiss.blocker).toBe('no_email');
  });

  it('leaves sendInvoice / PDF / SMS beside / SMTP Company settings as signed', () => {
    const dialog = src('src/components/invoicing/InvoiceSendDialog.tsx');
    const send = src('src/lib/sendInvoice.ts');
    const deliver = src('src/lib/sendInvoiceDeliver.ts');
    const reportDialog = src('src/components/inspection/ReportSendDialog.tsx');

    expect(dialog).toContain('Company settings');
    expect(dialog).toContain("blocker === 'no_smtp'");
    expect(dialog).toContain('SMS To');
    expect(dialog).toContain('deliverInvoice');
    expect(dialog).toContain('Send invoice');
    expect(dialog).toContain('invoiceSendXeroMissLine');
    expect(dialog).toContain('saveJobClientEmail');
    expect(send).toContain('NO_SMTP_MESSAGE');
    expect(send).toContain('clientEmailForSend');
    expect(send).toContain('clientPhoneForSms');
    expect(send).toContain('smsTo');
    expect(send).toContain('pickInvoicePdfAttachment');
    expect(deliver).toContain('export async function deliverInvoice');
    expect(deliver).not.toContain('saveJobClientPhone');
    expect(send).not.toContain('saveJobClientPhone');
    expect(reportDialog).toContain('saveJobClientPhone');
  });

  it('keeps Flameboy look shots for empty, saved, already-has-phone, and no-client', () => {
    const shots = [
      'docs/look/invoice-send-phone-empty-desktop.png',
      'docs/look/invoice-send-phone-empty-ute.png',
      'docs/look/invoice-send-phone-saved-desktop.png',
      'docs/look/invoice-send-phone-saved-ute.png',
      'docs/look/invoice-send-phone-has-phone-desktop.png',
      'docs/look/invoice-send-phone-has-phone-ute.png',
      'docs/look/invoice-send-phone-no-client-desktop.png',
      'docs/look/invoice-send-phone-no-client-ute.png',
    ];
    for (const shot of shots) {
      expect(existsSync(resolve(process.cwd(), shot)), shot).toBe(true);
    }
  });

  it('leaves quote convert / PR #17 off this control', () => {
    const save = src('src/lib/saveJobClientPhone.ts');
    const dialog = src('src/components/invoicing/InvoiceSendDialog.tsx');
    const quoteConvert = src('src/lib/convertQuoteToInvoice.ts');
    const quotesPage = src('src/pages/QuotesPage.tsx');
    const quoteNext = src('src/lib/quoteNextAction.ts');
    expect(save).not.toContain('convertQuoteToInvoice');
    expect(save).not.toContain('sendQuote');
    expect(save).not.toContain('QuoteSendDialog');
    expect(quoteConvert).not.toContain('saveJobClientPhone');
    expect(quotesPage).not.toContain('saveJobClientPhone');
    expect(quoteNext).not.toContain('saveJobClientPhone');
    expect(dialog).not.toContain('QuoteSendDialog');
    expect(dialog).not.toContain('sendQuote');
    expect(dialog).not.toContain('sendQuoteDeliver');
    expect(dialog).not.toContain('convertQuoteToInvoice');
  });
});
