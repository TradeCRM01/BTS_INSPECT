import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { quoteChaseCopyText } from './documentShare';
import {
  QUOTE_CHASE_AFTER_DAYS,
  QUOTE_CHASE_COPY_DISABLED,
  QUOTE_CHASE_FILTER,
  deriveNudges,
  quoteChase,
  quoteChaseCopyDisabledReason,
  quoteChaseFilterLabel,
  quoteChaseHref,
  quoteChaseMarkPatch,
  quoteOnChaseList,
} from './nudges';
import { listQueryBusy } from './listQueryReady';
import { clientPortalPublicUrl } from './sendQuote';

const NOW = new Date(2026, 8, 11, 9, 30);

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function sentQuote(over: {
  id?: string;
  status?: string;
  sent_at?: string | null;
  updated_at?: string;
  chased_at?: string | null;
  validity_date?: string | null;
  quote_number?: number;
  total?: number;
  client_name?: string | null;
}) {
  return {
    id: over.id ?? 'q1',
    quote_number: over.quote_number ?? 12,
    status: over.status ?? 'sent',
    updated_at: over.updated_at ?? new Date(2026, 8, 10, 18).toISOString(),
    sent_at: over.sent_at === undefined ? new Date(2026, 8, 7, 12).toISOString() : over.sent_at,
    chased_at: over.chased_at ?? null,
    validity_date: over.validity_date ?? null,
    total: over.total ?? 1320,
    client_name: over.client_name ?? 'Sarah Lee',
  };
}

