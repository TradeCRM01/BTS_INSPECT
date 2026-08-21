import { describe, expect, it } from 'vitest';
import { INVOICE_SOURCE_JOB_BILL, isJobBillInvoice } from './invoiceFromQuote';
import {
  JOB_BILL_INVOICE_CREATED,
  JOB_BILL_INVOICE_EXISTS,
  JOB_BILL_INVOICE_NO_CLIENT,
  JOB_BILL_INVOICE_NO_LINES,
  JOB_BILL_INVOICE_NOTES,
  buildInvoiceFromJobBill,
  decideJobBillInvoice,
  invoiceLinesFromJobCosts,
  reuseAfterUniqueConflict,
} from './invoiceFromJobBill';

const labour = {
  description: 'Switchboard labour',
  quantity: 4,
  unit_price: 120,
  unit_cost: 80,
  markup_percent: 50,
  charge_type: 'Labour',
  stock_item_id: 'stock-1',
  cost_model_id: 'model-1',
};

const cable = {
  description: 'Cable',
  quantity: 10,
  unit_price: 6.5,
  unit_cost: 5,
  markup_percent: 30,
  charge_type: 'Materials',
  stock_item_id: null,
  cost_model_id: null,
};

describe('invoiceLinesFromJobCosts', () => {
  it('copies chargeable bill lines and drops empty / zero qty', () => {
    const lines = invoiceLinesFromJobCosts([
      labour,
      { description: '  ', quantity: 1, unit_price: 10, charge_type: '' },
      { description: 'Waste', quantity: 0, unit_price: 5, charge_type: 'Other' },
      { description: null, quantity: 2, unit_price: 15, charge_type: '  ' },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({
      description: 'Switchboard labour',
      quantity: 4,
      unit_price: 120,
      unit_cost: 80,
      markup_percent: 50,
      charge_type: 'Labour',
      stock_item_id: 'stock-1',
      price_book_item_id: null,
      cost_model_id: 'model-1',
    });
  });

  it('uses charge_type when description is blank — still a bill line, not invented', () => {
    const lines = invoiceLinesFromJobCosts([
      { description: '  ', quantity: 2, unit_price: 90, charge_type: 'Call-out' },
    ]);
    expect(lines).toEqual([expect.objectContaining({
      description: 'Call-out',
      quantity: 2,
      unit_price: 90,
    })]);
  });

  it('charges unit_cost when the bill has no unit_price — does not invent a markup', () => {
    const lines = invoiceLinesFromJobCosts([
      { description: 'Consumable', quantity: 3, unit_price: null, unit_cost: 12 },
    ]);
    expect(lines[0]).toMatchObject({ unit_price: 12, unit_cost: 12, quantity: 3 });
  });

  it('keeps a zero-priced line when qty and description are real', () => {
    const lines = invoiceLinesFromJobCosts([
      { description: 'No charge attend', quantity: 1, unit_price: 0, unit_cost: 0 },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].unit_price).toBe(0);
  });

  it('returns nothing when the bill is empty', () => {
    expect(invoiceLinesFromJobCosts([])).toEqual([]);
    expect(invoiceLinesFromJobCosts(null)).toEqual([]);
    expect(invoiceLinesFromJobCosts(undefined)).toEqual([]);
  });
});

describe('buildInvoiceFromJobBill', () => {
  const lines = invoiceLinesFromJobCosts([labour, cable]);

  it('links job + client, copies lines, and uses existing GST math', () => {
    const inv = buildInvoiceFromJobBill({
      clientId: 'client-1',
      jobId: 'job-1',
      taxRate: 10,
      lines,
    });
    expect(inv.client_id).toBe('client-1');
    expect(inv.job_id).toBe('job-1');
    expect(inv.quote_id).toBeNull();
    expect(inv.status).toBe('draft');
    expect(inv.source).toBe(INVOICE_SOURCE_JOB_BILL);
    expect(inv.line_items).toEqual(lines);
    expect(inv.subtotal).toBe(545);
    expect(inv.tax_rate).toBe(10);
    expect(inv.tax_amount).toBe(54.5);
    expect(inv.total).toBe(599.5);
    expect(inv.due_date).toBeNull();
    expect(inv.notes).toBe(JOB_BILL_INVOICE_NOTES);
    expect(inv.inclusions).toEqual([]);
    expect(inv.exclusions).toEqual([]);
    expect(inv.payment_terms).toBe('Net 30');
    expect(isJobBillInvoice(inv)).toBe(true);
  });

  it('does not write send / chase / overdue fields', () => {
    const inv = buildInvoiceFromJobBill({
      clientId: 'client-1',
      jobId: 'job-1',
      taxRate: 10,
      lines,
    });
    expect(inv).not.toHaveProperty('chased_at');
    expect(inv).not.toHaveProperty('sent_at');
    expect(inv.status).not.toBe('overdue');
    expect(inv.status).not.toBe('sent');
    expect(inv.status).not.toBe('paid');
    expect(Object.keys(inv).sort()).toEqual([
      'client_id',
      'due_date',
      'exclusions',
      'inclusions',
      'job_id',
      'line_items',
      'notes',
      'payment_terms',
      'quote_id',
      'source',
      'status',
      'subtotal',
      'tax_amount',
      'tax_rate',
      'total',
    ]);
  });

  it('recalculates GST from the company rate — does not invent a tax engine', () => {
    const inv = buildInvoiceFromJobBill({
      clientId: 'client-1',
      jobId: 'job-1',
      taxRate: 0,
      lines,
    });
    expect(inv.tax_rate).toBe(0);
    expect(inv.tax_amount).toBe(0);
    expect(inv.total).toBe(545);
  });
});

describe('decideJobBillInvoice', () => {
  const lines = invoiceLinesFromJobCosts([labour]);

  it('misses without inventing a client', () => {
    expect(decideJobBillInvoice({ clientId: null, lines, existing: [] })).toEqual({
      action: 'miss',
      reason: 'no_client',
      message: JOB_BILL_INVOICE_NO_CLIENT,
    });
    expect(decideJobBillInvoice({ clientId: '', lines, existing: [] }).action).toBe('miss');
    expect(decideJobBillInvoice({ clientId: undefined, lines, existing: [] }).reason).toBe('no_client');
  });

  it('misses without inventing bill lines', () => {
    expect(decideJobBillInvoice({ clientId: 'client-1', lines: [], existing: [] })).toEqual({
      action: 'miss',
      reason: 'no_lines',
      message: JOB_BILL_INVOICE_NO_LINES,
    });
  });

  it('checks client before lines so the toast names the first honest hole', () => {
    const decision = decideJobBillInvoice({ clientId: null, lines: [], existing: [] });
    expect(decision).toMatchObject({ action: 'miss', reason: 'no_client' });
  });

  it('reuses an invoice already on this job — does not insert a second draft', () => {
    expect(decideJobBillInvoice({
      clientId: 'client-1',
      lines,
      existing: [
        { id: 'sent', status: 'sent' },
        { id: 'draft', status: 'draft' },
      ],
    })).toEqual({ action: 'reuse', invoiceId: 'draft', existing: true });
  });

  it('reuses a sent invoice when that is the only row — still no second insert', () => {
    expect(decideJobBillInvoice({
      clientId: 'client-1',
      lines,
      existing: [{ id: 'sent', status: 'sent' }],
    })).toEqual({ action: 'reuse', invoiceId: 'sent', existing: true });
  });

  it('inserts a draft when the job has a client, bill lines, and no invoice', () => {
    expect(decideJobBillInvoice({ clientId: 'client-1', lines, existing: [] })).toEqual({
      action: 'insert',
    });
  });

  it('does not insert when there is a client but no chargeable copy of the bill', () => {
    const empty = invoiceLinesFromJobCosts([
      { description: '  ', quantity: 1, unit_price: 10 },
    ]);
    expect(decideJobBillInvoice({
      clientId: 'client-1',
      lines: empty,
      existing: [],
    }).reason).toBe('no_lines');
  });
});

describe('reuseAfterUniqueConflict', () => {
  it('returns the existing draft when a job_bill unique race wins', () => {
    const reuse = reuseAfterUniqueConflict('23505', [
      { id: 'winner', status: 'draft' },
    ]);
    expect(reuse?.id).toBe('winner');
  });

  it('does not swallow a non-unique insert error', () => {
    expect(reuseAfterUniqueConflict('23503', [{ id: 'x', status: 'draft' }])).toBeNull();
    expect(reuseAfterUniqueConflict(undefined, [{ id: 'x', status: 'draft' }])).toBeNull();
  });
});

describe('named toasts', () => {
  it('keeps miss and success copy honest and specific', () => {
    expect(JOB_BILL_INVOICE_NO_CLIENT).toMatch(/client/i);
    expect(JOB_BILL_INVOICE_NO_LINES).toMatch(/bill lines/i);
    expect(JOB_BILL_INVOICE_CREATED).toMatch(/draft invoice/i);
    expect(JOB_BILL_INVOICE_EXISTS).toMatch(/already exists/i);
    expect(JOB_BILL_INVOICE_NOTES).toMatch(/^From job bill/i);
  });
});
