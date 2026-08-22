import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decideInvoiceSend, type InvoiceSendBundle, type InvoiceSendInvoice } from './sendInvoice';
import {
  INVOICE_CLIENT_ATTACH_NO_CLIENTS,
  companyClientsForAttach,
  decideInvoiceClientAttach,
  invoiceClientAttachRow,
} from './attachInvoiceClient';
import { jobClientEmailRow } from './saveJobClientEmail';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const acme = { id: 'c1', name: 'Acme Plumbing' };
const brooks = { id: 'c2', name: 'Brooks Electrical' };

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
  client_id: null,
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

function bundle(over: Partial<InvoiceSendBundle> = {}): InvoiceSendBundle {
  return {
    invoice,
    client: null,
    jobAddress: 'Warehouse B',
    smtp,
    company,
    ...over,
  };
}

describe('invoice-send client attach — miss / pick', () => {
  it('lists existing company clients only — no invented placeholder', () => {
    expect(companyClientsForAttach([acme, { id: 'x', name: '  ', archived: false }, brooks])).toEqual([
      acme,
      brooks,
    ]);
    expect(invoiceClientAttachRow({
      invoiceClientId: null,
      companyClients: [acme, brooks],
    })).toEqual({ kind: 'pick', clients: [acme, brooks] });
    expect(invoiceClientAttachRow({
      invoiceClientId: null,
      companyClients: [],
    })).toEqual({ kind: 'miss', reason: 'no_clients', message: INVOICE_CLIENT_ATTACH_NO_CLIENTS });
    expect(invoiceClientAttachRow({
      invoiceClientId: 'c1',
      companyClients: [acme],
    }).kind).toBe('linked');
  });

  it('hides the picker when there is already a client — does not invent one when the company has none', () => {
    const noClient = decideInvoiceSend(bundle());
    expect(noClient.ok).toBe(false);
    if (!noClient.ok) expect(noClient.blocker).toBe('no_client');
    expect(decideInvoiceClientAttach({
      invoiceId: 'inv-1',
      invoiceClientId: null,
      clientId: 'c1',
      companyClients: [acme],
    })).toEqual({ action: 'write', invoiceId: 'inv-1', clientId: 'c1' });
    expect(decideInvoiceClientAttach({
      invoiceId: 'inv-1',
      invoiceClientId: null,
      clientId: 'c1',
      companyClients: [],
    }).action).toBe('miss');
  });

  it('after attach, a client without email is an honest no_email miss — does not auto-send', () => {
    const after = decideInvoiceSend(bundle({
      invoice: { ...invoice, client_id: 'c1' },
      client: { id: 'c1', name: 'Acme Plumbing', email: null, phone: null, address: null },
    }));
    expect(after.ok).toBe(false);
    if (!after.ok) expect(after.blocker).toBe('no_email');
    expect(jobClientEmailRow({
      clientId: 'c1',
      client: { id: 'c1', email: null },
    }).kind).toBe('edit');
  });
});

