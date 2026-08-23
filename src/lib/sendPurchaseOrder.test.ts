import { describe, expect, it } from 'vitest';
import {
  applyPurchaseOrderSendScope,
  clientEmailForSend,
  commercialPdfDataForPurchaseOrder,
  decidePurchaseOrderSend,
  isPurchaseOrderSendScoped,
  isSmtpReady,
  poStatusOnSave,
  purchaseOrderAttachmentOrMiss,
  purchaseOrderPdfFilename,
  purchaseOrderSendHtml,
  purchaseOrderSendJobQuery,
  purchaseOrderSendQueries,
  purchaseOrderSendSubject,
  purchaseOrderSendSupplierQuery,
  purchaseOrderSmsBody,
  purchaseOrderStatusAfterSend,
  purchaseOrderStatusPatchAfterSend,
  shouldRecordPurchaseOrderSent,
  wouldScanLedgerToSendPurchaseOrder,
  type PurchaseOrderSendBundle,
  type PurchaseOrderSendPo,
} from './sendPurchaseOrder';

const smtp = {
  smtp_host: 'smtp.resend.com',
  smtp_pass: 're_test',
  from_name: 'BTS Electrical',
  from_email: 'office@btselectrical.com.au',
};

const company = { name: 'BTS Electrical', email: 'office@btselectrical.com.au' };

const po: PurchaseOrderSendPo = {
  id: 'po1',
  company_id: 'co1',
  po_number: 12,
  supplier_id: 's1',
  job_id: 'job-1',
  status: 'draft',
  line_items: [{ description: 'Cable', quantity: 4, unit_cost: 120, received_quantity: 0 }],
  subtotal: 480,
  tax_rate: 10,
  tax_amount: 48,
  total: 528,
  expected_delivery_date: '2026-09-19',
  notes: 'Side gate',
};

const supplier = {
  id: 's1',
  name: 'Acme Electrical Wholesale',
  email: 'orders@acme.com.au',
  phone: '0412 345 678',
  address: '12 Smith St',
};

function bundle(over: Partial<PurchaseOrderSendBundle> = {}): PurchaseOrderSendBundle {
  return {
    po,
    supplier,
    jobAddress: 'Warehouse B',
    smtp,
    company,
    ...over,
  };
}

describe('clientEmailForSend', () => {
  it('prefills To from the supplier email and rejects empty / invalid', () => {
    expect(clientEmailForSend('orders@acme.com.au')).toBe('orders@acme.com.au');
    expect(clientEmailForSend('  orders@acme.com.au  ')).toBe('orders@acme.com.au');
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
    expect(isSmtpReady({ ...smtp, from_email: '' })).toBe(false);
    expect(isSmtpReady({ ...smtp, smtp_host: 'smtp.gmail.com' })).toBe(false);
  });
});

describe('decidePurchaseOrderSend', () => {
  it('prefills To from the PO supplier and is ready when SMTP is set', () => {
    expect(decidePurchaseOrderSend(bundle())).toEqual({
      ok: true,
      to: 'orders@acme.com.au',
      toName: 'Acme Electrical Wholesale',
      subject: 'Purchase order #0012 from BTS Electrical',
      filename: 'purchase-order-0012.pdf',
      smsTo: '+61412345678',
      smsMessage: null,
    });
  });

  it('does not pretend it sent when the supplier has no email', () => {
    const decision = decidePurchaseOrderSend(bundle({ supplier: { ...supplier, email: null } }));
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.blocker).toBe('no_email');
    expect(decision.message).toMatch(/no email/i);
    expect(decision.href).toBe('/suppliers/s1');
  });

  it('does not pretend it sent when SMTP is missing', () => {
    const decision = decidePurchaseOrderSend(bundle({ smtp: null }));
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.blocker).toBe('no_smtp');
    expect(decision.message).toMatch(/not set up/i);
    expect(decision.href).toBe('/settings/company');
  });

  it('blocks send when there is no supplier or no priced lines', () => {
    expect(decidePurchaseOrderSend(bundle({ po: { ...po, supplier_id: null } })).ok).toBe(false);
    expect(decidePurchaseOrderSend(bundle({
      po: { ...po, line_items: [{ description: 'Cable', quantity: 0, unit_cost: 10, received_quantity: 0 }] },
    })).ok).toBe(false);
    expect(decidePurchaseOrderSend(bundle({ po: null })).ok).toBe(false);
  });

  it('names SMS miss honestly and does not block send', () => {
    const decision = decidePurchaseOrderSend(bundle({ supplier: { ...supplier, phone: null } }));
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.smsTo).toBeNull();
    expect(decision.smsMessage).toMatch(/no phone/i);
    expect(decision.smsMessage).toMatch(/supplier/i);
  });
});

describe('purchaseOrderStatusAfterSend', () => {
  it('marks sent only when delivery succeeded', () => {
    expect(purchaseOrderStatusAfterSend(true, 'draft')).toBe('sent');
    expect(purchaseOrderStatusAfterSend(false, 'draft')).toBe('draft');
    expect(purchaseOrderStatusPatchAfterSend(true)).toEqual({ status: 'sent' });
    expect(purchaseOrderStatusPatchAfterSend(false)).toBeNull();
    expect(shouldRecordPurchaseOrderSent(true, 'draft')).toBe(true);
    expect(shouldRecordPurchaseOrderSent(false, 'draft')).toBe(false);
  });

  it('does not rewrite received / cancelled on a failed send', () => {
    expect(purchaseOrderStatusAfterSend(false, 'received')).toBe('received');
    expect(purchaseOrderStatusAfterSend(true, 'received')).toBe('received');
    expect(shouldRecordPurchaseOrderSent(true, 'received')).toBe(false);
  });
});

