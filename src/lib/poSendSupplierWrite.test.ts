import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PO_SUPPLIER_ATTACH_NO_SUPPLIERS,
  companySuppliersForAttach,
  decidePoSupplierAttach,
  poSupplierAttachRow,
} from './attachPoSupplier';
import {
  PO_SUPPLIER_EMAIL_NO_SUPPLIER,
  decideSupplierEmailSave,
  supplierEmailRow,
  supplierEmailToStore,
} from './saveSupplierEmail';
import {
  PO_SUPPLIER_PHONE_NO_SUPPLIER,
  decideSupplierPhoneSave,
  supplierPhoneRow,
  supplierPhoneToStore,
} from './saveSupplierPhone';
import {
  clientEmailForSend,
  clientPhoneForSms,
  decidePurchaseOrderSend,
  type PurchaseOrderSendBundle,
  type PurchaseOrderSendPo,
} from './sendPurchaseOrder';

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

const acme = { id: 's1', name: 'Acme Electrical Wholesale' };
const brooks = { id: 's2', name: 'Brooks Cable' };

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

describe('purchase-order-send honesty — three miss paths', () => {
  it('no supplier is an honest miss — existing company suppliers only, no invented supplier', () => {
    expect(companySuppliersForAttach([
      acme,
      { id: 'x', name: '  ', archived: false },
      { id: 'y', name: 'Old Co', archived: true },
      brooks,
    ])).toEqual([acme, brooks]);
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
    expect(supplierEmailRow({ supplierId: null, supplier: null }).kind).toBe('none');
    expect(supplierPhoneRow({ supplierId: null, supplier: null }).kind).toBe('none');

    const miss = decidePurchaseOrderSend(bundle({
      po: { ...po, supplier_id: null },
      supplier: null,
    }));
    expect(miss.ok).toBe(false);
    if (miss.ok) return;
    expect(miss.blocker).toBe('no_supplier');
    expect(miss.message).toBe('Pick a supplier before you can send this purchase order.');
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
    expect(decidePoSupplierAttach({
      purchaseOrderId: 'po1',
      poSupplierId: null,
      supplierId: 'invented',
      companySuppliers: [acme],
    }).action).toBe('miss');
  });

  it('no email is an honest miss — editor on this supplier_id, no second supplier', () => {
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
    expect(supplierEmailRow({
      supplierId: 's1',
      supplier: { id: 's1', email: null },
    })).toEqual({ kind: 'edit', supplierId: 's1', email: '' });
    expect(supplierEmailRow({
      supplierId: 's1',
      supplier: { id: 's1', email: 'not-an-email' },
    }).kind).toBe('edit');

    const miss = decidePurchaseOrderSend(bundle({ supplier: { ...supplier, email: null, phone: '0412 345 678' } }));
    expect(miss.ok).toBe(false);
    if (miss.ok) return;
    expect(miss.blocker).toBe('no_email');
    expect(miss.message).toMatch(/no email/i);
  });

  it('no phone is an honest SMS miss — editor on this supplier_id, not a Send gate', () => {
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
    expect(supplierPhoneRow({
      supplierId: 's1',
      supplier: { id: 's1', phone: null },
    })).toEqual({ kind: 'edit', supplierId: 's1', phone: '' });

    const ready = decidePurchaseOrderSend(bundle({
      supplier: { ...supplier, email: 'orders@acme.com.au', phone: null },
    }));
    expect(ready.ok).toBe(true);
    if (!ready.ok) return;
    expect(ready.smsTo).toBeNull();
    expect(ready.smsMessage).toMatch(/no phone/i);
  });
});

