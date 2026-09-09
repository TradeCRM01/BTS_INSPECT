import { describe, expect, it } from 'vitest';
import { GRAFTER_PUBLIC_ORIGIN } from './publicSeo';
import {
  decideInvoiceShare,
  decideQuoteShare,
  documentShareMailtoHref,
  documentShareOrigin,
  invoiceNeedsMarkSent,
  invoiceShareMailtoBody,
  invoiceStatusAfterMarkSent,
  quoteNeedsMarkSentForAccept,
  quoteShareAfterPortalUrl,
  quoteShareMailtoBody,
  quoteStatusAfterMarkSent,
} from './documentShare';

describe('documentShareOrigin', () => {
  it('uses the live origin, and falls back to grafter.com.au on localhost', () => {
    expect(documentShareOrigin('https://bts-inspect.pages.dev')).toBe('https://bts-inspect.pages.dev');
    expect(documentShareOrigin('https://grafter.com.au/')).toBe('https://grafter.com.au');
    expect(documentShareOrigin('http://127.0.0.1:5173')).toBe(GRAFTER_PUBLIC_ORIGIN);
    expect(documentShareOrigin('http://localhost:5173')).toBe(GRAFTER_PUBLIC_ORIGIN);
    expect(documentShareOrigin('')).toBe(GRAFTER_PUBLIC_ORIGIN);
  });
});

describe('documentShareMailtoHref', () => {
  it('opens a mail draft with subject and body — no SMTP', () => {
    const href = documentShareMailtoHref({
      to: 'sam@client.example',
      subject: 'Quote #0004 from BTS',
      body: 'BTS sent you quote-0004. Review and accept here:\nhttps://grafter.com.au/p?t=abc',
    });
    expect(href).toBe(
      'mailto:sam%40client.example?subject=Quote%20%230004%20from%20BTS&body=BTS%20sent%20you%20quote-0004.%20Review%20and%20accept%20here%3A%0Ahttps%3A%2F%2Fgrafter.com.au%2Fp%3Ft%3Dabc',
    );
    expect(documentShareMailtoHref({
      to: null,
      subject: 'Quote #0004 from BTS',
      body: 'https://grafter.com.au/p?t=abc',
    })).toBeNull();
    expect(documentShareMailtoHref({
      to: 'not-an-email',
      subject: 'Quote #0004 from BTS',
      body: 'https://grafter.com.au/p?t=abc',
    })).toBeNull();
  });
});

describe('decideQuoteShare', () => {
  it('lets Download PDF and Copy link work without SMTP or client email', () => {
    const share = decideQuoteShare({
      status: 'draft',
      hasClient: true,
      hasLines: true,
      quoteNumber: 4,
      companyName: 'BTS',
      clientEmail: null,
    });
    expect(share).toMatchObject({
      kind: 'quote',
      subject: 'Quote #0004 from BTS',
      filename: 'quote-0004.pdf',
      to: null,
      canDownloadPdf: true,
      canCopyLink: true,
      canMailto: false,
      canMarkSent: true,
      needsMarkSent: true,
    });
    expect(quoteNeedsMarkSentForAccept('draft')).toBe(true);
    expect(quoteNeedsMarkSentForAccept('sent')).toBe(false);
    expect(quoteStatusAfterMarkSent('draft')).toBe('sent');
    expect(quoteStatusAfterMarkSent('sent')).toBeNull();
    expect(quoteStatusAfterMarkSent('accepted')).toBeNull();
  });

  it('builds mailto once the portal URL and client email exist', () => {
    const ready = decideQuoteShare({
      status: 'sent',
      hasClient: true,
      hasLines: true,
      quoteNumber: 4,
      companyName: 'BTS',
      clientEmail: 'sam@client.example',
      portalUrl: 'https://grafter.com.au/p?t=abc',
    });
    expect(ready.canMailto).toBe(true);
    expect(ready.canMarkSent).toBe(false);
    expect(ready.mailtoHref).toContain('mailto:sam%40client.example');
    expect(ready.mailtoHref).toContain('subject=Quote%20%230004%20from%20BTS');
    expect(ready.mailtoHref).toContain('grafter.com.au');
    expect(quoteShareMailtoBody({
      companyName: 'BTS',
      quoteNumber: 4,
      portalUrl: 'https://grafter.com.au/p?t=abc',
    })).toContain('https://grafter.com.au/p?t=abc');
  });

  it('fills mailto after the portal token is ensured', () => {
    const draft = decideQuoteShare({
      status: 'draft',
      hasClient: true,
      hasLines: true,
      quoteNumber: 4,
      companyName: 'BTS',
      clientEmail: 'sam@client.example',
    });
    expect(draft.canMailto).toBe(false);
    const withLink = quoteShareAfterPortalUrl(
      draft,
      'https://grafter.com.au/p?t=abc',
      'BTS',
      4,
    );
    expect(withLink.canMailto).toBe(true);
    expect(withLink.portalUrl).toBe('https://grafter.com.au/p?t=abc');
  });

  it('does not invent a copy link without a client', () => {
    const share = decideQuoteShare({
      status: 'draft',
      hasClient: false,
      hasLines: true,
      quoteNumber: 4,
      companyName: 'BTS',
    });
    expect(share.canCopyLink).toBe(false);
    expect(share.canMarkSent).toBe(false);
    expect(share.canDownloadPdf).toBe(true);
  });
});

describe('decideInvoiceShare', () => {
  it('mirrors quote share without an SMTP gate', () => {
    const share = decideInvoiceShare({
      status: 'draft',
      hasClient: true,
      hasLines: true,
      invoiceNumber: 9,
      companyName: 'BTS',
      clientEmail: 'sam@client.example',
      portalUrl: 'https://grafter.com.au/p?t=abc',
    });
    expect(share).toMatchObject({
      kind: 'invoice',
      subject: 'Invoice #0009 from BTS',
      filename: 'invoice-0009.pdf',
      canDownloadPdf: true,
      canCopyLink: true,
      canMailto: true,
      canMarkSent: true,
    });
    expect(invoiceNeedsMarkSent('draft')).toBe(true);
    expect(invoiceStatusAfterMarkSent('draft')).toBe('sent');
    expect(invoiceStatusAfterMarkSent('sent')).toBeNull();
    expect(invoiceShareMailtoBody({
      companyName: 'BTS',
      invoiceNumber: 9,
      portalUrl: 'https://grafter.com.au/p?t=abc',
    })).toContain('View it here');
  });
});
