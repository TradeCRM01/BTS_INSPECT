import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  clientEmailForSend,
  decidePurchaseOrderSend,
  NO_EMAIL_MESSAGE,
  type PurchaseOrderSendBundle,
  type PurchaseOrderSendPo,
} from './sendPurchaseOrder';
import {
  PO_SUPPLIER_EMAIL_NO_SUPPLIER,
  decideSupplierEmailSave,
  supplierEmailRow,
  supplierEmailToStore,
} from './saveSupplierEmail';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

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
  email: null as string | null,
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

describe('purchase-order-send supplier email — save / miss', () => {
  it('writes suppliers.email on this PO supplier_id — blank stays empty, no second supplier', () => {
    expect(decideSupplierEmailSave({ supplierId: 's1', email: '  orders@acme.com.au  ' })).toEqual({
      action: 'write',
      supplierId: 's1',
      email: 'orders@acme.com.au',
    });
    expect(decideSupplierEmailSave({ supplierId: 's1', email: '' })).toEqual({
      action: 'write',
      supplierId: 's1',
      email: null,
    });
    expect(decideSupplierEmailSave({ supplierId: null, email: 'orders@acme.com.au' })).toEqual({
      action: 'miss',
      reason: 'no_supplier',
      message: PO_SUPPLIER_EMAIL_NO_SUPPLIER,
    });
    expect(supplierEmailRow({ supplierId: null, supplier: { id: 's1', email: null } }).kind).toBe('none');
    expect(supplierEmailRow({ supplierId: 's1', supplier: null }).kind).toBe('none');
    expect(supplierEmailRow({
      supplierId: 's1',
      supplier: { id: 's1', email: null },
    })).toEqual({ kind: 'edit', supplierId: 's1', email: '' });
  });

  it('hides the editor when there is no supplier — does not invent one', () => {
    expect(supplierEmailRow({ supplierId: null, supplier: null }).kind).toBe('none');
    const miss = decidePurchaseOrderSend(bundle({
      po: { ...po, supplier_id: null },
      supplier: null,
    }));
    expect(miss.ok).toBe(false);
    if (miss.ok) return;
    expect(miss.blocker).toBe('no_supplier');
    expect(miss.message).toBe('Pick a supplier before you can send this purchase order.');
    expect(miss.href).toBeUndefined();
  });

  it('keeps blank / invalid as an honest no_email miss — Send uses a real saved address', () => {
    expect(clientEmailForSend(supplierEmailToStore(''))).toBeNull();
    expect(clientEmailForSend(supplierEmailToStore('not-an-email'))).toBeNull();
    expect(clientEmailForSend(supplierEmailToStore('orders@acme.com.au'))).toBe('orders@acme.com.au');
    expect(NO_EMAIL_MESSAGE).toMatch(/no email/i);

    const afterBlank = decidePurchaseOrderSend(bundle({
      supplier: { ...supplier, email: supplierEmailToStore('') },
    }));
    expect(afterBlank.ok).toBe(false);
    if (!afterBlank.ok) expect(afterBlank.blocker).toBe('no_email');

    const afterSave = decidePurchaseOrderSend(bundle({
      supplier: { ...supplier, email: supplierEmailToStore('orders@acme.com.au') },
    }));
    expect(afterSave.ok).toBe(true);
    if (!afterSave.ok) return;
    expect(afterSave.to).toBe('orders@acme.com.au');
  });
});

