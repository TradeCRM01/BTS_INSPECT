import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PURCHASE_ORDER_SEND_PIPE,
  purchaseOrderByIdQuery,
  purchaseOrderSendQueries,
  wouldScanLedgerToSendPurchaseOrder,
} from './sendPurchaseOrder';

describe('purchase order send deliver path', () => {
  it('invokes job-reminder, not a new send-po function', () => {
    const deliver = readFileSync(resolve(process.cwd(), 'src/lib/sendPurchaseOrderDeliver.ts'), 'utf8');
    const dialog = readFileSync(resolve(process.cwd(), 'src/components/invoicing/PurchaseOrderSendDialog.tsx'), 'utf8');
    const page = readFileSync(resolve(process.cwd(), 'src/pages/PurchaseOrdersPage.tsx'), 'utf8');
    const edge = readFileSync(resolve(process.cwd(), 'supabase/functions/job-reminder/index.ts'), 'utf8');

    expect(deliver).toContain("invoke('job-reminder'");
    expect(deliver).toContain('purchaseOrderId');
    expect(deliver).not.toContain('send-po');
    expect(deliver).not.toContain("invoke('send-po'");
    expect(deliver).not.toContain("invoke('send-purchase-order'");
    expect(deliver).not.toContain('mailto:');
    expect(dialog).toContain('PurchaseOrderSendDialog');
    expect(dialog).toContain('hub-invoice-send');
    expect(dialog).toContain('Send PO');
    expect(dialog).toContain('SMS To');
    expect(dialog).toContain('hub-invoice-send-tos');
    expect(dialog).not.toContain('send-po');
    expect(dialog).not.toContain('saveJobClientEmail');
    expect(dialog).not.toContain('saveJobClientPhone');
    expect(dialog).not.toContain('attachQuoteClient');
    expect(dialog).not.toContain('saveSupplierEmail');
    expect(dialog).not.toContain('saveSupplierPhone');
    expect(dialog).not.toContain('attachSupplier');
    expect(dialog).not.toContain('Relovi');
    expect(dialog).not.toContain('Littleloop');
    expect(dialog).not.toContain('Manrope');
    expect(page).toContain('PurchaseOrderSendDialog');
    expect(page).toContain('onRequestSend');
    expect(page).toContain('startSend');
    expect(page).not.toContain('PO marked as sent');
    expect(page).not.toContain('send-po');
    expect(page).not.toContain('mailto:?subject=');
    expect(page).not.toContain('Relovi');
    expect(page).not.toContain('Littleloop');
    expect(page).not.toContain('Manrope');
    expect(page).not.toContain('report_theme');
    expect(edge).toContain('purchaseOrderId');
    expect(edge).toContain('from("purchase_orders")');
    expect(edge).toContain('api.resend.com/emails');
    expect(edge).toContain('email_settings');
    expect(edge).toContain('poPatch.status = "sent"');
    expect(edge).toContain('api.twilio.com');
    expect(edge).toContain('TWILIO_ACCOUNT_SID');
    expect(edge).not.toContain('send-po');
    expect(PURCHASE_ORDER_SEND_PIPE.join(' ')).toMatch(/job-reminder/);
    expect(PURCHASE_ORDER_SEND_PIPE.join(' ')).toMatch(/purchaseOrderId/);
  });

  it('SMS miss does not flip PO status — sent follows email 2xx only', () => {
    const edge = readFileSync(resolve(process.cwd(), 'supabase/functions/job-reminder/index.ts'), 'utf8');
    expect(edge).toMatch(/sendTwilioSms/);
    const deliverStart = edge.indexOf('async function deliverPurchaseOrderSend');
    const deliverFn = edge.slice(deliverStart, edge.indexOf('function bearerToken'));
    const emailFail = deliverFn.indexOf('if (!res.ok)');
    const statusWrite = deliverFn.indexOf('poPatch.status = "sent"');
    expect(emailFail).toBeGreaterThan(-1);
    expect(statusWrite).toBeGreaterThan(emailFail);
    const statusBlock = deliverFn.slice(statusWrite, statusWrite + 280);
    expect(statusBlock).toContain('status = "sent"');
    expect(statusBlock).not.toContain('sms.sent');
  });

  it('loads the PO by id + company before send', () => {
    const scope = purchaseOrderByIdQuery({ companyId: 'co1', purchaseOrderId: 'po-1' });
    expect(scope).not.toBeNull();
    expect(wouldScanLedgerToSendPurchaseOrder(scope)).toBe(false);
    expect(purchaseOrderSendQueries({ companyId: 'co1', purchaseOrderId: 'po-1' }).po.eq).toEqual({
      id: 'po-1',
      company_id: 'co1',
    });
  });

  it('list Send and editor Send open the same dialog — persist does not flip sent', () => {
    const page = readFileSync(resolve(process.cwd(), 'src/pages/PurchaseOrdersPage.tsx'), 'utf8');
    const listRow = page.slice(page.indexOf('function PORow'), page.indexOf('interface POLineEdit'));
    const editor = page.slice(page.indexOf('function POEditorModal'));
    const persist = editor.slice(editor.indexOf('const persist = async'), editor.indexOf('const startSend'));
    const startSend = editor.slice(editor.indexOf('const startSend'), editor.indexOf('const handleSave'));

    expect(listRow).toContain("po.status === 'draft'");
    expect(listRow).toContain('onSend(po.id)');
    expect(listRow).not.toContain("status: 'sent'");
    expect(listRow).not.toContain('PO marked as sent');
    expect(editor).toContain('onRequestSend');
    expect(editor).toContain('startSend');
    expect(editor).not.toContain('PO marked as sent');
    expect(editor).not.toContain('PurchaseOrderSendDialog');
    expect(persist).not.toContain('deliverPurchaseOrder');
    expect(persist).toContain('poStatusOnSave');
    expect(persist).not.toContain("message: 'PO marked as sent'");
    expect(startSend).toContain("persist('draft'");
    expect(startSend).toContain('onRequestSend(id)');
    expect(startSend).not.toContain("persist('sent'");
  });
});
