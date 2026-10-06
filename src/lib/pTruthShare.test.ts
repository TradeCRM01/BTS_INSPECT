import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  documentShareCopyToast,
  invoiceStatusAfterMarkSent,
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
    expect(editor).toContain('showToast(toast || \'Link copied\')');

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
});
