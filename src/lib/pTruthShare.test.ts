import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  documentShareCopyErrorToast,
  documentShareCopyToast,
  documentShareManualCopyToast,
  interpretMarkSentWrite,
  invoiceStatusAfterMarkSent,
  isMarkSentWriteFailed,
  MARK_SENT_COPY_BLOCKED_TOAST,
  QUOTE_MANUAL_COPY_TOAST,
  INVOICE_MANUAL_COPY_TOAST,
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
    expect(editor).toContain('documentShareManualCopyToast');
    expect(editor).not.toContain('if (result.kind === \'manual\') setErr(result.text);');
    expect(editor).not.toContain('setErr(result.text)');
    expect(editor.indexOf('if (result.kind === \'manual\')')).toBeLessThan(editor.indexOf('showToast(toast || \'Link copied\')'));
    expect(editor).toContain("queryKey: ['client-quotes']");
    expect(editor).toContain("queryKey: ['job-quotes']");
    expect(QUOTE_MANUAL_COPY_TOAST).toBe('Quote marked as sent. Copy the link below.');

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
    try {
      interpretMarkSentWrite({ updatedId: null, liveStatus: 'draft', next: 'sent' });
      throw new Error('expected mark-sent failure');
    } catch (error) {
      expect(isMarkSentWriteFailed(error)).toBe(true);
      expect(error instanceof Error).toBe(false);
      expect(documentShareCopyErrorToast(error)).toBe(MARK_SENT_COPY_BLOCKED_TOAST);
    }

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
    expect(editor).toContain('documentShareCopyErrorToast');
    expect(editor).not.toContain("e instanceof Error ? e.message : 'Could not copy the link.'");
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

  it('C2 — flip failure toast matches the marker, not supabase error.message', () => {
    const supabaseShaped = { message: 'JWT expired', code: 'PGRST301' };
    expect(supabaseShaped instanceof Error).toBe(false);
    expect(isMarkSentWriteFailed(supabaseShaped)).toBe(false);
    expect(documentShareCopyErrorToast(supabaseShaped)).toBe('Could not copy the link.');
    expect(documentShareCopyErrorToast(new Error('Pick a client before you can copy a portal link.')))
      .toBe('Pick a client before you can copy a portal link.');
    expect(documentShareCopyErrorToast(new Error('Save the quote before you copy a link.')))
      .toBe('Save the quote before you copy a link.');
    expect(documentShareCopyErrorToast(new Error('Could not build the portal link.')))
      .toBe('Could not build the portal link.');
    expect(documentShareCopyErrorToast({ kind: 'mark_sent_write_failed' }))
      .toBe("Couldn't mark as sent, so the link wasn't copied. Try again.");
    expect(MARK_SENT_COPY_BLOCKED_TOAST).toBe(
      "Couldn't mark as sent, so the link wasn't copied. Try again.",
    );

    const deliver = src('src/lib/documentShareDeliver.ts');
    const quoteMark = deliver.slice(
      deliver.indexOf('export async function markQuoteSentForShare'),
      deliver.indexOf('export async function markInvoiceSentForShare'),
    );
    const invoiceMark = deliver.slice(
      deliver.indexOf('export async function markInvoiceSentForShare'),
      deliver.indexOf('export async function prepareDocumentShareLink'),
    );
    expect(quoteMark).toContain('markSentWriteFailed()');
    expect(quoteMark).not.toContain('throw error');
    expect(quoteMark).not.toContain('throw liveError');
    expect(invoiceMark).toContain('markSentWriteFailed()');
    expect(invoiceMark).not.toContain('throw error');

    for (const rel of [
      'src/pages/QuotesPage.tsx',
      'src/components/invoicing/QuoteSendDialog.tsx',
      'src/components/invoicing/InvoiceSendDialog.tsx',
    ]) {
      const page = src(rel);
      const start = page.indexOf('const handleCopyLink');
      const toastAt = page.indexOf('documentShareCopyErrorToast', start);
      expect(toastAt, rel).toBeGreaterThan(start);
      expect(page.slice(start, toastAt), rel).not.toContain('e instanceof Error ? e.message');
    }
  });

  it('C2 — manual clipboard shows a 390 wrap box and flip-only toast', () => {
    expect(documentShareManualCopyToast('quote', true)).toBe(QUOTE_MANUAL_COPY_TOAST);
    expect(documentShareManualCopyToast('quote', false)).toBeNull();
    expect(documentShareManualCopyToast('invoice', true)).toBe(INVOICE_MANUAL_COPY_TOAST);
    expect(documentShareManualCopyToast('invoice', false)).toBeNull();
    expect(QUOTE_MANUAL_COPY_TOAST).toBe('Quote marked as sent. Copy the link below.');
    expect(INVOICE_MANUAL_COPY_TOAST).toBe('Invoice marked as sent. Copy the link below.');

    expect(src('src/lib/documentShare.ts')).toContain("export const DOCUMENT_SHARE_MANUAL_LABEL = 'Copy this link:';");
    expect(src('src/lib/documentShare.ts')).not.toContain('export const MARK_SENT_WRITE_FAILED =');
    const box = src('src/components/invoicing/DocumentShareManualLink.tsx');
    expect(box).toContain('DOCUMENT_SHARE_MANUAL_LABEL');
    expect(box).toContain('hub-share-manual-link');
    expect(box).toContain('readOnly');
    expect(box).toContain('rows={4}');
    expect(box).toContain('scrollHeight');
    expect(box).toContain('currentTarget.select()');
    expect(box).not.toContain('hub-quote-err');

    const css = src('src/index.css');
    const manual = css.slice(css.indexOf('.hub-share-manual-link'), css.indexOf('.hub-quote-err'));
    expect(manual).toContain('max-width: min(100%, 390px)');
    expect(manual).toContain('min-height: 96px');
    expect(manual).toContain('overflow: hidden');
    expect(manual).toContain('word-break: break-all');
    expect(manual).toContain('overflow-wrap: anywhere');
    expect(manual).toContain('#FFFDF8');
    expect(manual).toContain('#0A2540');
    expect(manual).not.toContain('#B42318');

    const quotes = src('src/pages/QuotesPage.tsx');
    const quoteSend = src('src/components/invoicing/QuoteSendDialog.tsx');
    const invoiceSend = src('src/components/invoicing/InvoiceSendDialog.tsx');
    expect(quotes).toContain('DocumentShareManualLink');
    expect(quotes).toContain('documentShareManualCopyToast');
    expect(quotes).not.toContain('setErr(result.text)');
    expect(quoteSend).toContain('DocumentShareManualLink');
    expect(quoteSend).toContain("documentShareManualCopyToast('quote', markedSent)");
    expect(invoiceSend).toContain('DocumentShareManualLink');
    expect(invoiceSend).toContain("documentShareManualCopyToast('invoice', markedSent)");
    expect(invoiceSend).toContain('onSent(bundle?.client?.email || \'client\', manualToast, { keepOpen: true })');
    expect(invoiceSend).toContain('Payment reminder copied.');
    expect(src('src/pages/InvoicesPage.tsx')).toContain("status: 'sent'");
  });
});
