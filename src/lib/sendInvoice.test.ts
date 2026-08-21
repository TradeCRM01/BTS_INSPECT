import { describe, expect, it } from 'vitest';
import {
  applyInvoiceSendScope,
  blobToBase64,
  clientEmailForSend,
  commercialPdfDataForInvoice,
  decideInvoiceSend,
  invoiceByIdQuery,
  invoiceHasChargeableLines,
  invoicePdfFilename,
  invoicePdfStoragePath,
  invoiceSendClientQuery,
  invoiceSendHtml,
  invoiceSendJobQuery,
  invoiceSendQueries,
  invoiceSendSubject,
  invoiceStatusAfterSend,
  invoiceStatusPatchAfterSend,
  isInvoiceSendScoped,
  isSmtpReady,
  pickInvoiceByIdAndCompany,
  pickInvoicePdfAttachment,
  shouldRecordInvoiceSent,
  wouldScanLedgerToSendInvoice,
  type InvoiceSendBundle,
  type InvoiceSendInvoice,
} from './sendInvoice';

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
  email: 'jane@acme.com.au',
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

describe('clientEmailForSend', () => {
  it('prefills To from the client email and rejects empty / invalid', () => {
    expect(clientEmailForSend('jane@acme.com.au')).toBe('jane@acme.com.au');
    expect(clientEmailForSend('  jane@acme.com.au  ')).toBe('jane@acme.com.au');
    expect(clientEmailForSend('')).toBeNull();
    expect(clientEmailForSend(null)).toBeNull();
    expect(clientEmailForSend('not-an-email')).toBeNull();
  });
});

describe('isSmtpReady', () => {
  it('needs the wired Resend host, key, and from address', () => {
    expect(isSmtpReady(smtp)).toBe(true);
    expect(isSmtpReady(null)).toBe(false);
    expect(isSmtpReady({ ...smtp, smtp_host: '' })).toBe(false);
    expect(isSmtpReady({ ...smtp, smtp_pass: '  ' })).toBe(false);
    expect(isSmtpReady({ ...smtp, from_email: 'office' })).toBe(false);
    expect(isSmtpReady({ ...smtp, smtp_host: 'smtp.gmail.com' })).toBe(false);
  });
});

describe('invoiceHasChargeableLines', () => {
  it('needs a description and a quantity', () => {
    expect(invoiceHasChargeableLines([])).toBe(false);
    expect(invoiceHasChargeableLines([{ description: 'Labour', quantity: 0 }])).toBe(false);
    expect(invoiceHasChargeableLines([{ description: '  ', quantity: 1 }])).toBe(false);
    expect(invoiceHasChargeableLines([{ description: 'Labour', quantity: 2 }])).toBe(true);
  });
});

describe('decideInvoiceSend', () => {
  it('prefills To from the invoice client and is ready when SMTP is set', () => {
    expect(decideInvoiceSend(bundle())).toEqual({
      ok: true,
      to: 'jane@acme.com.au',
      toName: 'Acme Plumbing',
      subject: 'Invoice #0018 from BTS Electrical',
      filename: 'invoice-0018.pdf',
    });
  });

  it('does not pretend it sent when the client has no email', () => {
    const decision = decideInvoiceSend(bundle({ client: { ...client, email: null } }));
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.blocker).toBe('no_email');
    expect(decision.message).toMatch(/no email/i);
    expect(decision.href).toBe('/clients/c1');
  });

  it('does not pretend it sent when SMTP is missing', () => {
    const decision = decideInvoiceSend(bundle({ smtp: null }));
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.blocker).toBe('no_smtp');
    expect(decision.message).toMatch(/not set up/i);
    expect(decision.href).toBe('/settings/company');
    expect(decision.message).toMatch(/Company settings/i);
  });

  it('blocks send when there is no client, no priced lines, or the invoice is paid', () => {
    expect(decideInvoiceSend(bundle({ invoice: { ...invoice, client_id: null } })).ok).toBe(false);
    expect(decideInvoiceSend(bundle({
      invoice: { ...invoice, line_items: [{ description: 'Labour', quantity: 0, unit_price: 10 }] },
    })).ok).toBe(false);
    expect(decideInvoiceSend(bundle({ invoice: { ...invoice, status: 'paid' } })).ok).toBe(false);
    expect(decideInvoiceSend(bundle({ invoice: null })).ok).toBe(false);
  });

  it('still allows a resend of an already-sent invoice', () => {
    const decision = decideInvoiceSend(bundle({ invoice: { ...invoice, status: 'sent' } }));
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.to).toBe('jane@acme.com.au');
  });
});

