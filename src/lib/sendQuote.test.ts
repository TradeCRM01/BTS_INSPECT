import { describe, expect, it } from 'vitest';
import {
  applyQuoteSendScope,
  canClientAcceptQuote,
  clientEmailForSend,
  clientPortalAcceptBody,
  clientPortalPublicUrl,
  commercialPdfDataForQuote,
  decideQuoteSend,
  isQuoteSendScoped,
  isSmtpReady,
  quoteInvoiceSendPathReady,
  resolveSendSmtp,
  pickActiveClientPortalToken,
  quoteAttachmentOrMiss,
  quotePdfFilename,
  quoteSendClientQuery,
  quoteSendHtml,
  quoteSendJobQuery,
  quoteSendQueries,
  quoteSendSubject,
  quoteSmsBody,
  quoteStatusAfterClientAccept,
  quoteStatusAfterSend,
  quoteStatusPatchAfterSend,
  shouldRecordQuoteSent,
  wouldScanLedgerToSendQuote,
  type QuoteSendBundle,
  type QuoteSendQuote,
} from './sendQuote';

const smtp = {
  smtp_host: 'smtp.resend.com',
  smtp_pass: 're_test',
  from_name: 'BTS Electrical',
  from_email: 'quotes@btselectrical.com.au',
};

const company = { name: 'BTS Electrical', email: 'office@btselectrical.com.au' };

const quote: QuoteSendQuote = {
  id: 'q1',
  company_id: 'co1',
  quote_number: 12,
  client_id: 'c1',
  job_id: 'job-1',
  status: 'draft',
  description: 'Switchboard upgrade',
  scope_of_works: 'Replace the main board',
  line_items: [{ description: 'Labour', quantity: 4, unit_price: 120 }],
  subtotal: 480,
  tax_rate: 10,
  tax_amount: 48,
  total: 528,
  validity_date: '2026-09-19',
  notes: 'Side gate',
  inclusions: ['Materials'],
  exclusions: ['After hours'],
};

const client = {
  id: 'c1',
  name: 'Acme Plumbing',
  email: 'jane@acme.com.au',
  phone: '0412 345 678',
  address: '12 Smith St',
};

function bundle(over: Partial<QuoteSendBundle> = {}): QuoteSendBundle {
  return {
    quote,
    client,
    jobAddress: 'Warehouse B',
    smtp,
    company,
    ...over,
  };
}

describe('clientEmailForSend', () => {
  it('prefills To from the client email and rejects empty / invalid', () => {
    expect(clientEmailForSend('jane@acme.com.au')).toBe('jane@acme.com.au');
    expect(clientEmailForSend('  jane@acme.com.au  ')).toBe('jane@acme.com.au');
    expect(clientEmailForSend('')).toBeNull();
    expect(clientEmailForSend(null)).toBeNull();
    expect(clientEmailForSend('not-an-email')).toBeNull();
  });
});

describe('isSmtpReady', () => {
  it('needs the wired Resend host, key, and from address', () => {
    expect(isSmtpReady(smtp)).toBe(true);
    expect(isSmtpReady(null)).toBe(false);
    expect(isSmtpReady({ ...smtp, smtp_host: '' })).toBe(false);
    expect(isSmtpReady({ ...smtp, smtp_pass: '  ' })).toBe(false);
    expect(isSmtpReady({ ...smtp, from_email: '' })).toBe(false);
    expect(isSmtpReady({ ...smtp, smtp_host: 'smtp.gmail.com' })).toBe(false);
  });
});

