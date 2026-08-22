import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMPANY_EMAIL_SETTINGS_HREF,
  clientEmailForSend,
  decideInvoiceSend,
  NO_EMAIL_MESSAGE,
  type InvoiceSendBundle,
  type InvoiceSendInvoice,
} from './sendInvoice';
import {
  JOB_CLIENT_EMAIL_NO_CLIENT,
  decideJobClientEmailSave,
  jobClientEmailRow,
  jobClientEmailToStore,
} from './saveJobClientEmail';

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
  phone: '0412 345 678',
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

describe('invoice-send client email — save / miss', () => {
  it('reuses saveJobClientEmail on this invoice client_id — blank stays empty, no second client', () => {
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

  it('hides the editor when there is no client — does not invent one', () => {
    expect(jobClientEmailRow({ clientId: null, client: null }).kind).toBe('none');
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

  it('keeps blank / invalid as an honest no_email miss — Send uses a real saved address', () => {
    expect(clientEmailForSend(jobClientEmailToStore(''))).toBeNull();
    expect(clientEmailForSend(jobClientEmailToStore('not-an-email'))).toBeNull();
    expect(clientEmailForSend(jobClientEmailToStore('jane@acme.com.au'))).toBe('jane@acme.com.au');
    expect(NO_EMAIL_MESSAGE).toMatch(/no email/i);

    const afterBlank = decideInvoiceSend(bundle({
      client: { ...client, email: jobClientEmailToStore('') },
    }));
    expect(afterBlank.ok).toBe(false);
    if (!afterBlank.ok) expect(afterBlank.blocker).toBe('no_email');

    const afterSave = decideInvoiceSend(bundle({
      client: { ...client, email: jobClientEmailToStore('jane@acme.com.au') },
    }));
    expect(afterSave.ok).toBe(true);
    if (!afterSave.ok) return;
    expect(afterSave.to).toBe('jane@acme.com.au');
  });
});

describe('invoice-send client email — wiring', () => {
  it('saves clients.email on the existing send miss via saveJobClientEmail and does not auto-send', () => {
    const save = src('src/lib/saveJobClientEmail.ts');
    const dialog = src('src/components/invoicing/InvoiceSendDialog.tsx');
    const send = src('src/lib/sendInvoice.ts');
    const deliver = src('src/lib/sendInvoiceDeliver.ts');
    const handleSaveStart = dialog.indexOf('const handleSaveEmail');
    const handleSaveEnd = dialog.indexOf('const handleSend');
    expect(handleSaveStart).toBeGreaterThan(-1);
    expect(handleSaveEnd).toBeGreaterThan(handleSaveStart);
    const handle = dialog.slice(handleSaveStart, handleSaveEnd);
    const handleSendFn = dialog.slice(dialog.indexOf('const handleSend'), dialog.indexOf('const ready'));

    expect(save).toContain("from('clients')");
    expect(save).toContain('update({ email:');
    expect(save).toContain('.eq(\'id\', decision.clientId)');
    expect(save).not.toContain('insert({');
    expect(save).not.toContain('CREATE TABLE');
    expect(save).not.toContain('ALTER TABLE');
    expect(save).not.toContain('cron.schedule');
    expect(save).not.toContain('deliverInvoice');
    expect(save).not.toContain('InvoiceSendDialog');

    expect(dialog).toContain('saveJobClientEmail');
    expect(dialog).toContain('jobClientEmailRow');
    expect(dialog).toContain('handleSaveEmail()');
    expect(dialog).toContain('job-client-email');
    expect(dialog).toContain('job-client-email-save');
    expect(dialog).toContain('aria-label="Client email"');
    expect(dialog).toContain("kind === 'edit'");
    expect(dialog).toContain("blocker === 'no_email'");
    expect(dialog).toContain('jobClientEmailRow({');
    expect(dialog).toContain('clientId: invoiceClientId');
    expect(dialog).not.toContain('ClientEmailDialog');
    expect(dialog).not.toContain('InvoiceClientEmailDialog');
    expect(dialog).not.toContain('AU_EMAIL_PLACEHOLDER');
    expect(dialog).not.toContain('className="btn-primary job-client-email-save"');
    expect(dialog).not.toContain('className="ops-next-control-block job-client-email-save"');
    expect(dialog).not.toContain('attachReportClient');

    expect(handle).toContain('saveJobClientEmail');
    expect(handle).toContain('emailRow.clientId');
    expect(handle).toContain('clientEmailDraft');
    expect(handle).toContain('decideInvoiceSend(next)');
    expect(handle).not.toContain('deliverInvoice');
    expect(handle).not.toContain('handleSend');
    expect(handle).not.toContain('onSent');
    expect(handle).not.toContain('insert({');
    expect(handle).not.toContain('chased_at');

    expect(handleSendFn).toContain('deliverInvoice');
    expect(handleSendFn).not.toContain('saveJobClientEmail');
    expect(handleSendFn).not.toContain('if (!decision?.ok) return');

    expect(send).not.toContain('saveJobClientEmail');
    expect(deliver).not.toContain('saveJobClientEmail');
  });

  it('does not add a second 44px — Save is muted on the miss, primary stays Send', () => {
    const dialog = src('src/components/invoicing/InvoiceSendDialog.tsx');
    const css = src('src/index.css');
    const sendCssStart = css.indexOf('.hub-invoice-send .job-client-email');
    expect(sendCssStart).toBeGreaterThan(-1);
    const sendCss = css.slice(sendCssStart, css.indexOf('.hub-invoice-send-xero-miss'));

    expect(dialog).toContain('className="btn-primary"');
    expect(dialog).toContain('Send invoice');
    expect(dialog).toContain('job-client-email-save');
    expect(dialog).toContain('showSend');
    expect(dialog).toContain('disabled={sending || !ready}');
    expect(dialog).not.toContain('Add client email');
    expect(dialog).not.toContain('className="btn-primary job-client-email-save"');
    expect(sendCss).toContain('.job-client-email-save');
    expect(sendCss).toContain('.job-client-email-addr');
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
    expect(sendCss).toMatch(/\.job-client-email-save[\s\S]*color: #5B6B7C/);
    expect(sendCss).toMatch(/\.job-client-email-addr[\s\S]*color: #0A2540/);

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

  it('keeps Flameboy look shots for no-email miss, after-save ready, and no-client', () => {
    const shots = [
      'docs/look/invoice-send-email-miss-desktop.png',
      'docs/look/invoice-send-email-miss-ute.png',
      'docs/look/invoice-send-email-ready-desktop.png',
      'docs/look/invoice-send-email-ready-ute.png',
      'docs/look/invoice-send-email-no-client-desktop.png',
      'docs/look/invoice-send-email-no-client-ute.png',
    ];
    for (const shot of shots) {
      expect(existsSync(resolve(process.cwd(), shot)), shot).toBe(true);
    }
  });

  it('disables Send invoice on no_email until a sendable save — no silent handleSend return', () => {
    const dialog = src('src/components/invoicing/InvoiceSendDialog.tsx');
    const handleSave = dialog.slice(dialog.indexOf('const handleSaveEmail'), dialog.indexOf('const handleSend'));
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
    expect(handleSendFn).not.toMatch(/if \(!decision\?\.ok\) return/);

    const afterSave = decideInvoiceSend(bundle({
      client: { ...client, email: jobClientEmailToStore('jane@acme.com.au') },
    }));
    expect(afterSave.ok).toBe(true);
    const stillMiss = decideInvoiceSend(bundle({
      client: { ...client, email: jobClientEmailToStore('') },
    }));
    expect(stillMiss.ok).toBe(false);
  });

  it('points the no_email miss at the field on this dialog — does not bounce to the client record', () => {
    const dialog = src('src/components/invoicing/InvoiceSendDialog.tsx');
    expect(dialog).toContain('INVOICE_SEND_NO_EMAIL_FIELD');
    expect(dialog).toContain('Add one below before you send.');
    expect(dialog).toContain('This client has no email. Add one below before you send.');
    expect(dialog).not.toContain('Add one on the client record');
    expect(dialog).not.toContain('client record');
    expect(dialog).not.toContain('/clients/');
    expect(dialog).not.toContain('Open client');
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
    expect(send).toContain('NO_SMTP_MESSAGE');
    expect(send).toContain('clientEmailForSend');
    expect(send).toContain('COMPANY_EMAIL_SETTINGS_HREF');
    expect(send).toContain(COMPANY_EMAIL_SETTINGS_HREF);
    expect(send).toContain('smsTo');
    expect(send).toContain('pickInvoicePdfAttachment');
    expect(deliver).toContain('export async function deliverInvoice');
    expect(deliver).not.toContain('saveJobClientEmail');
    expect(send).not.toContain('saveJobClientEmail');
    expect(reportDialog).toContain('saveJobClientEmail');
    expect(reportDialog).toContain('REPORT_SEND_NO_EMAIL_FIELD');
  });

  it('leaves quote convert / PR #17 off this control', () => {
    const save = src('src/lib/saveJobClientEmail.ts');
    const dialog = src('src/components/invoicing/InvoiceSendDialog.tsx');
    const quoteConvert = src('src/lib/convertQuoteToInvoice.ts');
    const quoteNext = src('src/lib/quoteNextAction.ts');
    expect(save).not.toContain('convertQuoteToInvoice');
    expect(save).not.toContain('sendQuote');
    expect(save).not.toContain('QuoteSendDialog');
    expect(quoteConvert).not.toContain('saveJobClientEmail');
    expect(quoteNext).not.toContain('saveJobClientEmail');
    expect(dialog).not.toContain('QuoteSendDialog');
    expect(dialog).not.toContain('sendQuote');
    expect(dialog).not.toContain('sendQuoteDeliver');
    expect(dialog).not.toContain('convertQuoteToInvoice');
  });
});