describe('invoiceStatusAfterSend', () => {
  it('marks sent only when delivery succeeded', () => {
    expect(invoiceStatusAfterSend(true, 'draft')).toBe('sent');
    expect(invoiceStatusAfterSend(false, 'draft')).toBe('draft');
    expect(invoiceStatusPatchAfterSend(true)).toEqual({ status: 'sent' });
    expect(invoiceStatusPatchAfterSend(false)).toBeNull();
    expect(shouldRecordInvoiceSent(true, 'draft')).toBe(true);
    expect(shouldRecordInvoiceSent(false, 'draft')).toBe(false);
  });

  it('does not rewrite paid on a successful or failed send', () => {
    expect(invoiceStatusAfterSend(false, 'paid')).toBe('paid');
    expect(invoiceStatusAfterSend(true, 'paid')).toBe('paid');
    expect(shouldRecordInvoiceSent(true, 'paid')).toBe(false);
  });
});

describe('invoice send copy / document name', () => {
  it('names the PDF and subject from the invoice number', () => {
    expect(invoicePdfFilename(18)).toBe('invoice-0018.pdf');
    expect(invoiceSendSubject(18, 'BTS Electrical')).toBe('Invoice #0018 from BTS Electrical');
    expect(invoicePdfStoragePath('co1', 'inv-1')).toBe('invoices/co1/inv-1.pdf');
    expect(invoicePdfStoragePath('', 'inv-1')).toBe('');
  });

  it('mentions the attached PDF and does not invent a portal', () => {
    const html = invoiceSendHtml({
      clientName: 'Jane',
      companyName: 'BTS Electrical',
      invoiceNumber: 18,
      totalLabel: '$484.00',
      dueLabel: '19 Sep 2026',
      paymentTerms: 'Net 30',
      attachedPdf: true,
    });
    expect(html).toContain('Jane');
    expect(html).toContain('#0018');
    expect(html).toContain('PDF is attached');
    expect(html).toContain('$484.00');
    expect(html).toContain('Net 30');
    expect(html).not.toContain('portal');
    expect(html).not.toContain('quote');
  });

  it('does not claim a PDF is attached when none exists', () => {
    const html = invoiceSendHtml({
      clientName: 'Jane',
      companyName: 'BTS Electrical',
      invoiceNumber: 18,
      totalLabel: '$484.00',
      dueLabel: null,
      attachedPdf: false,
    });
    expect(html).not.toContain('PDF is attached');
    expect(html).toContain('#0018');
  });
});

describe('pickInvoicePdfAttachment', () => {
  it('attaches the existing PDF when one is already on file', () => {
    const existing = { filename: 'invoice-0018.pdf', content: 'EXISTING' };
    const generated = { filename: 'invoice-0018.pdf', content: 'GENERATED' };
    expect(pickInvoicePdfAttachment({ existing, generated })?.content).toBe('EXISTING');
    expect(pickInvoicePdfAttachment({ existing: null, generated })?.content).toBe('GENERATED');
    expect(pickInvoicePdfAttachment({ existing: null, generated: null })).toBeNull();
    expect(pickInvoicePdfAttachment({ existing: { filename: 'x.pdf', content: '' }, generated })).toEqual({
      filename: 'invoice-0018.pdf',
      content: 'GENERATED',
      contentType: 'application/pdf',
    });
  });
});

describe('commercialPdfDataForInvoice', () => {
  it('keeps the existing invoice PDF fields — client, lines, GST, due', () => {
    const pdf = commercialPdfDataForInvoice(bundle(), new Date('2026-08-20T10:00:00'));
    expect(pdf).toMatchObject({
      kind: 'invoice',
      docNumber: '#0018',
      clientName: 'Acme Plumbing',
      total: 484,
      taxAmount: 44,
      paymentTerms: 'Net 30',
    });
    expect(pdf?.clientDetail).toContain('jane@acme.com.au');
    expect(pdf?.lines).toHaveLength(1);
    expect(pdf?.secondaryValue).toBe('19 Sep 2026');
  });
});