describe('Step 4 quote chase done-whens', () => {
  it('(1) sent quote older than 3 days shows once under Chase; 1-day-old does not', () => {
    expect(QUOTE_CHASE_AFTER_DAYS).toBe(3);
    expect(QUOTE_CHASE_FILTER).toBe('chase');
    const old = sentQuote({ id: 'old', sent_at: new Date(2026, 8, 7, 12).toISOString() });
    const dayOld = sentQuote({ id: 'fresh', sent_at: new Date(2026, 8, 10, 12).toISOString() });
    expect(quoteOnChaseList(old, NOW)).toBe(true);
    expect(quoteChase(old, NOW)).toEqual({ state: 'quiet', days: 4 });
    expect(quoteOnChaseList(dayOld, NOW)).toBe(false);
    expect(quoteChase(dayOld, NOW)).toBeNull();
    const nudges = deriveNudges({
      jobs: [],
      quotes: [old, dayOld],
      invoices: [],
      userId: null,
      now: NOW,
    }).filter(n => n.kind === 'quote_chase');
    expect(nudges).toHaveLength(1);
    expect(nudges[0].href).toBe(quoteChaseHref('old'));
  });

  it('(2) copied text matches the signed all-trades line with portal /p?t=', () => {
    const portalUrl = clientPortalPublicUrl('https://grafter.com.au', 'abc');
    expect(portalUrl).toBe('https://grafter.com.au/p?t=abc');
    expect(quoteChaseCopyText({
      clientName: 'Sarah Lee',
      companyName: 'Harbour Trade Co',
      quoteNumber: 12,
      total: 1320,
      portalUrl: portalUrl!,
    })).toBe(
      'Hi Sarah, just following up on quote #0012 for $1,320.00. You can view and accept it here: https://grafter.com.au/p?t=abc. Happy to answer any questions. Thanks, Harbour Trade Co',
    );
  });

  it('(3) Mark chased removes it from the list, chip, and dashboard; copy does not auto-mark', () => {
    const quote = sentQuote({ id: 'q-chase' });
    const patch = quoteChaseMarkPatch(quote, NOW);
    expect(patch).toEqual({ chased_at: NOW.toISOString() });
    expect(patch).not.toHaveProperty('updated_at');
    expect(quoteOnChaseList({ ...quote, ...patch }, NOW)).toBe(false);
    expect(quoteChase({ ...quote, ...patch }, NOW)).toBeNull();
    expect(deriveNudges({
      jobs: [],
      quotes: [{ ...quote, ...patch }],
      invoices: [],
      userId: null,
      now: NOW,
    })).toEqual([]);
    expect(quoteChaseCopyText({
      clientName: quote.client_name,
      companyName: 'Harbour Trade Co',
      quoteNumber: quote.quote_number,
      total: quote.total,
      portalUrl: 'https://grafter.com.au/p?t=abc',
    })).not.toContain('chased_at');
  });

  it('(4) accepted, declined, expired, and draft never show', () => {
    for (const status of ['accepted', 'declined', 'expired', 'draft'] as const) {
      const row = sentQuote({ status, sent_at: new Date(2026, 8, 1).toISOString() });
      expect(quoteOnChaseList(row, NOW), status).toBe(false);
      expect(quoteChase(row, NOW), status).toBeNull();
    }
  });

  it('(5) editing a chased or un-chased sent quote does not reset the sent clock', () => {
    const sentAt = new Date(2026, 8, 5, 8).toISOString();
    const edited = sentQuote({
      sent_at: sentAt,
      updated_at: NOW.toISOString(),
    });
    expect(quoteChase(edited, NOW)).toEqual({ state: 'quiet', days: 6 });
    expect(quoteOnChaseList(edited, NOW)).toBe(true);
    const chasedThenEdited = sentQuote({
      sent_at: sentAt,
      updated_at: NOW.toISOString(),
      chased_at: new Date(2026, 8, 10).toISOString(),
    });
    expect(quoteOnChaseList(chasedThenEdited, NOW)).toBe(false);
    expect(quoteChase(chasedThenEdited, NOW)).toBeNull();
  });

  it('(6) nothing is sent: no email, no SMS, status stays sent', () => {
    const page = src('src/pages/QuotesPage.tsx');
    const dialog = src('src/components/invoicing/QuoteChaseDialog.tsx');
    const patch = quoteChaseMarkPatch(sentQuote({}), NOW);
    expect(patch).toEqual({ chased_at: NOW.toISOString() });
    expect(patch).not.toHaveProperty('status');
    expect(dialog).toContain('Copy chase message');
    expect(dialog).toContain('Mark chased');
    expect(dialog).toContain('copyShareText');
    expect(dialog).toContain('ensureClientPortalUrl');
    expect(dialog).toContain('isDevFieldAuditAuth');
    expect(dialog).not.toContain('deliverQuote');
    expect(dialog).not.toContain('QuoteSendDialog');
    expect(dialog).not.toContain('RESEND_API_KEY');
    expect(dialog).not.toContain('TWILIO');
    expect(dialog).not.toContain('mailto:');
    expect(dialog).not.toContain('sms:');
    expect(page).toContain('QuoteChaseDialog');
    expect(page).toContain('setChasingQuoteId');
    expect(page).toContain("searchParams.get('chase') === '1'");
    expect(page).toContain('onChase(quote.id)');
    expect(page).not.toContain("onClick={() => { if (chase.state === 'lapsed') onOpen(); else requestSend(quote.id); }}");
    expect(page).not.toMatch(/Relovi|Littleloop/);
    expect(dialog).not.toMatch(/Relovi|Littleloop/);
    const persist = page.slice(page.indexOf('const persist = async'), page.indexOf('const handleInvoice'));
    expect(persist).not.toContain('sent_at');
    expect(persist).not.toContain('chased_at');
  });
});

describe('quote chase copy gate and filter chip', () => {
  it('keeps Mark chased available when copy is disabled', () => {
    const noClient = sentQuote({});
    expect(quoteChaseCopyDisabledReason({ clientId: null, portalUrl: null }))
      .toBe(QUOTE_CHASE_COPY_DISABLED);
    expect(quoteChaseMarkPatch(noClient, NOW)).toEqual({ chased_at: NOW.toISOString() });
  });

  it('gates the Chase · N chip on listQueryBusy so it never flashes 0', () => {
    expect(listQueryBusy({ isPending: true, data: undefined })).toBe(true);
    expect(quoteChaseFilterLabel(true, 0)).toBe('Chase');
    expect(quoteChaseFilterLabel(false, 2)).toBe('Chase · 2');
    expect(src('src/pages/QuotesPage.tsx')).toContain('quoteChaseFilterLabel(busy, chaseCount)');
    expect(src('src/pages/QuotesPage.tsx')).toContain('listQueryBusy');
  });
});
