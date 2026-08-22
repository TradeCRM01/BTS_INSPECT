import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decideQuoteSend, type QuoteSendBundle, type QuoteSendQuote } from './sendQuote';
import {
  QUOTE_CLIENT_ATTACH_NO_CLIENTS,
  companyClientsForAttach,
  decideQuoteClientAttach,
  quoteClientAttachRow,
} from './attachQuoteClient';
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
  from_email: 'quotes@btselectrical.com.au',
};

const company = { name: 'BTS Electrical', email: 'office@btselectrical.com.au' };

const quote: QuoteSendQuote = {
  id: 'q1',
  company_id: 'co1',
  quote_number: 12,
  client_id: null,
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

function bundle(over: Partial<QuoteSendBundle> = {}): QuoteSendBundle {
  return {
    quote,
    client: null,
    jobAddress: 'Warehouse B',
    smtp,
    company,
    ...over,
  };
}

describe('quote-send client attach — miss / pick', () => {
  it('lists existing company clients only — no invented placeholder', () => {
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
  });

  it('hides the picker when there is already a client — does not invent one when the company has none', () => {
    const noClient = decideQuoteSend(bundle());
    expect(noClient.ok).toBe(false);
    if (!noClient.ok) expect(noClient.blocker).toBe('no_client');
    expect(decideQuoteClientAttach({
      quoteId: 'q1',
      quoteClientId: null,
      clientId: 'c1',
      companyClients: [acme],
    })).toEqual({ action: 'write', quoteId: 'q1', clientId: 'c1' });
    expect(decideQuoteClientAttach({
      quoteId: 'q1',
      quoteClientId: null,
      clientId: 'c1',
      companyClients: [],
    }).action).toBe('miss');
  });

  it('after attach, a client without email is an honest no_email miss — does not auto-send', () => {
    const after = decideQuoteSend(bundle({
      quote: { ...quote, client_id: 'c1' },
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

describe('quote-send client attach — wiring', () => {
  it('attaches an existing company client on this quote via attachQuoteClient and does not auto-send', () => {
    const attach = src('src/lib/attachQuoteClient.ts');
    const dialog = src('src/components/invoicing/QuoteSendDialog.tsx');
    const send = src('src/lib/sendQuote.ts');
    const deliver = src('src/lib/sendQuoteDeliver.ts');
    const handleStart = dialog.indexOf('const handleAttach');
    const handleEnd = dialog.indexOf('const handleSaveEmail');
    expect(handleStart).toBeGreaterThan(-1);
    expect(handleEnd).toBeGreaterThan(handleStart);
    const handle = dialog.slice(handleStart, handleEnd);
    const handleSendFn = dialog.slice(dialog.indexOf('const handleSend'), dialog.indexOf('const ready'));

    expect(attach).toContain("from('quotes')");
    expect(attach).toContain('update({ client_id:');
    expect(attach).not.toContain('insert({');
    expect(attach).not.toContain('QuoteSendDialog');
    expect(attach).not.toContain('deliverQuote');

    expect(dialog).toContain('attachQuoteClient');
    expect(dialog).toContain('quoteClientAttachRow');
    expect(dialog).toContain('handleAttach()');
    expect(dialog).toContain('job-client-attach');
    expect(dialog).toContain('job-client-attach-save');
    expect(dialog).toContain('aria-label="Attach client"');
    expect(dialog).toContain("kind === 'pick'");
    expect(dialog).toContain("kind === 'miss'");
    expect(dialog).toContain('QUOTE_CLIENT_ATTACH_NO_CLIENTS');
    expect(dialog).toContain("from('clients')");
    expect(dialog).toContain("eq('archived', false)");
    expect(dialog).toContain("eq('company_id', company.id)");
    expect(dialog).toContain("queryKey: ['quote-attach-clients'");
    expect(dialog).toContain('quoteClientAttachRow({');
    expect(dialog).toContain('quoteClientId');
    expect(dialog).toContain("blocker === 'no_client'");
    expect(dialog).not.toContain('Open client');
    expect(dialog).not.toContain('ClientAttachDialog');
    expect(dialog).not.toContain('Create client');
    expect(dialog).not.toContain('InvoiceSendDialog');

    expect(handle).toContain('attachQuoteClient');
    expect(handle).toContain('clientAttachDraft');
    expect(handle).toContain('decideQuoteSend(next)');
    expect(handle).not.toContain('deliverQuote');
    expect(handle).not.toContain('handleSend');
    expect(handle).not.toContain('onSent');
    expect(handle).not.toContain('insert({');
    expect(handle).not.toContain('saveJobClientEmail');

    expect(handleSendFn).toContain('deliverQuote');
    expect(handleSendFn).not.toContain('attachQuoteClient');
    expect(send).not.toContain('attachQuoteClient');
    expect(deliver).not.toContain('attachQuoteClient');
  });

  it('reuses the signed email field after attach — does not invent a second editor', () => {
    const dialog = src('src/components/invoicing/QuoteSendDialog.tsx');
    expect(dialog).toContain('jobClientEmailRow({');
    expect(dialog).toContain('clientId: quoteClientId');
    expect(dialog).toContain("emailRow.kind === 'edit'");
    expect(dialog).toContain('job-client-email');
    expect(dialog).toContain('saveJobClientEmail');
    expect(dialog).toContain('handleSaveEmail()');
    expect(dialog).toContain("blocker === 'no_email'");
    expect(dialog).not.toContain('job-client-attach-email');
    expect(dialog).not.toContain('ClientEmailDialog');
  });

  it('does not add a second 44px — Save is muted on the miss, primary stays Send quote', () => {
    const dialog = src('src/components/invoicing/QuoteSendDialog.tsx');
    const css = src('src/index.css');
    const sendCssStart = css.indexOf('.hub-invoice-send .job-client-attach');
    expect(sendCssStart).toBeGreaterThan(-1);
    const sendCss = css.slice(sendCssStart, css.indexOf('.hub-invoice-send-xero-miss'));

    expect(dialog).toContain('className="btn-primary"');
    expect(dialog).toContain('Send quote');
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

  it('leaves quote convert / invoice send / report send / PR #17 off this control', () => {
    const attach = src('src/lib/attachQuoteClient.ts');
    const dialog = src('src/components/invoicing/QuoteSendDialog.tsx');
    const quoteConvert = src('src/lib/convertQuoteToInvoice.ts');
    const quoteNext = src('src/lib/quoteNextAction.ts');
    expect(attach).not.toContain('convertQuoteToInvoice');
    expect(attach).not.toContain('sendQuote');
    expect(quoteConvert).not.toContain('attachQuoteClient');
    expect(quoteNext).not.toContain('attachQuoteClient');
    expect(dialog).not.toContain('convertQuoteToInvoice');
    expect(dialog).not.toContain('deliverInvoice');
    expect(dialog).not.toContain('InvoiceSendDialog');
    expect(dialog).not.toContain('ReportSendDialog');
    expect(dialog).not.toContain('send-quote');
    expect(dialog).not.toContain('Relovi');
    expect(dialog).not.toContain('Littleloop');
    expect(dialog).not.toContain('Manrope');
  });
});
