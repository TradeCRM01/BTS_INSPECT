import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decidePurchaseOrderSend, type PurchaseOrderSendBundle, type PurchaseOrderSendPo } from './sendPurchaseOrder';
import {
  PO_SUPPLIER_ATTACH_NO_SUPPLIERS,
  companySuppliersForAttach,
  decidePoSupplierAttach,
  poSupplierAttachRow,
} from './attachPoSupplier';
import { supplierEmailRow } from './saveSupplierEmail';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const acme = { id: 's1', name: 'Acme Electrical Wholesale' };
const brooks = { id: 's2', name: 'Brooks Cable' };

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
  supplier_id: null,
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

function bundle(over: Partial<PurchaseOrderSendBundle> = {}): PurchaseOrderSendBundle {
  return {
    po,
    supplier: null,
    jobAddress: 'Warehouse B',
    smtp,
    company,
    ...over,
  };
}

describe('purchase-order-send supplier attach — miss / pick', () => {
  it('lists existing company suppliers only — no invented placeholder', () => {
    expect(companySuppliersForAttach([acme, { id: 'x', name: '  ', archived: false }, brooks])).toEqual([
      acme,
      brooks,
    ]);
    expect(poSupplierAttachRow({
      poSupplierId: null,
      companySuppliers: [acme, brooks],
    })).toEqual({ kind: 'pick', suppliers: [acme, brooks] });
    expect(poSupplierAttachRow({
      poSupplierId: null,
      companySuppliers: [],
    })).toEqual({ kind: 'miss', reason: 'no_suppliers', message: PO_SUPPLIER_ATTACH_NO_SUPPLIERS });
    expect(poSupplierAttachRow({
      poSupplierId: 's1',
      companySuppliers: [acme],
    }).kind).toBe('linked');
  });

  it('hides the picker when there is already a supplier — does not invent one when the company has none', () => {
    const noSupplier = decidePurchaseOrderSend(bundle());
    expect(noSupplier.ok).toBe(false);
    if (!noSupplier.ok) expect(noSupplier.blocker).toBe('no_supplier');
    expect(decidePoSupplierAttach({
      purchaseOrderId: 'po1',
      poSupplierId: null,
      supplierId: 's1',
      companySuppliers: [acme],
    })).toEqual({ action: 'write', purchaseOrderId: 'po1', supplierId: 's1' });
    expect(decidePoSupplierAttach({
      purchaseOrderId: 'po1',
      poSupplierId: null,
      supplierId: 's1',
      companySuppliers: [],
    }).action).toBe('miss');
  });

  it('after attach, a supplier without email is an honest no_email miss — does not auto-send', () => {
    const after = decidePurchaseOrderSend(bundle({
      po: { ...po, supplier_id: 's1' },
      supplier: { id: 's1', name: 'Acme Electrical Wholesale', email: null, phone: null, address: null },
    }));
    expect(after.ok).toBe(false);
    if (!after.ok) expect(after.blocker).toBe('no_email');
    expect(supplierEmailRow({
      supplierId: 's1',
      supplier: { id: 's1', email: null },
    }).kind).toBe('edit');
  });
});

