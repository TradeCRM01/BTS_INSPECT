import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clientPhoneForSms, decideQuoteSend, type QuoteSendBundle, type QuoteSendQuote } from './sendQuote';
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
  from_email: 'quotes@btselectrical.com.au',
};

const company = { name: 'BTS Electrical', email: 'office@btselectrical.com.au' };

const quote: QuoteSendQuote = {
  id: 'q1',
  company_id: 'co1',
  quote_number: 12,
  client_id: 'c1',
  job_id: 'job-1',
  status: 'draft',
  description: 'Switchboard upgrade',
  scope_of_works: 'Replace the main board',
  line_items: [{ description: 'Labour', quantity: 4, unit_price: 120 }],
  subtotal: 480,
  tax_rate: 10,
  tax_amount: 48,
  total: 528,
  validity_date: '2026-09-19',
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

function bundle(over: Partial<QuoteSendBundle> = {}): QuoteSendBundle {
  return {
    quote,
    client,
    jobAddress: 'Warehouse B',
    smtp,
    company,
    ...over,
  };
}

describe('quote-send client phone — save / miss', () => {
  it('reuses saveJobClientPhone on this quote client_id — blank stays empty, no second client', () => {
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
    const miss = decideQuoteSend(bundle({
      quote: { ...quote, client_id: null },
      client: null,
    }));
    expect(miss.ok).toBe(false);
    if (miss.ok) return;
    expect(miss.blocker).toBe('no_client');
    expect(miss.message).toBe('Pick a client before you can send this quote.');
    expect(miss.href).toBeUndefined();
  });

  it('does not invent a send gate — phone write leaves decideQuoteSend as signed', () => {
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

    const noEmail = decideQuoteSend(bundle({
      client: { ...client, email: null, phone: jobClientPhoneToStore('0412 345 678') },
    }));
    expect(noEmail.ok).toBe(false);
    if (!noEmail.ok) expect(noEmail.blocker).toBe('no_email');

    const readyNoPhone = decideQuoteSend(bundle({
      client: { ...client, email: 'jane@acme.com.au', phone: null },
    }));
    expect(readyNoPhone.ok).toBe(true);
    if (!readyNoPhone.ok) return;
    expect(readyNoPhone.smsTo).toBeNull();

    const readyWithPhone = decideQuoteSend(bundle({
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

describe('quote-send client phone — wiring', () => {
  it('saves clients.phone on the existing send miss via saveJobClientPhone and does not auto-send or auto-SMS', () => {
    const save = src('src/lib/saveJobClientPhone.ts');
    const dialog = src('src/components/invoicing/QuoteSendDialog.tsx');
    const send = src('src/lib/sendQuote.ts');
    const deliver = src('src/lib/sendQuoteDeliver.ts');
    const handleSaveStart = dialog.indexOf('const handleSavePhone');
    const handleSaveEnd = dialog.indexOf('const handleSend');
    expect(handleSaveStart).toBeGreaterThan(-1);
    expect(handleSaveEnd).toBeGreaterThan(handleSaveStart);
    const handle = dialog.slice(handleSaveStart, handleSaveEnd);
    const handleSendFn = dialog.slice(dialog.indexOf('const handleSend'), dialog.indexOf('const ready'));

    expect(save).toContain("from('clients')");
    expect(save).toContain('update({ phone:');
    expect(save).toContain('.eq(\'id\', decision.clientId)');
    expect(save).not.toContain('deliverQuote');
    expect(save).not.toContain('QuoteSendDialog');
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
    expect(dialog).toContain('clientId: quoteClientId');
    expect(dialog).not.toContain('ClientPhoneDialog');
    expect(dialog).not.toContain('QuoteClientPhoneDialog');
    expect(dialog).not.toContain('AU_PHONE_PLACEHOLDER');
    expect(dialog).not.toContain('className="btn-primary job-client-phone-save"');

    expect(handle).toContain('saveJobClientPhone');
    expect(handle).toContain('phoneRow.clientId');
    expect(handle).toContain('clientPhoneDraft');
    expect(handle).toContain('decideQuoteSend(next)');
    expect(handle).not.toContain('deliverQuote');
    expect(handle).not.toContain('handleSend');
    expect(handle).not.toContain('onSent');
    expect(handle).not.toContain('sendSms');
    expect(handle).not.toContain('job-reminder');
    expect(handle).not.toContain('attachQuoteClient');

    expect(handleSendFn).toContain('deliverQuote');
    expect(handleSendFn).not.toContain('saveJobClientPhone');
    expect(handleSendFn).not.toContain('if (!decision?.ok) return');

    expect(send).not.toContain('saveJobClientPhone');
    expect(deliver).not.toContain('saveJobClientPhone');
  });

  it('does not add a second 44px — Save is muted on the miss, primary stays Send', () => {
    const dialog = src('src/components/invoicing/QuoteSendDialog.tsx');
    const css = src('src/index.css');
    const sendCssStart = css.indexOf('.hub-invoice-send .job-client-phone');
    expect(sendCssStart).toBeGreaterThan(-1);
    const sendCss = css.slice(sendCssStart, css.indexOf('.hub-invoice-send .job-client-attach'));

    expect(dialog).toContain('className="btn-primary"');
    expect(dialog).toContain('Send quote');
    expect(dialog).toContain('job-client-phone-save');
    expect(dialog).toContain('job-client-phone-num');
    expect(dialog).toContain('showSend');
    expect(dialog).toContain('disabled={sending || !ready}');
    expect(dialog).not.toContain('Add client phone');
    expect(dialog).not.toContain('className="btn-primary job-client-phone-save"');
    expect(sendCss).toContain('.job-client-phone-save');
    expect(sendCss).toContain('.job-client-phone-num');
    expect(sendCss).not.toContain('min-height: 44px');
    expect(sendCss).not.toContain('btn-primary');
    expect(sendCss).toContain('font-size: 12px');
    expect(sendCss).toMatch(/\.job-client-phone-save[\s\S]*color: #5B6B7C/);
    expect(sendCss).toMatch(/\.job-client-phone-num[\s\S]*color: #0A2540/);
  });

  it('hides the phone editor when this quote has no client', () => {
    const dialog = src('src/components/invoicing/QuoteSendDialog.tsx');
    expect(jobClientPhoneRow({ clientId: null, client: { id: 'c1', phone: null } }).kind).toBe('none');
    expect(dialog).toContain("phoneRow.kind === 'edit'");
    expect(dialog).toContain("phoneRow.kind === 'tel'");
    expect(dialog).toContain('!noClientMiss');
  });

  it('does not change Send enablement unless decideQuoteSend already needs phone', () => {
    const dialog = src('src/components/invoicing/QuoteSendDialog.tsx');
    const handleSave = dialog.slice(dialog.indexOf('const handleSavePhone'), dialog.indexOf('const handleSend'));
    const handleSendFn = dialog.slice(dialog.indexOf('const handleSend'), dialog.indexOf('const ready'));
    const sendBtn = dialog.slice(dialog.indexOf('{showSend &&'), dialog.indexOf('{showSmtpSettings'));

    expect(dialog).toContain('disabled={sending || !ready}');
    expect(sendBtn).toContain('Send quote');
    expect(handleSave).toContain('decideQuoteSend(next)');
    expect(handleSave).not.toContain('deliverQuote');
    expect(handleSave).not.toContain('onSent');
    expect(handleSendFn).toContain('deliverQuote');

    const afterBlank = decideQuoteSend(bundle({
      client: { ...client, email: 'jane@acme.com.au', phone: jobClientPhoneToStore('') },
    }));
    expect(afterBlank.ok).toBe(true);
    if (afterBlank.ok) expect(afterBlank.smsTo).toBeNull();

    const afterSave = decideQuoteSend(bundle({
      client: { ...client, email: 'jane@acme.com.au', phone: jobClientPhoneToStore('0412 345 678') },
    }));
    expect(afterSave.ok).toBe(true);
    if (afterSave.ok) expect(afterSave.smsTo).toBe('+61412345678');

    const stillEmailMiss = decideQuoteSend(bundle({
      client: { ...client, email: null, phone: jobClientPhoneToStore('0412 345 678') },
    }));
    expect(stillEmailMiss.ok).toBe(false);
    if (!stillEmailMiss.ok) expect(stillEmailMiss.blocker).toBe('no_email');
  });

  it('leaves sendQuote / PDF / SMS beside / SMTP Company settings as signed', () => {
    const dialog = src('src/components/invoicing/QuoteSendDialog.tsx');
    const send = src('src/lib/sendQuote.ts');
    const deliver = src('src/lib/sendQuoteDeliver.ts');

    expect(dialog).toContain('Company settings');
    expect(dialog).toContain("blocker === 'no_smtp'");
    expect(dialog).toContain('SMS To');
    expect(dialog).toContain('deliverQuote');
    expect(dialog).toContain('Send quote');
    expect(dialog).toContain('saveJobClientEmail');
    expect(send).toContain('clientPhoneForSms');
    expect(send).toContain('smsTo');
    expect(deliver).not.toContain('saveJobClientPhone');
    expect(send).not.toContain('saveJobClientPhone');
  });

  it('leaves quote convert / invoice send off this control', () => {
    const save = src('src/lib/saveJobClientPhone.ts');
    const dialog = src('src/components/invoicing/QuoteSendDialog.tsx');
    const quoteConvert = src('src/lib/convertQuoteToInvoice.ts');
    expect(save).not.toContain('convertQuoteToInvoice');
    expect(save).not.toContain('QuoteSendDialog');
    expect(quoteConvert).not.toContain('saveJobClientPhone');
    expect(dialog).not.toContain('convertQuoteToInvoice');
    expect(dialog).not.toContain('deliverInvoice');
    expect(dialog).not.toContain('InvoiceSendDialog');
  });
});