describe('blobToBase64', () => {
  it('encodes a PDF-sized blob without inventing bytes', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const encoded = await blobToBase64(new Blob([bytes]));
    expect(encoded).toBe(btoa('%PDF'));
  });
});

describe('invoice send query scope', () => {
  it('loads one invoice by id + company, not the company ledger', () => {
    const scopes = invoiceSendQueries({ companyId: 'co1', invoiceId: 'inv-1' });
    expect(isInvoiceSendScoped(scopes.invoice)).toBe(true);
    expect(isInvoiceSendScoped(scopes.smtp)).toBe(true);
    expect(wouldScanLedgerToSendInvoice(scopes.invoice)).toBe(false);
    expect(scopes.invoice.eq).toEqual({ id: 'inv-1', company_id: 'co1' });
    expect(scopes.invoice.columns).not.toBe('*');
    expect(scopes.smtp.eq).toEqual({ company_id: 'co1' });
    expect(invoiceSendClientQuery(null)).toBeNull();
    expect(invoiceSendJobQuery('')).toBeNull();
    expect(invoiceSendClientQuery('c1')?.eq).toEqual({ id: 'c1' });
    expect(invoiceSendJobQuery('job-1')?.eq).toEqual({ id: 'job-1' });
    expect(invoiceByIdQuery({ companyId: 'co1', invoiceId: 'inv-1' })?.eq).toEqual({
      id: 'inv-1',
      company_id: 'co1',
    });
    expect(invoiceByIdQuery({ companyId: '', invoiceId: 'inv-1' })).toBeNull();
  });

  it('treats an unscoped invoices select as a ledger scan', () => {
    expect(wouldScanLedgerToSendInvoice({
      table: 'invoices',
      columns: 'id, status',
      eq: { company_id: 'co1' },
    })).toBe(true);
    expect(wouldScanLedgerToSendInvoice({
      table: 'clients',
      columns: 'id, email',
      eq: {},
    })).toBe(true);
  });

  it('applies id + company_id eq — never an unscoped invoices select', () => {
    const calls: string[] = [];
    const builder = {
      select(columns: string) {
        calls.push(`select:${columns}`);
        return this;
      },
      eq(column: string, value: string) {
        calls.push(`eq:${column}:${value}`);
        return this;
      },
    };
    const scopes = invoiceSendQueries({ companyId: 'co1', invoiceId: 'inv-1' });
    applyInvoiceSendScope(builder, scopes.invoice);
    expect(calls[0]).toMatch(/^select:/);
    expect(calls).toContain('eq:id:inv-1');
    expect(calls).toContain('eq:company_id:co1');
    expect(calls.some(call => call.startsWith('in:'))).toBe(false);
  });

  it('does not scan clients when the invoice has no client', () => {
    expect(wouldScanLedgerToSendInvoice(invoiceSendClientQuery(null))).toBe(false);
  });
});

describe('performance — one invoice, not a ledger walk', () => {
  it('does not walk other companies even when handed a mixed ledger', () => {
    const mixed: Array<{ id: string; company_id: string }> = [];
    for (let i = 0; i < 4000; i++) {
      mixed.push({ id: `other-${i}`, company_id: 'co-other' });
    }
    mixed.push({ id: 'inv-1', company_id: 'co1' });
    const started = performance.now();
    const picked = pickInvoiceByIdAndCompany(mixed, 'inv-1', 'co1');
    const elapsed = performance.now() - started;
    expect(picked).toEqual({ id: 'inv-1', company_id: 'co1' });
    expect(pickInvoiceByIdAndCompany(mixed, 'inv-1', 'co-other')).toBeNull();
    expect(elapsed).toBeLessThan(80);
  });

  it('decides send on one invoice without scanning the book', () => {
    const started = performance.now();
    for (let i = 0; i < 2000; i++) {
      decideInvoiceSend(bundle());
    }
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(80);
  });
});
