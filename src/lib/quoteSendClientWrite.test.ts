import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  QUOTE_CLIENT_ATTACH_NO_CLIENTS,
  companyClientsForAttach,
  decideQuoteClientAttach,
  quoteClientAttachRow,
} from './attachQuoteClient';
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
  clientEmailForSend,
  clientPhoneForSms,
  decideQuoteSend,
  type QuoteSendBundle,
  type QuoteSendQuote,
} from './sendQuote';

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

const acme = { id: 'c1', name: 'Acme Plumbing' };
const brooks = { id: 'c2', name: 'Brooks Electrical' };

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

describe('quote-send honesty — three miss paths', () => {
  it('no email is an honest miss — editor on this client_id, no second client', () => {
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
    expect(jobClientEmailRow({
      clientId: 'c1',
      client: { id: 'c1', email: null },
    })).toEqual({ kind: 'edit', clientId: 'c1', email: '' });

    const miss = decideQuoteSend(bundle({ client: { ...client, email: null, phone: '0412 345 678' } }));
    expect(miss.ok).toBe(false);
    if (miss.ok) return;
    expect(miss.blocker).toBe('no_email');
    expect(miss.message).toMatch(/no email/i);
  });

  it('no phone is an honest SMS miss — editor on this client_id, not a Send gate', () => {
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
    expect(jobClientPhoneRow({
      clientId: 'c1',
      client: { id: 'c1', phone: null },
    })).toEqual({ kind: 'edit', clientId: 'c1', phone: '' });

    const ready = decideQuoteSend(bundle({
      client: { ...client, email: 'jane@acme.com.au', phone: null },
    }));
    expect(ready.ok).toBe(true);
    if (!ready.ok) return;
    expect(ready.smsTo).toBeNull();
    expect(ready.smsMessage).toMatch(/no phone/i);
  });

  it('no client is an honest miss — existing company clients only, no invented client', () => {
    expect(companyClientsForAttach([acme, { id: 'x', name: '  ', archived: false }, brooks])).toEqual([
      acme,
      brooks,
    ]);
    expect(quoteClientAttachRow({
      quoteClientId: null,
      companyClients: [acme, brooks],
    })).toEqual({ kind: 'pick', clients: [acme, brooks] });
    expect(quoteClientAttachRow({
      quoteClientId: null,
      companyClients: [],
    })).toEqual({ kind: 'miss', reason: 'no_clients', message: QUOTE_CLIENT_ATTACH_NO_CLIENTS });
    expect(quoteClientAttachRow({
      quoteClientId: 'c1',
      companyClients: [acme],
    }).kind).toBe('linked');
    expect(jobClientEmailRow({ clientId: null, client: null }).kind).toBe('none');
    expect(jobClientPhoneRow({ clientId: null, client: null }).kind).toBe('none');

    const miss = decideQuoteSend(bundle({
      quote: { ...quote, client_id: null },
      client: null,
    }));
    expect(miss.ok).toBe(false);
    if (miss.ok) return;
    expect(miss.blocker).toBe('no_client');
    expect(miss.message).toBe('Pick a client before you can send this quote.');
    expect(decideQuoteClientAttach({
      quoteId: 'q1',
      quoteClientId: null,
      clientId: 'c1',
      companyClients: [],
    }).action).toBe('miss');
  });
});