describe('poStatusOnSave', () => {
  it('does not flip draft to sent from the editor dropdown', () => {
    expect(poStatusOnSave('sent', 'draft')).toBe('draft');
    expect(poStatusOnSave('sent', undefined)).toBe('draft');
    expect(poStatusOnSave('draft', 'draft')).toBe('draft');
    expect(poStatusOnSave('cancelled', 'draft')).toBe('cancelled');
    expect(poStatusOnSave('sent', 'sent')).toBe('sent');
    expect(poStatusOnSave('received', 'sent')).toBe('received');
  });
});

describe('purchase order send copy / document name', () => {
  it('names the PDF and subject from the PO number', () => {
    expect(purchaseOrderPdfFilename(12)).toBe('purchase-order-0012.pdf');
    expect(purchaseOrderSendSubject(12, 'BTS Electrical')).toBe('Purchase order #0012 from BTS Electrical');
  });

  it('mentions the attached PDF and does not invent a portal', () => {
    const html = purchaseOrderSendHtml({
      supplierName: 'Acme',
      companyName: 'BTS Electrical',
      poNumber: 12,
      totalLabel: '$528.00',
      expectedLabel: '19 Sep 2026',
    });
    expect(html).toContain('Acme');
    expect(html).toContain('#0012');
    expect(html).toContain('PDF is attached');
    expect(html).toContain('$528.00');
    expect(html).not.toContain('portal');
    expect(html).not.toContain('Relovi');
    expect(html).not.toContain('Littleloop');
    expect(purchaseOrderSmsBody({
      companyName: 'BTS Electrical',
      poNumber: 12,
      totalLabel: '$528.00',
      expectedLabel: '19 Sep 2026',
    })).toContain('purchase order #0012');
  });
});

describe('purchaseOrderAttachmentOrMiss', () => {
  it('refuses an empty PDF so status stays draft', () => {
    expect(purchaseOrderAttachmentOrMiss(null).ok).toBe(false);
    expect(purchaseOrderAttachmentOrMiss({ filename: 'purchase-order-0012.pdf', content: '' }).ok).toBe(false);
    expect(purchaseOrderAttachmentOrMiss({
      filename: 'purchase-order-0012.pdf',
      content: 'JVBERi0x',
    }).ok).toBe(true);
  });
});

describe('commercialPdfDataForPurchaseOrder', () => {
  it('keeps the existing PO PDF fields — supplier, lines, GST, expected date', () => {
    const pdf = commercialPdfDataForPurchaseOrder(bundle(), new Date('2026-08-20T10:00:00'));
    expect(pdf).toMatchObject({
      kind: 'purchase_order',
      docNumber: '#0012',
      clientName: 'Acme Electrical Wholesale',
      total: 528,
      taxAmount: 48,
    });
    expect(pdf?.clientDetail).toContain('orders@acme.com.au');
    expect(pdf?.lines).toHaveLength(1);
    expect(pdf?.lines[0].unit_price).toBe(120);
    expect(pdf?.secondaryValue).toBe('19 Sep 2026');
  });
});

describe('purchase order send query scope', () => {
  it('loads one PO by id + company, not the company ledger', () => {
    const scopes = purchaseOrderSendQueries({ companyId: 'co1', purchaseOrderId: 'po1' });
    expect(isPurchaseOrderSendScoped(scopes.po)).toBe(true);
    expect(isPurchaseOrderSendScoped(scopes.smtp)).toBe(true);
    expect(wouldScanLedgerToSendPurchaseOrder(scopes.po)).toBe(false);
    expect(scopes.po.eq).toEqual({ id: 'po1', company_id: 'co1' });
    expect(scopes.po.columns).not.toBe('*');
    expect(scopes.smtp.eq).toEqual({ company_id: 'co1' });
    expect(purchaseOrderSendSupplierQuery(null)).toBeNull();
    expect(purchaseOrderSendJobQuery('')).toBeNull();
    expect(purchaseOrderSendSupplierQuery('s1')?.eq).toEqual({ id: 's1' });
    expect(purchaseOrderSendJobQuery('job-1')?.eq).toEqual({ id: 'job-1' });
  });

  it('treats an unscoped purchase_orders select as a ledger scan', () => {
    expect(wouldScanLedgerToSendPurchaseOrder({
      table: 'purchase_orders',
      columns: 'id, status',
      eq: { company_id: 'co1' },
    })).toBe(true);
    expect(wouldScanLedgerToSendPurchaseOrder({
      table: 'suppliers',
      columns: 'id, email',
      eq: {},
    })).toBe(true);
  });

  it('applies id + company_id eq — never an unscoped purchase_orders select', () => {
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
    const scopes = purchaseOrderSendQueries({ companyId: 'co1', purchaseOrderId: 'po1' });
    applyPurchaseOrderSendScope(builder, scopes.po);
    expect(calls[0]).toMatch(/^select:/);
    expect(calls).toContain('eq:id:po1');
    expect(calls).toContain('eq:company_id:co1');
    expect(calls.some(call => call.startsWith('in:'))).toBe(false);
  });
});
