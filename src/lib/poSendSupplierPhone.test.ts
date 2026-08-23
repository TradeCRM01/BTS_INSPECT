import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  clientPhoneForSms,
  decidePurchaseOrderSend,
  type PurchaseOrderSendBundle,
  type PurchaseOrderSendPo,
} from './sendPurchaseOrder';
import {
  PO_SUPPLIER_PHONE_CLEARED,
  PO_SUPPLIER_PHONE_NO_SUPPLIER,
  PO_SUPPLIER_PHONE_SAVED,
  decideSupplierPhoneSave,
  supplierPhoneRow,
  supplierPhoneSaveToast,
  supplierPhoneToStore,
} from './saveSupplierPhone';

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
  phone: null as string | null,
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

describe('purchase-order-send supplier phone — save / miss', () => {
  it('writes suppliers.phone on this PO supplier_id — blank stays empty, no second supplier', () => {
    expect(decideSupplierPhoneSave({ supplierId: 's1', phone: '  0412 345 678  ' })).toEqual({
      action: 'write',
      supplierId: 's1',
      phone: '0412 345 678',
    });
    expect(decideSupplierPhoneSave({ supplierId: 's1', phone: '' })).toEqual({
      action: 'write',
      supplierId: 's1',
      phone: null,
    });
    expect(decideSupplierPhoneSave({ supplierId: null, phone: '0412 345 678' })).toEqual({
      action: 'miss',
      reason: 'no_supplier',
      message: PO_SUPPLIER_PHONE_NO_SUPPLIER,
    });
    expect(supplierPhoneRow({ supplierId: null, supplier: { id: 's1', phone: null } }).kind).toBe('none');
    expect(supplierPhoneRow({ supplierId: 's1', supplier: null }).kind).toBe('none');
    expect(supplierPhoneRow({
      supplierId: 's1',
      supplier: { id: 's1', phone: null },
    })).toEqual({ kind: 'edit', supplierId: 's1', phone: '' });
  });

  it('hides the editor when there is no supplier — does not invent one', () => {
    expect(supplierPhoneRow({ supplierId: null, supplier: null }).kind).toBe('none');
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

  it('does not invent a send gate — phone write leaves decidePurchaseOrderSend as signed', () => {
    expect(supplierPhoneSaveToast('0412 345 678')).toEqual({
      message: PO_SUPPLIER_PHONE_SAVED,
      kind: 'success',
    });
    expect(supplierPhoneSaveToast(null)).toEqual({
      message: PO_SUPPLIER_PHONE_CLEARED,
      kind: 'info',
    });
    expect(PO_SUPPLIER_PHONE_SAVED).not.toMatch(/sent/i);
    expect(PO_SUPPLIER_PHONE_CLEARED).not.toMatch(/sent/i);
    expect(PO_SUPPLIER_PHONE_SAVED).not.toMatch(/sms/i);
    expect(PO_SUPPLIER_PHONE_CLEARED).not.toMatch(/sms/i);

    const noEmail = decidePurchaseOrderSend(bundle({
      supplier: { ...supplier, email: null, phone: supplierPhoneToStore('0412 345 678') },
    }));
    expect(noEmail.ok).toBe(false);
    if (!noEmail.ok) expect(noEmail.blocker).toBe('no_email');

    const readyNoPhone = decidePurchaseOrderSend(bundle({
      supplier: { ...supplier, email: 'orders@acme.com.au', phone: null },
    }));
    expect(readyNoPhone.ok).toBe(true);
    if (!readyNoPhone.ok) return;
    expect(readyNoPhone.smsTo).toBeNull();

    const readyWithPhone = decidePurchaseOrderSend(bundle({
      supplier: {
        ...supplier,
        email: 'orders@acme.com.au',
        phone: supplierPhoneToStore('0412 345 678'),
      },
    }));
    expect(readyWithPhone.ok).toBe(true);
    if (!readyWithPhone.ok) return;
    expect(readyWithPhone.smsTo).toBe('+61412345678');
    expect(readyWithPhone.to).toBe('orders@acme.com.au');
    expect(clientPhoneForSms(supplierPhoneToStore('0412 345 678'))).toBe('+61412345678');
  });
});

describe('purchase-order-send supplier phone — wiring', () => {
  it('saves suppliers.phone on the existing send miss via saveSupplierPhone and does not auto-send or auto-SMS', () => {
    const save = src('src/lib/saveSupplierPhone.ts');
    const dialog = src('src/components/invoicing/PurchaseOrderSendDialog.tsx');
    const send = src('src/lib/sendPurchaseOrder.ts');
    const deliver = src('src/lib/sendPurchaseOrderDeliver.ts');
    const handleSaveStart = dialog.indexOf('const handleSavePhone');
    const handleSaveEnd = dialog.indexOf('const handleSend');
    expect(handleSaveStart).toBeGreaterThan(-1);
    expect(handleSaveEnd).toBeGreaterThan(handleSaveStart);
    const handle = dialog.slice(handleSaveStart, handleSaveEnd);
    const handleSendFn = dialog.slice(dialog.indexOf('const handleSend'), dialog.indexOf('const ready'));

    expect(save).toContain("from('suppliers')");
    expect(save).toContain('update({ phone:');
    expect(save).toContain('.eq(\'id\', decision.supplierId)');
    expect(save).not.toContain('deliverPurchaseOrder');
    expect(save).not.toContain('PurchaseOrderSendDialog');
    expect(save).not.toContain('sendSms');
    expect(save).not.toContain('job-reminder');
    expect(save).not.toContain('from(\'clients\')');
    expect(save).not.toContain('send-po');

    expect(dialog).toContain('saveSupplierPhone');
    expect(dialog).toContain('supplierPhoneRow');
    expect(dialog).toContain('handleSavePhone()');
    expect(dialog).toContain('job-client-phone');
    expect(dialog).toContain('job-client-phone-save');
    expect(dialog).toContain('job-client-phone-num');
    expect(dialog).toContain('aria-label="Supplier phone"');
    expect(dialog).toContain("kind === 'edit'");
    expect(dialog).toContain("kind === 'tel'");
    expect(dialog).toContain('supplierPhoneRow({');
    expect(dialog).toContain('supplierId: poSupplierId');
    expect(dialog).not.toContain('SupplierPhoneDialog');
    expect(dialog).not.toContain('AU_PHONE_PLACEHOLDER');
    expect(dialog).not.toContain('className="btn-primary job-client-phone-save"');
    expect(dialog).not.toContain('Relovi');
    expect(dialog).not.toContain('Littleloop');
    expect(dialog).not.toContain('Manrope');

    expect(handle).toContain('saveSupplierPhone');
    expect(handle).toContain('phoneRow.supplierId');
    expect(handle).toContain('supplierPhoneDraft');
    expect(handle).toContain('decidePurchaseOrderSend(next)');
    expect(handle).not.toContain('deliverPurchaseOrder');
    expect(handle).not.toContain('handleSend');
    expect(handle).not.toContain('onSent');
    expect(handle).not.toContain('sendSms');
    expect(handle).not.toContain('job-reminder');

    expect(handleSendFn).toContain('deliverPurchaseOrder');
    expect(handleSendFn).not.toContain('saveSupplierPhone');
    expect(handleSendFn).not.toContain('if (!decision?.ok) return');

    expect(send).not.toContain('saveSupplierPhone');
    expect(deliver).not.toContain('saveSupplierPhone');
  });

  it('does not add a second 44px — Save is muted on the miss, primary stays Send', () => {
    const dialog = src('src/components/invoicing/PurchaseOrderSendDialog.tsx');
    const css = src('src/index.css');
    const sendCssStart = css.indexOf('.hub-invoice-send .job-client-phone');
    expect(sendCssStart).toBeGreaterThan(-1);
    const sendCss = css.slice(sendCssStart, css.indexOf('.hub-invoice-send .job-client-attach'));

    expect(dialog).toContain('className="btn-primary"');
    expect(dialog).toContain('Send PO');
    expect(dialog).toContain('job-client-phone-save');
    expect(dialog).toContain('job-client-phone-num');
    expect(dialog).toContain('showSend');
    expect(dialog).toContain('disabled={sending || !ready}');
    expect(dialog).not.toContain('Add supplier phone');
    expect(dialog).not.toContain('className="btn-primary job-client-phone-save"');
    expect(sendCss).toContain('.job-client-phone-save');
    expect(sendCss).toContain('.job-client-phone-num');
    expect(sendCss).not.toContain('min-height: 44px');
    expect(sendCss).not.toContain('btn-primary');
  });

  it('hides the phone editor when this PO has no supplier', () => {
    const dialog = src('src/components/invoicing/PurchaseOrderSendDialog.tsx');
    expect(supplierPhoneRow({ supplierId: null, supplier: { id: 's1', phone: null } }).kind).toBe('none');
    expect(dialog).toContain("phoneRow.kind === 'edit'");
    expect(dialog).toContain("phoneRow.kind === 'tel'");
    expect(dialog).toContain('!noSupplierMiss');
  });

  it('does not change Send enablement unless decidePurchaseOrderSend already needs phone', () => {
    const dialog = src('src/components/invoicing/PurchaseOrderSendDialog.tsx');
    const handleSave = dialog.slice(dialog.indexOf('const handleSavePhone'), dialog.indexOf('const handleSend'));
    const handleSendFn = dialog.slice(dialog.indexOf('const handleSend'), dialog.indexOf('const ready'));
    const sendBtn = dialog.slice(dialog.indexOf('{showSend &&'), dialog.indexOf('{showSmtpSettings'));

    expect(dialog).toContain('disabled={sending || !ready}');
    expect(sendBtn).toContain('Send PO');
    expect(handleSave).toContain('decidePurchaseOrderSend(next)');
    expect(handleSave).not.toContain('deliverPurchaseOrder');
    expect(handleSave).not.toContain('onSent');
    expect(handleSendFn).toContain('deliverPurchaseOrder');

    const afterBlank = decidePurchaseOrderSend(bundle({
      supplier: { ...supplier, email: 'orders@acme.com.au', phone: supplierPhoneToStore('') },
    }));
    expect(afterBlank.ok).toBe(true);
    if (afterBlank.ok) expect(afterBlank.smsTo).toBeNull();

    const afterSave = decidePurchaseOrderSend(bundle({
      supplier: { ...supplier, email: 'orders@acme.com.au', phone: supplierPhoneToStore('0412 345 678') },
    }));
    expect(afterSave.ok).toBe(true);
    if (afterSave.ok) expect(afterSave.smsTo).toBe('+61412345678');
  });
});