describe('quote-send honesty — after-save send-ready', () => {
  it('after a sendable email save, decideQuoteSend is ready — blank stays a miss', () => {
    const afterBlank = decideQuoteSend(bundle({
      client: { ...client, email: jobClientEmailToStore('') },
    }));
    expect(afterBlank.ok).toBe(false);
    if (!afterBlank.ok) expect(afterBlank.blocker).toBe('no_email');
    expect(clientEmailForSend(jobClientEmailToStore('not-an-email'))).toBeNull();

    const afterSave = decideQuoteSend(bundle({
      client: { ...client, email: jobClientEmailToStore('jane@acme.com.au') },
    }));
    expect(afterSave.ok).toBe(true);
    if (!afterSave.ok) return;
    expect(afterSave.to).toBe('jane@acme.com.au');
  });

  it('after a phone save, Send stays ready and SMS To is the saved number — no auto-SMS', () => {
    const afterBlank = decideQuoteSend(bundle({
      client: { ...client, email: 'jane@acme.com.au', phone: jobClientPhoneToStore('') },
    }));
    expect(afterBlank.ok).toBe(true);
    if (afterBlank.ok) expect(afterBlank.smsTo).toBeNull();

    const afterSave = decideQuoteSend(bundle({
      client: {
        ...client,
        email: 'jane@acme.com.au',
        phone: jobClientPhoneToStore('0412 345 678'),
      },
    }));
    expect(afterSave.ok).toBe(true);
    if (!afterSave.ok) return;
    expect(afterSave.smsTo).toBe('+61412345678');
    expect(afterSave.to).toBe('jane@acme.com.au');
    expect(clientPhoneForSms(jobClientPhoneToStore('0412 345 678'))).toBe('+61412345678');
  });

  it('after attach, a client with email is send-ready — a client without email is a no_email miss', () => {
    const afterBare = decideQuoteSend(bundle({
      quote: { ...quote, client_id: 'c1' },
      client: { id: 'c1', name: 'Acme Plumbing', email: null, phone: null, address: null },
    }));
    expect(afterBare.ok).toBe(false);
    if (!afterBare.ok) expect(afterBare.blocker).toBe('no_email');
    expect(jobClientEmailRow({
      clientId: 'c1',
      client: { id: 'c1', email: null },
    }).kind).toBe('edit');

    const afterEmailSave = decideQuoteSend(bundle({
      quote: { ...quote, client_id: 'c1' },
      client: {
        id: 'c1',
        name: 'Acme Plumbing',
        email: jobClientEmailToStore('jane@acme.com.au'),
        phone: null,
        address: null,
      },
    }));
    expect(afterEmailSave.ok).toBe(true);
    if (!afterEmailSave.ok) return;
    expect(afterEmailSave.to).toBe('jane@acme.com.au');

    const afterLinked = decideQuoteSend(bundle({
      quote: { ...quote, client_id: 'c2' },
      client: {
        id: 'c2',
        name: 'Brooks Electrical',
        email: 'sam@brooks.com.au',
        phone: '0400 111 222',
        address: null,
      },
    }));
    expect(afterLinked.ok).toBe(true);
    if (!afterLinked.ok) return;
    expect(afterLinked.to).toBe('sam@brooks.com.au');
    expect(afterLinked.smsTo).toBe('+61400111222');
  });
});