describe('decideQuoteSend', () => {
  it('prefills To from the quote client and is ready when SMTP is set', () => {
    expect(decideQuoteSend(bundle())).toEqual({
      ok: true,
      to: 'jane@acme.com.au',
      toName: 'Acme Plumbing',
      subject: 'Quote #0012 from BTS Electrical',
      filename: 'quote-0012.pdf',
      smsTo: '+61412345678',
      smsMessage: null,
    });
  });

  it('does not pretend it sent when the client has no email', () => {
    const decision = decideQuoteSend(bundle({ client: { ...client, email: null } }));
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.blocker).toBe('no_email');
    expect(decision.message).toMatch(/no email/i);
    expect(decision.href).toBe('/clients/c1');
  });

  it('rides shared Grafter send when the company has no SMTP row', () => {
    const decision = decideQuoteSend(bundle({ smtp: null }));
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.to).toBe('jane@acme.com.au');
    expect(quoteStatusAfterSend(false, 'draft')).toBe('draft');
  });

  it('is an honest setup_email miss only when nothing can send', () => {
    const decision = decideQuoteSend(bundle({ smtp: null, sharedSmtp: null }));
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.blocker).toBe('no_smtp');
    expect(decision.message).toMatch(/not set up/i);
    expect(decision.href).toBe('/settings/company');
  });

  it('prefers company SMTP and falls back to shared Grafter Resend', () => {
    expect(resolveSendSmtp(smtp, null)).toEqual(smtp);
    expect(resolveSendSmtp(null, smtp)).toEqual(smtp);
    expect(resolveSendSmtp(null, null)).toBeNull();
    expect(quoteInvoiceSendPathReady(null)).toBe(true);
    expect(quoteInvoiceSendPathReady(null, null)).toBe(false);
    expect(quoteInvoiceSendPathReady(null, smtp)).toBe(true);
  });

  it('blocks send when there is no client or no priced lines', () => {
    expect(decideQuoteSend(bundle({ quote: { ...quote, client_id: null } })).ok).toBe(false);
    expect(decideQuoteSend(bundle({
      quote: { ...quote, line_items: [{ description: 'Labour', quantity: 0, unit_price: 10 }] },
    })).ok).toBe(false);
    expect(decideQuoteSend(bundle({ quote: null })).ok).toBe(false);
  });

  it('names SMS miss honestly and does not block send', () => {
    const decision = decideQuoteSend(bundle({ client: { ...client, phone: null } }));
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.smsTo).toBeNull();
    expect(decision.smsMessage).toMatch(/no phone/i);
  });
});

describe('quoteStatusAfterSend', () => {
  it('marks sent only when delivery succeeded', () => {
    expect(quoteStatusAfterSend(true, 'draft')).toBe('sent');
    expect(quoteStatusAfterSend(false, 'draft')).toBe('draft');
    expect(quoteStatusPatchAfterSend(true)).toEqual({ status: 'sent' });
    expect(quoteStatusPatchAfterSend(false)).toBeNull();
    expect(shouldRecordQuoteSent(true, 'draft')).toBe(true);
    expect(shouldRecordQuoteSent(false, 'draft')).toBe(false);
  });

  it('does not rewrite accepted / declined on a failed send', () => {
    expect(quoteStatusAfterSend(false, 'accepted')).toBe('accepted');
    expect(quoteStatusAfterSend(true, 'accepted')).toBe('accepted');
    expect(shouldRecordQuoteSent(true, 'accepted')).toBe(false);
  });
});

describe('quote send copy / document name', () => {
  it('names the PDF and subject from the quote number', () => {
    expect(quotePdfFilename(12)).toBe('quote-0012.pdf');
    expect(quoteSendSubject(12, 'BTS Electrical')).toBe('Quote #0012 from BTS Electrical');
  });

  it('includes the existing client portal link beside reply-to-go-ahead copy', () => {
    const portalUrl = 'https://app.example/p?t=portal-token-1';
    const html = quoteSendHtml({
      clientName: 'Jane',
      companyName: 'BTS Electrical',
      quoteNumber: 12,
      totalLabel: '$528.00',
      validityLabel: '19 Sep 2026',
      portalUrl,
    });
    expect(html).toContain('Jane');
    expect(html).toContain('#0012');
    expect(html).toContain('PDF is attached');
    expect(html).toContain('$528.00');
    expect(html).toContain(portalUrl);
    expect(html).toContain('Accept this quote');
    expect(html).toContain('color:#0A2540');
    expect(html).toMatch(/Accept this quote: <a href="https:\/\/app\.example\/p\?t=portal-token-1" style="color:#2E75B6">/);
    expect(html).not.toContain('Open your client portal');
    expect(html).toContain('change the scope');
    expect(quoteSmsBody({
      companyName: 'BTS Electrical',
      quoteNumber: 12,
      totalLabel: '$528.00',
      validityLabel: '19 Sep 2026',
      portalUrl,
    })).toContain('Accept here: https://app.example/p?t=portal-token-1');
  });

  it('keeps reply-to-go-ahead copy when there is no portal token yet', () => {
    const html = quoteSendHtml({
      clientName: 'Jane',
      companyName: 'BTS Electrical',
      quoteNumber: 12,
      totalLabel: '$528.00',
      validityLabel: '19 Sep 2026',
    });
    expect(html).toContain('Reply to this email if you want to go ahead');
    expect(html).not.toContain('/p?t=');
    expect(quoteSmsBody({
      companyName: 'BTS Electrical',
      quoteNumber: 12,
      totalLabel: '$528.00',
      validityLabel: '19 Sep 2026',
    })).not.toContain('Accept here');
  });
});