describe('purchase-order-send supplier email — wiring', () => {
  it('saves suppliers.email on the existing send miss via saveSupplierEmail and does not auto-send', () => {
    const save = src('src/lib/saveSupplierEmail.ts');
    const dialog = src('src/components/invoicing/PurchaseOrderSendDialog.tsx');
    const send = src('src/lib/sendPurchaseOrder.ts');
    const deliver = src('src/lib/sendPurchaseOrderDeliver.ts');
    const handleSaveStart = dialog.indexOf('const handleSaveEmail');
    const handleSaveEnd = dialog.indexOf('const handleSend');
    expect(handleSaveStart).toBeGreaterThan(-1);
    expect(handleSaveEnd).toBeGreaterThan(handleSaveStart);
    const handle = dialog.slice(handleSaveStart, handleSaveEnd);
    const handleSendFn = dialog.slice(dialog.indexOf('const handleSend'), dialog.indexOf('const ready'));

    expect(save).toContain("from('suppliers')");
    expect(save).toContain('update({ email:');
    expect(save).toContain('.eq(\'id\', decision.supplierId)');
    expect(save).not.toContain('insert({');
    expect(save).not.toContain('CREATE TABLE');
    expect(save).not.toContain('ALTER TABLE');
    expect(save).not.toContain('cron.schedule');
    expect(save).not.toContain('deliverPurchaseOrder');
    expect(save).not.toContain('PurchaseOrderSendDialog');
    expect(save).not.toContain('from(\'clients\')');
    expect(save).not.toContain('send-po');

    expect(dialog).toContain('saveSupplierEmail');
    expect(dialog).toContain('supplierEmailRow');
    expect(dialog).toContain('handleSaveEmail()');
    expect(dialog).toContain('job-client-email');
    expect(dialog).toContain('job-client-email-save');
    expect(dialog).toContain('aria-label="Supplier email"');
    expect(dialog).toContain("kind === 'edit'");
    expect(dialog).toContain("blocker === 'no_email'");
    expect(dialog).toContain('supplierEmailRow({');
    expect(dialog).toContain('supplierId: poSupplierId');
    expect(dialog).toContain('PO_SEND_NO_EMAIL_FIELD');
    expect(dialog).not.toContain('SupplierEmailDialog');
    expect(dialog).not.toContain('AU_EMAIL_PLACEHOLDER');
    expect(dialog).not.toContain('className="btn-primary job-client-email-save"');
    expect(dialog).not.toContain('className="ops-next-control-block job-client-email-save"');
    expect(dialog).not.toContain('AU_EMAIL_PLACEHOLDER');
    expect(dialog).not.toContain('Littleloop');
    expect(dialog).not.toContain('Manrope');

    expect(handle).toContain('saveSupplierEmail');
    expect(handle).toContain('emailRow.supplierId');
    expect(handle).toContain('supplierEmailDraft');
    expect(handle).toContain('decidePurchaseOrderSend(next)');
    expect(handle).not.toContain('deliverPurchaseOrder');
    expect(handle).not.toContain('handleSend');
    expect(handle).not.toContain('onSent');
    expect(handle).not.toContain('insert({');
    expect(handle).not.toContain('attachPoSupplier');

    expect(handleSendFn).toContain('deliverPurchaseOrder');
    expect(handleSendFn).not.toContain('saveSupplierEmail');
    expect(handleSendFn).not.toContain('if (!decision?.ok) return');

    expect(send).not.toContain('saveSupplierEmail');
    expect(deliver).not.toContain('saveSupplierEmail');
  });

  it('does not add a second 44px — Save is muted on the miss, primary stays Send', () => {
    const dialog = src('src/components/invoicing/PurchaseOrderSendDialog.tsx');
    const css = src('src/index.css');
    const sendCssStart = css.indexOf('.hub-invoice-send .job-client-email');
    expect(sendCssStart).toBeGreaterThan(-1);
    const sendCss = css.slice(sendCssStart, css.indexOf('.hub-invoice-send-xero-miss'));

    expect(dialog).toContain('className="btn-primary"');
    expect(dialog).toContain('Send PO');
    expect(dialog).toContain('job-client-email-save');
    expect(dialog).toContain('showSend');
    expect(dialog).toContain('disabled={sending || !ready}');
    expect(dialog).not.toContain('Add supplier email');
    expect(dialog).not.toContain('className="btn-primary job-client-email-save"');
    expect(sendCss).toContain('.job-client-email-save');
    expect(sendCss).not.toContain('min-height: 44px');
    expect(sendCss).not.toContain('min-h-[44px]');
    expect(sendCss).not.toContain('btn-primary');
  });

  it('leaves invoice / quote send and convert as signed', () => {
    const dialog = src('src/components/invoicing/PurchaseOrderSendDialog.tsx');
    const page = src('src/pages/PurchaseOrdersPage.tsx');
    const quoteDialog = src('src/components/invoicing/QuoteSendDialog.tsx');
    const invoiceDialog = src('src/components/invoicing/InvoiceSendDialog.tsx');
    const convert = src('src/lib/convertQuoteToJob.ts');

    expect(dialog).not.toContain('QuoteSendDialog');
    expect(dialog).not.toContain('InvoiceSendDialog');
    expect(dialog).not.toContain('convertQuoteToJob');
    expect(page).not.toContain('saveSupplierEmail');
    expect(page).not.toContain('convertQuoteToJob');
    expect(quoteDialog).not.toContain('saveSupplierEmail');
    expect(invoiceDialog).not.toContain('saveSupplierEmail');
    expect(convert).not.toContain('saveSupplierEmail');
    expect(convert).not.toContain('purchaseOrderId');
  });
});