describe('invoice-send client attach — wiring', () => {
  it('attaches an existing company client on this invoice via attachInvoiceClient and does not auto-send', () => {
    const attach = src('src/lib/attachInvoiceClient.ts');
    const dialog = src('src/components/invoicing/InvoiceSendDialog.tsx');
    const send = src('src/lib/sendInvoice.ts');
    const deliver = src('src/lib/sendInvoiceDeliver.ts');
    const handleStart = dialog.indexOf('const handleAttach');
    const handleEnd = dialog.indexOf('const handleSaveEmail');
    expect(handleStart).toBeGreaterThan(-1);
    expect(handleEnd).toBeGreaterThan(handleStart);
    const handle = dialog.slice(handleStart, handleEnd);
    const handleSendFn = dialog.slice(dialog.indexOf('const handleSend'), dialog.indexOf('const ready'));

    expect(attach).toContain("from('invoices')");
    expect(attach).toContain('update({ client_id:');
    expect(attach).not.toContain('insert({');
    expect(attach).not.toContain('InvoiceSendDialog');
    expect(attach).not.toContain('deliverInvoice');

    expect(dialog).toContain('attachInvoiceClient');
    expect(dialog).toContain('invoiceClientAttachRow');
    expect(dialog).toContain('handleAttach()');
    expect(dialog).toContain('job-client-attach');
    expect(dialog).toContain('job-client-attach-save');
    expect(dialog).toContain('aria-label="Attach client"');
    expect(dialog).toContain("kind === 'pick'");
    expect(dialog).toContain("kind === 'miss'");
    expect(dialog).toContain('INVOICE_CLIENT_ATTACH_NO_CLIENTS');
    expect(dialog).toContain("from('clients')");
    expect(dialog).toContain("eq('archived', false)");
    expect(dialog).toContain("eq('company_id', company.id)");
    expect(dialog).toContain("queryKey: ['invoice-attach-clients'");
    expect(dialog).toContain('invoiceClientAttachRow({');
    expect(dialog).toContain('invoiceClientId');
    expect(dialog).toContain("blocker === 'no_client'");
    expect(dialog).not.toContain('Open client');
    expect(dialog).not.toContain('ClientAttachDialog');
    expect(dialog).not.toContain('Create client');
    expect(dialog).not.toContain('QuoteSendDialog');

    expect(handle).toContain('attachInvoiceClient');
    expect(handle).toContain('clientAttachDraft');
    expect(handle).toContain('decideInvoiceSend(next)');
    expect(handle).not.toContain('deliverInvoice');
    expect(handle).not.toContain('handleSend');
    expect(handle).not.toContain('onSent');
    expect(handle).not.toContain('insert({');
    expect(handle).not.toContain('saveJobClientEmail');

    expect(handleSendFn).toContain('deliverInvoice');
    expect(handleSendFn).not.toContain('attachInvoiceClient');
    expect(send).not.toContain('attachInvoiceClient');
    expect(deliver).not.toContain('attachInvoiceClient');
  });

  it('reuses the signed email field after attach — does not invent a second editor', () => {
    const dialog = src('src/components/invoicing/InvoiceSendDialog.tsx');
    expect(dialog).toContain('jobClientEmailRow({');
    expect(dialog).toContain('clientId: invoiceClientId');
    expect(dialog).toContain("emailRow.kind === 'edit'");
    expect(dialog).toContain('job-client-email');
    expect(dialog).toContain('saveJobClientEmail');
    expect(dialog).toContain('handleSaveEmail()');
    expect(dialog).toContain("blocker === 'no_email'");
    expect(dialog).not.toContain('job-client-attach-email');
    expect(dialog).not.toContain('ClientEmailDialog');
  });

  it('does not add a second 44px — Save is muted on the miss, primary stays Send invoice', () => {
    const dialog = src('src/components/invoicing/InvoiceSendDialog.tsx');
    const css = src('src/index.css');
    const sendCssStart = css.indexOf('.hub-invoice-send .job-client-attach');
    expect(sendCssStart).toBeGreaterThan(-1);
    const sendCss = css.slice(sendCssStart, css.indexOf('.hub-invoice-send-xero-miss'));

    expect(dialog).toContain('className="btn-primary"');
    expect(dialog).toContain('Send invoice');
    expect(dialog).toContain('job-client-attach-save');
    expect(dialog).toContain('showSend');
    expect(dialog).toContain('disabled={sending || !ready}');
    expect(dialog).not.toContain('Open client');
    expect(dialog).not.toContain('className="btn-primary job-client-attach-save"');
    expect(sendCss).toContain('.job-client-attach-save');
    expect(sendCss).not.toContain('min-height: 44px');
    expect(sendCss).not.toContain('btn-primary');
    expect(sendCss).toContain('font-size: 12px');
    expect(sendCss).toContain('#D5DCE3');
    expect(sendCss).toContain('#5B6B7C');
    expect(sendCss).toMatch(/\.job-client-attach-save[\s\S]*color: #5B6B7C/);
  });

  it('keeps Flameboy look shots for pick, no-clients, after-attach no-email, and linked', () => {
    const shots = [
      'docs/look/invoice-send-attach-pick-desktop.png',
      'docs/look/invoice-send-attach-pick-ute.png',
      'docs/look/invoice-send-attach-no-clients-desktop.png',
      'docs/look/invoice-send-attach-no-clients-ute.png',
      'docs/look/invoice-send-attach-no-email-desktop.png',
      'docs/look/invoice-send-attach-no-email-ute.png',
      'docs/look/invoice-send-attach-linked-desktop.png',
      'docs/look/invoice-send-attach-linked-ute.png',
    ];
    for (const shot of shots) {
      expect(existsSync(resolve(process.cwd(), shot)), shot).toBe(true);
    }
  });

  it('leaves quote convert / PR #17 off this control', () => {
    const attach = src('src/lib/attachInvoiceClient.ts');
    const dialog = src('src/components/invoicing/InvoiceSendDialog.tsx');
    const quoteConvert = src('src/lib/convertQuoteToInvoice.ts');
    const quotesPage = src('src/pages/QuotesPage.tsx');
    const quoteNext = src('src/lib/quoteNextAction.ts');
    expect(attach).not.toContain('convertQuoteToInvoice');
    expect(attach).not.toContain('sendQuote');
    expect(quoteConvert).not.toContain('attachInvoiceClient');
    expect(quotesPage).not.toContain('attachInvoiceClient');
    expect(quoteNext).not.toContain('attachInvoiceClient');
    expect(dialog).not.toContain('QuoteSendDialog');
    expect(dialog).not.toContain('sendQuote');
  });
});