describe('client portal accept helpers', () => {
  it('builds the existing /p?t= link and only accepts sent quotes', () => {
    expect(clientPortalPublicUrl('https://app.example/', 'abc123')).toBe('https://app.example/p?t=abc123');
    expect(clientPortalPublicUrl('', 'abc123')).toBeNull();
    expect(pickActiveClientPortalToken([
      { token: 'revoked', revoked: true },
      { token: 'expired', expires_at: '2020-01-01T00:00:00.000Z' },
      { token: 'live', revoked: false, expires_at: '2030-01-01T00:00:00.000Z' },
    ])).toBe('live');
    expect(canClientAcceptQuote('sent')).toBe(true);
    expect(canClientAcceptQuote('draft')).toBe(false);
    expect(quoteStatusAfterClientAccept('sent')).toBe('accepted');
    expect(quoteStatusAfterClientAccept('accepted')).toBe('accepted');
    expect(quoteStatusAfterClientAccept('draft')).toBeNull();
    expect(clientPortalAcceptBody('tok', 'q1')).toEqual({
      token: 'tok',
      action: 'accept_quote',
      quoteId: 'q1',
    });
  });
});

describe('quoteAttachmentOrMiss', () => {
  it('refuses an empty PDF so status stays draft', () => {
    expect(quoteAttachmentOrMiss(null).ok).toBe(false);
    expect(quoteAttachmentOrMiss({ filename: 'quote-0012.pdf', content: '' }).ok).toBe(false);
    expect(quoteAttachmentOrMiss({
      filename: 'quote-0012.pdf',
      content: 'JVBERi0x',
    }).ok).toBe(true);
  });
});

describe('commercialPdfDataForQuote', () => {
  it('keeps the existing quote PDF fields — client, lines, GST, validity', () => {
    const pdf = commercialPdfDataForQuote(bundle(), new Date('2026-08-20T10:00:00'));
    expect(pdf).toMatchObject({
      kind: 'quote',
      docNumber: '#0012',
      clientName: 'Acme Plumbing',
      total: 528,
      taxAmount: 48,
    });
    expect(pdf?.clientDetail).toContain('jane@acme.com.au');
    expect(pdf?.lines).toHaveLength(1);
    expect(pdf?.secondaryValue).toBe('19 Sep 2026');
  });
});

describe('quote send query scope', () => {
  it('loads one quote by id + company, not the company ledger', () => {
    const scopes = quoteSendQueries({ companyId: 'co1', quoteId: 'q1' });
    expect(isQuoteSendScoped(scopes.quote)).toBe(true);
    expect(isQuoteSendScoped(scopes.smtp)).toBe(true);
    expect(wouldScanLedgerToSendQuote(scopes.quote)).toBe(false);
    expect(scopes.quote.eq).toEqual({ id: 'q1', company_id: 'co1' });
    expect(scopes.quote.columns).not.toBe('*');
    expect(scopes.smtp.eq).toEqual({ company_id: 'co1' });
    expect(quoteSendClientQuery(null)).toBeNull();
    expect(quoteSendJobQuery('')).toBeNull();
    expect(quoteSendClientQuery('c1')?.eq).toEqual({ id: 'c1' });
    expect(quoteSendJobQuery('job-1')?.eq).toEqual({ id: 'job-1' });
  });

  it('treats an unscoped quotes select as a ledger scan', () => {
    expect(wouldScanLedgerToSendQuote({
      table: 'quotes',
      columns: 'id, status',
      eq: { company_id: 'co1' },
    })).toBe(true);
    expect(wouldScanLedgerToSendQuote({
      table: 'clients',
      columns: 'id, email',
      eq: {},
    })).toBe(true);
  });

  it('applies id + company_id eq — never an unscoped quotes select', () => {
    const calls: string[] = [];
    const builder = {
      select(columns: string) {
        calls.push(`select:${columns}`);
        return this;
      },
      eq(column: string, value: string) {
        calls.push(`eq:${column}:${value}`);
        return this;
      },
    };
    const scopes = quoteSendQueries({ companyId: 'co1', quoteId: 'q1' });
    applyQuoteSendScope(builder, scopes.quote);
    expect(calls[0]).toMatch(/^select:/);
    expect(calls).toContain('eq:id:q1');
    expect(calls).toContain('eq:company_id:co1');
    expect(calls.some(call => call.startsWith('in:'))).toBe(false);
  });

  it('does not scan clients when the quote has no client', () => {
    expect(wouldScanLedgerToSendQuote(quoteSendClientQuery(null))).toBe(false);
  });
});
