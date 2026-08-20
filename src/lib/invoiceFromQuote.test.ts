import { describe, expect, it } from 'vitest';
import {
  INVOICE_SOURCE_JOB_BILL,
  INVOICE_SOURCE_QUOTE,
  buildInvoiceFromQuote,
  invoiceHref,
  invoiceLandingPath,
  invoiceLinesFromQuote,
  isJobBillInvoice,
  isoDatePlusDays,
  pickReusableInvoice,
} from './invoiceFromQuote';

const quote = {
  id: 'quote-1',
  quote_number: 12,
  client_id: 'client-1',
  job_id: 'job-1',
  notes: 'Site access via side gate',
  inclusions: ['Materials'],
  exclusions: ['After-hours callouts'],
  line_items: [
    { description: 'Switchboard labour', quantity: 4, unit_price: 120, charge_type: 'Labour', unit_cost: 80, markup_percent: 50 },
    { description: '  ', quantity: 1, unit_price: 10 },
    { description: 'Cable', quantity: 0, unit_price: 5 },
  ],
};

describe('invoiceLinesFromQuote', () => {
  it('copies chargeable lines and drops empty / zero qty', () => {
    const lines = invoiceLinesFromQuote(quote.line_items);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      description: 'Switchboard labour',
      quantity: 4,
      unit_price: 120,
      charge_type: 'Labour',
      unit_cost: 80,
      markup_percent: 50,
    });
  });
});

describe('buildInvoiceFromQuote', () => {
  it('copies lines, GST from company rate, and quote_id / job_id', () => {
    const inv = buildInvoiceFromQuote(quote, 10, '2026-09-19');
    expect(inv.quote_id).toBe('quote-1');
    expect(inv.job_id).toBe('job-1');
    expect(inv.client_id).toBe('client-1');
    expect(inv.status).toBe('draft');
    expect(inv.source).toBe(INVOICE_SOURCE_QUOTE);
    expect(inv.tax_rate).toBe(10);
    expect(inv.subtotal).toBe(480);
    expect(inv.tax_amount).toBe(48);
    expect(inv.total).toBe(528);
    expect(inv.notes).toBe('From quote #0012');
    expect(inv.inclusions).toEqual(['Materials']);
    expect(inv.exclusions).toEqual(['After-hours callouts']);
    expect(inv.due_date).toBe('2026-09-19');
  });

  it('recalculates GST from company default even if the quote was stored at another rate', () => {
    const inv = buildInvoiceFromQuote(quote, 0, '2026-09-19');
    expect(inv.tax_rate).toBe(0);
    expect(inv.tax_amount).toBe(0);
    expect(inv.total).toBe(480);
  });
});

describe('isJobBillInvoice / pickReusableInvoice', () => {
  it('matches quote_id when the job bill is linked to a quote', () => {
    expect(isJobBillInvoice({ quote_id: 'q1', source: null, notes: 'Manual' }, 'q1')).toBe(true);
    expect(isJobBillInvoice({ quote_id: 'q2', source: null, notes: 'Manual' }, 'q1')).toBe(false);
  });

  it('matches source=job_bill without relying on notes', () => {
    expect(isJobBillInvoice({ source: INVOICE_SOURCE_JOB_BILL, notes: 'Changed later', quote_id: null })).toBe(true);
  });

  it('falls back to From job bill notes for older rows', () => {
    expect(isJobBillInvoice({ source: null, notes: 'From job bill (do & charge)', quote_id: null })).toBe(true);
    expect(isJobBillInvoice({ source: null, notes: 'Site notes', quote_id: null })).toBe(false);
  });

  it('prefers a draft when several invoices exist', () => {
    const picked = pickReusableInvoice([
      { id: 'sent', status: 'sent' },
      { id: 'draft', status: 'draft' },
    ]);
    expect(picked?.id).toBe('draft');
  });

  it('returns null when there is nothing to reuse', () => {
    expect(pickReusableInvoice([])).toBeNull();
  });
});

describe('isoDatePlusDays / invoiceHref', () => {
  it('adds calendar days in local time', () => {
    expect(isoDatePlusDays(30, new Date(2026, 7, 20))).toBe('2026-09-19');
  });

  it('opens the invoice editor, not the bare list', () => {
    expect(invoiceHref('inv-1')).toBe('/invoices?id=inv-1');
  });

  it('lands on the job hub when the quote already has a job', () => {
    expect(invoiceLandingPath('job-1', 'inv-1')).toBe('/jobs/job-1');
  });

  it('opens the invoice when there is no job', () => {
    expect(invoiceLandingPath(null, 'inv-1')).toBe('/invoices?id=inv-1');
  });
});