describe('purchase-order-send supplier attach — wiring', () => {
  it('attaches an existing company supplier on this PO via attachPoSupplier and does not auto-send', () => {
    const attach = src('src/lib/attachPoSupplier.ts');
    const dialog = src('src/components/invoicing/PurchaseOrderSendDialog.tsx');
    const send = src('src/lib/sendPurchaseOrder.ts');
    const deliver = src('src/lib/sendPurchaseOrderDeliver.ts');
    const handleStart = dialog.indexOf('const handleAttach');
    const handleEnd = dialog.indexOf('const handleSaveEmail');
    expect(handleStart).toBeGreaterThan(-1);
    expect(handleEnd).toBeGreaterThan(handleStart);
    const handle = dialog.slice(handleStart, handleEnd);
    const handleSendFn = dialog.slice(dialog.indexOf('const handleSend'), dialog.indexOf('const ready'));

    expect(attach).toContain("from('purchase_orders')");
    expect(attach).toContain('update({ supplier_id:');
    expect(attach).not.toContain('insert({');
    expect(attach).not.toContain('PurchaseOrderSendDialog');
    expect(attach).not.toContain('deliverPurchaseOrder');
    expect(attach).not.toContain('from(\'clients\')');
    expect(attach).not.toContain('send-po');

    expect(dialog).toContain('attachPoSupplier');
    expect(dialog).toContain('poSupplierAttachRow');
    expect(dialog).toContain('handleAttach()');
    expect(dialog).toContain('job-client-attach');
    expect(dialog).toContain('job-client-attach-save');
    expect(dialog).toContain('aria-label="Attach supplier"');
    expect(dialog).toContain("kind === 'pick'");
    expect(dialog).toContain("kind === 'miss'");
    expect(dialog).toContain('PO_SUPPLIER_ATTACH_NO_SUPPLIERS');
    expect(dialog).toContain("from('suppliers')");
    expect(dialog).toContain("eq('archived', false)");
    expect(dialog).toContain("eq('company_id', company.id)");
    expect(dialog).toContain("queryKey: ['po-attach-suppliers'");
    expect(dialog).toContain('poSupplierAttachRow({');
    expect(dialog).toContain('poSupplierId');
    expect(dialog).toContain("blocker === 'no_supplier'");
    expect(dialog).not.toContain('Open supplier');
    expect(dialog).not.toContain('SupplierAttachDialog');
    expect(dialog).not.toContain('Create supplier');
    expect(dialog).not.toContain('InvoiceSendDialog');
    expect(dialog).not.toContain('Relovi');
    expect(dialog).not.toContain('Littleloop');
    expect(dialog).not.toContain('Manrope');

    expect(handle).toContain('attachPoSupplier');
    expect(handle).toContain('supplierAttachDraft');
    expect(handle).toContain('decidePurchaseOrderSend(next)');
    expect(handle).not.toContain('deliverPurchaseOrder');
    expect(handle).not.toContain('handleSend');
    expect(handle).not.toContain('onSent');
    expect(handle).not.toContain('insert({');
    expect(handle).not.toContain('saveSupplierEmail');

    expect(handleSendFn).toContain('deliverPurchaseOrder');
    expect(handleSendFn).not.toContain('attachPoSupplier');
    expect(send).not.toContain('attachPoSupplier');
    expect(deliver).not.toContain('attachPoSupplier');
  });

  it('reuses the signed email field after attach — does not invent a second editor', () => {
    const dialog = src('src/components/invoicing/PurchaseOrderSendDialog.tsx');
    expect(dialog).toContain('supplierEmailRow({');
    expect(dialog).toContain('supplierId: poSupplierId');
    expect(dialog).toContain("emailRow.kind === 'edit'");
    expect(dialog).toContain('job-client-email');
    expect(dialog).toContain('saveSupplierEmail');
    expect(dialog).toContain('handleSaveEmail()');
    expect(dialog).toContain("blocker === 'no_email'");
    expect(dialog).not.toContain('job-client-attach-email');
    expect(dialog).not.toContain('SupplierEmailDialog');
  });

  it('does not add a second 44px — Save is muted on the miss, primary stays Send PO', () => {
    const dialog = src('src/components/invoicing/PurchaseOrderSendDialog.tsx');
    const css = src('src/index.css');
    const sendCssStart = css.indexOf('.hub-invoice-send .job-client-attach');
    expect(sendCssStart).toBeGreaterThan(-1);
    const sendCss = css.slice(sendCssStart, css.indexOf('.hub-invoice-send-xero-miss'));

    expect(dialog).toContain('className="btn-primary"');
    expect(dialog).toContain('Send PO');
    expect(dialog).toContain('job-client-attach-save');
    expect(dialog).toContain('showSend');
    expect(dialog).toContain('disabled={sending || !ready}');
    expect(dialog).not.toContain('Add supplier');
    expect(dialog).not.toContain('className="btn-primary job-client-attach-save"');
    expect(sendCss).toContain('.job-client-attach-save');
    expect(sendCss).not.toContain('min-height: 44px');
    expect(sendCss).not.toContain('btn-primary');
  });
});