describe('purchase-order-send honesty — after-save send-ready', () => {
  it('after attach then a sendable email save, decidePurchaseOrderSend is ready — blank stays a miss', () => {
    const afterBare = decidePurchaseOrderSend(bundle({
      po: { ...po, supplier_id: 's1' },
      supplier: { id: 's1', name: 'Acme Electrical Wholesale', email: null, phone: null, address: null },
    }));
    expect(afterBare.ok).toBe(false);
    if (!afterBare.ok) expect(afterBare.blocker).toBe('no_email');
    expect(supplierEmailRow({
      supplierId: 's1',
      supplier: { id: 's1', email: null },
    }).kind).toBe('edit');
    expect(clientEmailForSend(supplierEmailToStore('not-an-email'))).toBeNull();

    const afterBlank = decidePurchaseOrderSend(bundle({
      supplier: { ...supplier, email: supplierEmailToStore('') },
    }));
    expect(afterBlank.ok).toBe(false);
    if (!afterBlank.ok) expect(afterBlank.blocker).toBe('no_email');

    const afterEmailSave = decidePurchaseOrderSend(bundle({
      po: { ...po, supplier_id: 's1' },
      supplier: {
        id: 's1',
        name: 'Acme Electrical Wholesale',
        email: supplierEmailToStore('orders@acme.com.au'),
        phone: null,
        address: null,
      },
    }));
    expect(afterEmailSave.ok).toBe(true);
    if (!afterEmailSave.ok) return;
    expect(afterEmailSave.to).toBe('orders@acme.com.au');

    const afterLinked = decidePurchaseOrderSend(bundle({
      po: { ...po, supplier_id: 's2' },
      supplier: {
        id: 's2',
        name: 'Brooks Cable',
        email: 'sam@brooks.com.au',
        phone: '0400 111 222',
        address: null,
      },
    }));
    expect(afterLinked.ok).toBe(true);
    if (!afterLinked.ok) return;
    expect(afterLinked.to).toBe('sam@brooks.com.au');
    expect(afterLinked.smsTo).toBe('+61400111222');
  });

  it('SMTP miss still no_smtp after attach and email — save does not send', () => {
    const smtpMiss = decidePurchaseOrderSend(bundle({
      po: { ...po, supplier_id: 's1' },
      supplier: {
        id: 's1',
        name: 'Acme Electrical Wholesale',
        email: supplierEmailToStore('orders@acme.com.au'),
        phone: null,
        address: null,
      },
      smtp: null,
    }));
    expect(smtpMiss.ok).toBe(false);
    if (smtpMiss.ok) return;
    expect(smtpMiss.blocker).toBe('no_smtp');
  });

  it('after a phone save, Send stays ready and SMS To is the saved number — no auto-SMS', () => {
    const afterBlank = decidePurchaseOrderSend(bundle({
      supplier: { ...supplier, email: 'orders@acme.com.au', phone: supplierPhoneToStore('') },
    }));
    expect(afterBlank.ok).toBe(true);
    if (afterBlank.ok) expect(afterBlank.smsTo).toBeNull();

    const afterSave = decidePurchaseOrderSend(bundle({
      supplier: {
        ...supplier,
        email: 'orders@acme.com.au',
        phone: supplierPhoneToStore('0412 345 678'),
      },
    }));
    expect(afterSave.ok).toBe(true);
    if (!afterSave.ok) return;
    expect(afterSave.smsTo).toBe('+61412345678');
    expect(afterSave.to).toBe('orders@acme.com.au');
    expect(clientPhoneForSms(supplierPhoneToStore('0412 345 678'))).toBe('+61412345678');
  });
});

