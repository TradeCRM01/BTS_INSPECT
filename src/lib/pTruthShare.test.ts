import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  documentShareCopyToast,
  interpretMarkSentWrite,
  invoiceStatusAfterMarkSent,
  MARK_SENT_WRITE_FAILED,
  QUOTE_MARKED_SENT_TOAST,
  quoteStatusAfterMarkSent,
} from './documentShare';
import {
  portalClientInvoices,
  portalClientQuotes,
  portalVisibleStatus,
} from './portalClientQuotes';
import { canAcceptPortalQuote } from '../pages/ClientPortalPublicPage';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('P-TRUTH — share marks sent, portal hides drafts', () => {
  it('copy-link marks a draft quote sent and leaves an already-sent quote unchanged', () => {
    expect(quoteStatusAfterMarkSent('draft')).toBe('sent');
    expect(quoteStatusAfterMarkSent('sent')).toBeNull();
    expect(quoteStatusAfterMarkSent('accepted')).toBeNull();
    expect(invoiceStatusAfterMarkSent('draft')).toBe('sent');
    expect(invoiceStatusAfterMarkSent('paid')).toBeNull();
    expect(invoiceStatusAfterMarkSent('overdue')).toBeNull();
    expect(documentShareCopyToast('quote', true)).toBe('Link copied, quote marked as sent');
    expect(documentShareCopyToast('quote', false)).toBe('Link copied');
    expect(documentShareCopyToast('invoice', true)).toBe('Link copied, invoice marked as sent');

    const editor = src('src/pages/QuotesPage.tsx');
    expect(editor).toContain('prepareDocumentShareLink');
    expect(editor).toContain("kind: 'quote'");
    expect(editor).toContain('result.kind === \'manual\'');
    expect(editor).toContain('QUOTE_MARKED_SENT_TOAST');
    expect(editor).not.toContain('if (result.kind === \'manual\') setErr(result.text);');
    expect(editor.indexOf('if (result.kind === \'manual\')')).toBeLessThan(editor.indexOf('showToast(toast || \'Link copied\')'));
    expect(editor).toContain("queryKey: ['client-quotes']");
    expect(editor).toContain("queryKey: ['job-quotes']");
    expect(QUOTE_MARKED_SENT_TOAST).toBe('Quote marked as sent');

    const quoteSend = src('src/components/invoicing/QuoteSendDialog.tsx');
    const invoiceSend = src('src/components/invoicing/InvoiceSendDialog.tsx');
    expect(quoteSend).toContain('prepareDocumentShareLink');
    expect(invoiceSend).toContain('prepareDocumentShareLink');
    expect(quoteSend).toContain("kind: 'quote'");
    expect(invoiceSend).toContain("kind: 'invoice'");

    const deliver = src('src/lib/documentShareDeliver.ts');
    const quoteMark = deliver.slice(
      deliver.indexOf('export async function markQuoteSentForShare'),
      deliver.indexOf('export async function markInvoiceSentForShare'),
    );
    expect(quoteMark).toContain('sent_at: now');
    const invoiceMark = deliver.slice(
      deliver.indexOf('export async function markInvoiceSentForShare'),
      deliver.indexOf('export async function prepareDocumentShareLink'),
    );
    expect(invoiceMark).not.toContain('sent_at');
  });

  it('portal filter hides drafts and shows capitalised statuses', () => {
    expect(portalClientQuotes([
      { id: 'draft', status: 'draft' },
      { id: 'sent', status: 'sent' },
    ]).map(row => row.id)).toEqual(['sent']);
    expect(portalClientInvoices([
      { id: 'draft', status: 'draft' },
      { id: 'paid', status: 'paid' },
    ]).map(row => row.id)).toEqual(['paid']);
    expect(portalVisibleStatus('draft')).toBeNull();
    expect(portalVisibleStatus('sent')).toBe('Sent');
    expect(portalVisibleStatus('Paid')).toBe('Paid');
    expect(portalVisibleStatus('accepted')).toBe('Accepted');
    expect(portalVisibleStatus('overdue')).toBe('Overdue');
    expect(canAcceptPortalQuote('Sent', null)).toBe(true);
    expect(canAcceptPortalQuote('sent', null)).toBe(true);
    expect(canAcceptPortalQuote('Accepted', null)).toBe(true);
    expect(canAcceptPortalQuote('draft', null)).toBe(false);

    const edge = src('supabase/functions/client-portal/index.ts');
    expect(edge).toContain('.neq("status", "draft")');
    expect(edge.split('.neq("status", "draft")').length).toBe(3);
    expect(edge).toContain('function portalVisibleStatus');
    expect(edge).toContain('sent: "Sent"');
    expect(src('src/pages/ClientPortalPublicPage.tsx')).toContain('portalInvoiceStatusLabel');
    expect(src('src/pages/ClientPortalPublicPage.tsx')).not.toMatch(/Relovi|Littleloop/);
  });

  it('treats a silent 0-row mark as failure so a still-draft link is not copied', () => {
    expect(interpretMarkSentWrite({ updatedId: 'row-1', liveStatus: 'draft', next: 'sent' }))
      .toEqual({ status: 'sent', markedSent: true });
    expect(interpretMarkSentWrite({ updatedId: undefined, liveStatus: 'sent', next: 'sent' }))
      .toEqual({ status: 'sent', markedSent: false });
    expect(() => interpretMarkSentWrite({ updatedId: null, liveStatus: 'draft', next: 'sent' }))
      .toThrow(MARK_SENT_WRITE_FAILED);

    const deliver = src('src/lib/documentShareDeliver.ts');
    expect(deliver).toContain(".select('id')");
    expect(deliver).toContain('interpretMarkSentWrite');
    expect(deliver).toContain("select('status')");
    const quoteMark = deliver.slice(
      deliver.indexOf('export async function markQuoteSentForShare'),
      deliver.indexOf('export async function markInvoiceSentForShare'),
    );
    expect(quoteMark.indexOf(".select('id')")).toBeGreaterThan(quoteMark.indexOf('.eq(\'status\', \'draft\')'));
    expect(quoteMark.indexOf("select('status')")).toBeGreaterThan(quoteMark.indexOf(".select('id')"));

    const editor = src('src/pages/QuotesPage.tsx');
    expect(editor).toContain("showToast(e instanceof Error ? e.message : 'Could not copy the link.', 'error')");
    expect(editor.indexOf('copyShareText')).toBeLessThan(editor.indexOf('} catch (e) {'));

    const invoiceSend = src('src/components/invoicing/InvoiceSendDialog.tsx');
    expect(invoiceSend).toContain('onSent(bundle?.client?.email || \'client\', toast, { keepOpen: true })');
    expect(invoiceSend).toContain("queryKey: ['invoice', invoiceId]");
    expect(invoiceSend).toContain("queryKey: ['client-invoices']");
    expect(invoiceSend).toContain("queryKey: ['job-invoices']");

    const invoices = src('src/pages/InvoicesPage.tsx');
    expect(invoices).toContain("queryKey: ['invoice', sendingInvoiceId]");
    expect(invoices).toContain("queryKey: ['job-invoices']");
    expect(invoices).toContain("inv.status !== 'draft'");
    expect(invoices).toContain("status: 'sent'");
    expect(invoices).toContain('if (message) showToast(message)');

    const quoteSend = src('src/components/invoicing/QuoteSendDialog.tsx');
    expect(quoteSend).toContain("queryKey: ['client-quotes']");
    expect(quoteSend).toContain("queryKey: ['job-quotes']");
  });
});
