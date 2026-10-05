import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calcLineDocumentTotals } from './gst';
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
import { PRICE_BOOK_IMPORT_SAMPLE_CSV, previewPriceBookImport, parsePriceBookSheet, saveItemsFromPreview, suggestPriceBookMapping } from './priceBookImport';

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
      gst_rate: null,
    });
  });

  it('copies each line gst_rate onto the invoice line', () => {
    const lines = invoiceLinesFromQuote([
      { description: 'Taxed labour', quantity: 1, unit_price: 100, gst_rate: 10 },
      { description: 'GST-free fitting', quantity: 1, unit_price: 50, gst_rate: 0 },
    ]);
    expect(lines).toEqual([
      expect.objectContaining({ description: 'Taxed labour', gst_rate: 10 }),
      expect.objectContaining({ description: 'GST-free fitting', gst_rate: 0 }),
    ]);
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

  it('uses the same per-line GST helper as quotes', () => {
    const helper = readFileSync(new URL('./invoiceFromQuote.ts', import.meta.url), 'utf8');
    expect(helper).toContain('calcLineDocumentTotals(line_items, taxRate)');
    expect(helper).not.toContain('calcDocumentTotals(rawSubtotal, taxRate)');
  });

  it('converts a mixed 10% + 0% quote to $150 / $10 / $160', () => {
    const inv = buildInvoiceFromQuote({
      ...quote,
      line_items: [
        { description: 'Taxed labour', quantity: 1, unit_price: 100, gst_rate: 10 },
        { description: 'GST-free fitting', quantity: 1, unit_price: 50, gst_rate: 0 },
      ],
    }, 10, '2026-09-19');
    expect(inv.line_items.map(li => li.gst_rate)).toEqual([10, 0]);
    expect(inv.subtotal).toBe(150);
    expect(inv.tax_amount).toBe(10);
    expect(inv.total).toBe(160);
  });

  it('converts an old quote with no line rates to the same totals as before', () => {
    const line_items = [
      { description: 'Site labour', quantity: 8, unit_price: 95 },
      { description: 'Fitting', quantity: 2, unit_price: 12.5 },
    ];
    const inv = buildInvoiceFromQuote({ ...quote, line_items }, 10, '2026-09-19');
    expect(inv.line_items.every(li => li.gst_rate == null)).toBe(true);
    expect(inv).toMatchObject({
      subtotal: 785,
      tax_amount: 78.5,
      total: 863.5,
    });
    const fallback = calcLineDocumentTotals(line_items, 10);
    expect(inv.subtotal).toBe(fallback.subtotal);
    expect(inv.tax_amount).toBe(fallback.taxAmount);
    expect(inv.total).toBe(fallback.total);
  });

  it('totals the sample CSV last-wins pair PB-DEL-01 + PB-DEL-09', () => {
    const saved = saveItemsFromPreview(
      previewPriceBookImport(
        parsePriceBookSheet(PRICE_BOOK_IMPORT_SAMPLE_CSV),
        suggestPriceBookMapping(parsePriceBookSheet(PRICE_BOOK_IMPORT_SAMPLE_CSV).headers),
      ),
    );
    const conduit = saved.find(item => item.code === 'PB-DEL-01');
    const fitting = saved.find(item => item.code === 'PB-DEL-09');
    expect(conduit).toMatchObject({ sell: 9.2, gst: 10 });
    expect(fitting).toMatchObject({ sell: 24, gst: 0 });
    const inv = buildInvoiceFromQuote({
      ...quote,
      line_items: [
        { description: conduit!.name, quantity: 1, unit_price: conduit!.sell, gst_rate: conduit!.gst },
        { description: fitting!.name, quantity: 1, unit_price: fitting!.sell, gst_rate: fitting!.gst },
      ],
    }, 10, '2026-09-19');
    expect(inv).toMatchObject({
      subtotal: 33.2,
      tax_amount: 0.92,
      total: 34.12,
    });
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