describe('purchase-order-send honesty — wiring on the existing Send sheet', () => {
  it('email + phone + attach write on PurchaseOrderSendDialog and never auto-send', () => {
    const dialog = src('src/components/invoicing/PurchaseOrderSendDialog.tsx');
    const handleAttach = dialog.slice(dialog.indexOf('const handleAttach'), dialog.indexOf('const handleSaveEmail'));
    const handleEmail = dialog.slice(dialog.indexOf('const handleSaveEmail'), dialog.indexOf('const handleSavePhone'));
    const handlePhone = dialog.slice(dialog.indexOf('const handleSavePhone'), dialog.indexOf('const handleSend'));
    const handleSendFn = dialog.slice(dialog.indexOf('const handleSend'), dialog.indexOf('const ready'));
    const sendBtn = dialog.slice(dialog.indexOf('{showSend &&'), dialog.indexOf('{showSmtpSettings'));

    expect(dialog).toContain('saveSupplierEmail');
    expect(dialog).toContain('saveSupplierPhone');
    expect(dialog).toContain('attachPoSupplier');
    expect(dialog).toContain('decidePurchaseOrderSend');
    expect(dialog).toContain('PO_SEND_NO_EMAIL_FIELD');
    expect(dialog).toContain('This supplier has no email. Add one below before you send.');
    expect(dialog).toContain('PO_SUPPLIER_ATTACH_NO_SUPPLIERS');
    expect(dialog).toContain("blocker === 'no_email'");
    expect(dialog).toContain("blocker === 'no_supplier'");
    expect(dialog).toContain('job-client-email');
    expect(dialog).toContain('job-client-phone');
    expect(dialog).toContain('job-client-attach');
    expect(dialog).toContain('disabled={sending || !ready}');
    expect(sendBtn).toContain('Send PO');
    expect(sendBtn).toContain('disabled={sending || !ready}');

    expect(handleAttach).toContain('attachPoSupplier');
    expect(handleAttach).toContain('decidePurchaseOrderSend(next)');
    expect(handleAttach).not.toContain('deliverPurchaseOrder');
    expect(handleAttach).not.toContain('onSent');
    expect(handleAttach).not.toContain('insert({');

    expect(handleEmail).toContain('saveSupplierEmail');
    expect(handleEmail).toContain('decidePurchaseOrderSend(next)');
    expect(handleEmail).not.toContain('deliverPurchaseOrder');
    expect(handleEmail).not.toContain('onSent');

    expect(handlePhone).toContain('saveSupplierPhone');
    expect(handlePhone).toContain('decidePurchaseOrderSend(next)');
    expect(handlePhone).not.toContain('deliverPurchaseOrder');
    expect(handlePhone).not.toContain('onSent');
    expect(handlePhone).not.toContain('sendSms');

    expect(handleSendFn).toContain('deliverPurchaseOrder');
    expect(handleSendFn).not.toContain('saveSupplierEmail');
    expect(handleSendFn).not.toContain('saveSupplierPhone');
    expect(handleSendFn).not.toContain('attachPoSupplier');
    expect(handleSendFn).not.toContain('if (!decision?.ok) return');
  });

  it('miss first, then the field or picker — does not invent a supplier dialog', () => {
    const dialog = src('src/components/invoicing/PurchaseOrderSendDialog.tsx');
    const emailMiss = dialog.indexOf('{showEmailEditor && emailRow.kind === \'edit\' && (');
    const attachPick = dialog.indexOf('{noSupplierMiss && attachRow.kind === \'pick\' && (');
    const blocker = dialog.indexOf('blockerMessage');
    expect(blocker).toBeGreaterThan(-1);
    expect(attachPick).toBeGreaterThan(blocker);
    expect(emailMiss).toBeGreaterThan(attachPick);
    expect(dialog).not.toContain('Create supplier');
    expect(dialog).not.toContain('SupplierEmailDialog');
    expect(dialog).not.toContain('SupplierPhoneDialog');
    expect(dialog).not.toContain('SupplierAttachDialog');
    expect(dialog).not.toContain('Open supplier');
  });

  it('this lock is the only file this PR adds — Quote Send / invoice Send / login / landing / AppShell / Relovi / PR #17 stay as signed', () => {
    const dialog = src('src/components/invoicing/PurchaseOrderSendDialog.tsx');
    const saveEmail = src('src/lib/saveSupplierEmail.ts');
    const savePhone = src('src/lib/saveSupplierPhone.ts');
    const attach = src('src/lib/attachPoSupplier.ts');
    const quoteDialog = src('src/components/invoicing/QuoteSendDialog.tsx');
    const invoiceDialog = src('src/components/invoicing/InvoiceSendDialog.tsx');
    const landing = src('src/pages/MarketingPage.tsx');
    const login = src('src/pages/LoginPage.tsx');
    const appShell = src('src/components/layout/AppShell.tsx');
    const convert = src('src/lib/convertQuoteToInvoice.ts');
    const quotesPage = src('src/pages/QuotesPage.tsx');

    expect(dialog).not.toContain('QuoteSendDialog');
    expect(dialog).not.toContain('deliverQuote');
    expect(dialog).not.toContain('InvoiceSendDialog');
    expect(dialog).not.toContain('deliverInvoice');
    expect(dialog).not.toContain('Relovi');
    expect(dialog).not.toContain('Littleloop');
    expect(dialog).not.toContain('Manrope');
    expect(dialog).not.toContain('send-po');
    expect(saveEmail).not.toContain('PurchaseOrderSendDialog');
    expect(savePhone).not.toContain('PurchaseOrderSendDialog');
    expect(attach).not.toContain('PurchaseOrderSendDialog');
    expect(quoteDialog).not.toContain('saveSupplierEmail');
    expect(quoteDialog).not.toContain('saveSupplierPhone');
    expect(quoteDialog).not.toContain('attachPoSupplier');
    expect(quoteDialog).not.toContain('PurchaseOrderSendDialog');
    expect(invoiceDialog).not.toContain('saveSupplierEmail');
    expect(invoiceDialog).not.toContain('saveSupplierPhone');
    expect(invoiceDialog).not.toContain('attachPoSupplier');
    expect(invoiceDialog).not.toContain('PurchaseOrderSendDialog');
    expect(landing).not.toContain('saveSupplierEmail');
    expect(landing).not.toContain('PurchaseOrderSendDialog');
    expect(login).not.toContain('saveSupplierEmail');
    expect(login).not.toContain('PurchaseOrderSendDialog');
    expect(appShell).not.toContain('saveSupplierEmail');
    expect(appShell).not.toContain('PurchaseOrderSendDialog');
    expect(convert).not.toContain('saveSupplierEmail');
    expect(convert).not.toContain('attachPoSupplier');
    expect(convert).not.toContain('PurchaseOrderSendDialog');
    expect(quotesPage).not.toContain('saveSupplierEmail');
    expect(quotesPage).not.toContain('attachPoSupplier');
  });
});