describe('quote-send honesty — wiring on the existing Send sheet', () => {
  it('email + phone + attach write on QuoteSendDialog and never auto-send', () => {
    const dialog = src('src/components/invoicing/QuoteSendDialog.tsx');
    const handleAttach = dialog.slice(dialog.indexOf('const handleAttach'), dialog.indexOf('const handleSaveEmail'));
    const handleEmail = dialog.slice(dialog.indexOf('const handleSaveEmail'), dialog.indexOf('const handleSavePhone'));
    const handlePhone = dialog.slice(dialog.indexOf('const handleSavePhone'), dialog.indexOf('const handleSend'));
    const handleSendFn = dialog.slice(dialog.indexOf('const handleSend'), dialog.indexOf('const ready'));
    const sendBtn = dialog.slice(dialog.indexOf('{showSend &&'), dialog.indexOf('{showSmtpSettings'));

    expect(dialog).toContain('saveJobClientEmail');
    expect(dialog).toContain('saveJobClientPhone');
    expect(dialog).toContain('attachQuoteClient');
    expect(dialog).toContain('QUOTE_SEND_NO_EMAIL_FIELD');
    expect(dialog).toContain('This client has no email. Add one below before you send.');
    expect(dialog).toContain('QUOTE_CLIENT_ATTACH_NO_CLIENTS');
    expect(dialog).toContain("blocker === 'no_email'");
    expect(dialog).toContain("blocker === 'no_client'");
    expect(dialog).toContain('job-client-email');
    expect(dialog).toContain('job-client-phone');
    expect(dialog).toContain('job-client-attach');
    expect(dialog).toContain('disabled={sending || !ready}');
    expect(sendBtn).toContain('Send quote');
    expect(sendBtn).toContain('disabled={sending || !ready}');

    expect(handleAttach).toContain('attachQuoteClient');
    expect(handleAttach).toContain('decideQuoteSend(next)');
    expect(handleAttach).not.toContain('deliverQuote');
    expect(handleAttach).not.toContain('onSent');
    expect(handleAttach).not.toContain('insert({');

    expect(handleEmail).toContain('saveJobClientEmail');
    expect(handleEmail).toContain('decideQuoteSend(next)');
    expect(handleEmail).not.toContain('deliverQuote');
    expect(handleEmail).not.toContain('onSent');

    expect(handlePhone).toContain('saveJobClientPhone');
    expect(handlePhone).toContain('decideQuoteSend(next)');
    expect(handlePhone).not.toContain('deliverQuote');
    expect(handlePhone).not.toContain('onSent');
    expect(handlePhone).not.toContain('sendSms');

    expect(handleSendFn).toContain('deliverQuote');
    expect(handleSendFn).not.toContain('saveJobClientEmail');
    expect(handleSendFn).not.toContain('saveJobClientPhone');
    expect(handleSendFn).not.toContain('attachQuoteClient');
    expect(handleSendFn).not.toContain('if (!decision?.ok) return');
  });

  it('miss first, then the field or picker — does not bounce to a client record', () => {
    const dialog = src('src/components/invoicing/QuoteSendDialog.tsx');
    const emailMiss = dialog.indexOf('{showEmailEditor && emailRow.kind === \'edit\' && (');
    const attachPick = dialog.indexOf('{noClientMiss && attachRow.kind === \'pick\' && (');
    const blocker = dialog.indexOf('blockerMessage');
    expect(blocker).toBeGreaterThan(-1);
    expect(attachPick).toBeGreaterThan(blocker);
    expect(emailMiss).toBeGreaterThan(attachPick);
    expect(dialog).not.toContain('Add one on the client record');
    expect(dialog).not.toContain('client record');
    expect(dialog).not.toContain('/clients/');
    expect(dialog).not.toContain('Open client');
    expect(dialog).not.toContain('Create client');
    expect(dialog).not.toContain('ClientEmailDialog');
    expect(dialog).not.toContain('ClientPhoneDialog');
    expect(dialog).not.toContain('ClientAttachDialog');
  });

  it('leaves invoice Send / PO Send / login / landing / AppShell / Relovi / PR #17 off this control', () => {
    const dialog = src('src/components/invoicing/QuoteSendDialog.tsx');
    const saveEmail = src('src/lib/saveJobClientEmail.ts');
    const savePhone = src('src/lib/saveJobClientPhone.ts');
    const attach = src('src/lib/attachQuoteClient.ts');
    const invoiceDialog = src('src/components/invoicing/InvoiceSendDialog.tsx');
    const poDialog = src('src/components/invoicing/PurchaseOrderSendDialog.tsx');
    const landing = src('src/pages/MarketingPage.tsx');
    const login = src('src/pages/LoginPage.tsx');
    const appShell = src('src/components/layout/AppShell.tsx');

    expect(dialog).not.toContain('InvoiceSendDialog');
    expect(dialog).not.toContain('deliverInvoice');
    expect(dialog).not.toContain('PurchaseOrderSendDialog');
    expect(dialog).not.toContain('deliverPurchaseOrder');
    expect(dialog).not.toContain('Relovi');
    expect(dialog).not.toContain('Littleloop');
    expect(dialog).not.toContain('Manrope');
    expect(dialog).not.toContain('send-quote');
    expect(saveEmail).not.toContain('QuoteSendDialog');
    expect(savePhone).not.toContain('QuoteSendDialog');
    expect(attach).not.toContain('QuoteSendDialog');
    expect(invoiceDialog).not.toContain('QuoteSendDialog');
    expect(invoiceDialog).not.toContain('deliverQuote');
    expect(poDialog).not.toContain('QuoteSendDialog');
    expect(landing).not.toContain('QuoteSendDialog');
    expect(login).not.toContain('QuoteSendDialog');
    expect(appShell).not.toContain('QuoteSendDialog');
  });
});
