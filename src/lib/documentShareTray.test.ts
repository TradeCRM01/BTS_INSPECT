import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('quote / invoice share tray — no Grafter SMTP', () => {
  it('Send dialogs expose Download PDF, Copy link, and mailto without Company settings', () => {
    const quote = src('src/components/invoicing/QuoteSendDialog.tsx');
    const invoice = src('src/components/invoicing/InvoiceSendDialog.tsx');
    const next = src('src/lib/quoteNextAction.ts');
    const invoiceNext = src('src/lib/invoiceNextAction.ts');
    const convert = src('src/lib/convertQuoteToJob.ts');

    expect(quote).toContain('Download PDF');
    expect(quote).toContain('Copy link');
    expect(quote).toContain('Open mail draft');
    expect(quote).toContain('Mark sent');
    expect(quote).toContain('ensureClientPortalUrl');
    expect(quote).toContain('markQuoteSentForShare');
    expect(quote).toContain('openDocumentShareMailto(next.mailtoHref)');
    expect(quote).not.toContain('Company settings');
    expect(quote).not.toContain('COMPANY_EMAIL_SETTINGS_HREF');
    expect(quote).not.toContain('deliverQuote');
    expect(quote).not.toContain('Relovi');
    expect(quote).not.toContain('Littleloop');

    expect(invoice).toContain('Download PDF');
    expect(invoice).toContain('Copy link');
    expect(invoice).toContain('Open mail draft');
    expect(invoice).toContain('Mark sent');
    expect(invoice).toContain('ensureClientPortalUrl');
    expect(invoice).toContain('markInvoiceSentForShare');
    expect(invoice).toContain('openDocumentShareMailto(next.mailtoHref)');
    expect(invoice).not.toContain('Company settings');
    expect(invoice).not.toContain('deliverInvoice');
    expect(invoice).not.toContain('Relovi');
    expect(invoice).not.toContain('Littleloop');

    expect(next).toContain('No Grafter SMTP');
    expect(invoiceNext).toContain('No Grafter SMTP');
    expect(invoiceNext).not.toContain('COMPANY_EMAIL_SETTINGS_HREF');
    expect(convert).toContain('CONVERT_QUOTE_NEED_DATE_CREW');
    expect(src('src/pages/QuotesPage.tsx')).toContain('hub-quote-convert');
    expect(src('src/pages/QuotesPage.tsx')).toContain('if (lookLetterhead) return [convertQuote]');
    expect(src('src/pages/QuotesPage.tsx')).toContain('fieldAuditShareQuote');
    expect(src('src/pages/InvoicesPage.tsx')).toContain('isDevFieldAuditAuth()');
  });
});
