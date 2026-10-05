import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { jobClientEmailToStore } from './saveJobClientEmail';
import {
  QUOTES_LIST_QUERY_KEY,
  quoteActionContext,
  quoteAfterMarkAccepted,
  quoteCardHint,
  quoteHasChargeableLines,
  quoteListBucket,
  quoteMarkAcceptedWrite,
  quotesAfterSave,
  recommendQuoteAction,
} from './quoteNextAction';

const accepted = {
  status: 'accepted' as const,
  hasClient: true,
  hasLines: true,
  jobId: null as string | null,
  invoiceId: null as string | null,
};

describe('quoteListBucket', () => {
  it('groups the working statuses and parks declined/expired', () => {
    expect(quoteListBucket('draft')).toBe('draft');
    expect(quoteListBucket('sent')).toBe('sent');
    expect(quoteListBucket('accepted')).toBe('accepted');
    expect(quoteListBucket('declined')).toBe('closed');
    expect(quoteListBucket('expired')).toBe('closed');
  });
});

describe('quoteHasChargeableLines', () => {
  it('needs a description and a quantity', () => {
    expect(quoteHasChargeableLines([])).toBe(false);
    expect(quoteHasChargeableLines([{ description: 'Labour', quantity: 0 }])).toBe(false);
    expect(quoteHasChargeableLines([{ description: '  ', quantity: 1 }])).toBe(false);
    expect(quoteHasChargeableLines([{ description: 'Labour', quantity: 2 }])).toBe(true);
  });
});

describe('recommendQuoteAction', () => {
  it('asks for a client and lines before send', () => {
    expect(recommendQuoteAction({
      status: 'draft', hasClient: false, hasLines: true, jobId: null, invoiceId: null,
    }).key).toBe('none');
    expect(recommendQuoteAction({
      status: 'draft', hasClient: true, hasLines: false, jobId: null, invoiceId: null,
    }).label).toBe('Add line items');
    expect(recommendQuoteAction({
      status: 'draft', hasClient: true, hasLines: true, jobId: null, invoiceId: null,
    }).key).toBe('send');
  });

  it('keeps Send when the client has no email — share does not wait on SMTP or mailto', () => {
    const priced = {
      status: 'draft' as const,
      hasClient: true,
      hasLines: true,
      jobId: null as string | null,
      invoiceId: null as string | null,
    };
    expect(recommendQuoteAction({ ...priced, hasClientEmail: false })).toMatchObject({
      key: 'send',
      label: 'Send',
    });
    expect(recommendQuoteAction({ ...priced, hasClientEmail: false }).detail).toMatch(/No Grafter SMTP/i);
    expect(recommendQuoteAction({ ...priced, hasClientEmail: true })).toMatchObject({
      key: 'send',
      label: 'Send',
    });

    expect(recommendQuoteAction(quoteActionContext({
      status: 'draft',
      client_id: 'c1',
      client_email: jobClientEmailToStore(''),
      line_items: [{ description: 'Board', quantity: 1 }],
    })).key).toBe('send');
    expect(recommendQuoteAction(quoteActionContext({
      status: 'draft',
      client_id: 'c1',
      client_email: jobClientEmailToStore('not-an-email'),
      line_items: [{ description: 'Board', quantity: 1 }],
    })).key).toBe('send');
    expect(recommendQuoteAction(quoteActionContext({
      status: 'draft',
      client_id: 'c1',
      client_email: jobClientEmailToStore('jane@acme.com.au'),
      line_items: [{ description: 'Board', quantity: 1 }],
    }))).toMatchObject({ key: 'send', label: 'Send' });
    expect(recommendQuoteAction(quoteActionContext({
      status: 'draft',
      client_id: null,
      client_email: 'jane@acme.com.au',
      line_items: [{ description: 'Board', quantity: 1 }],
    })).label).toBe('Add a client');
  });

  it('accepts a sent quote before converting', () => {
    expect(recommendQuoteAction({
      status: 'sent', hasClient: true, hasLines: true, jobId: null, invoiceId: null,
    }).key).toBe('accept');
  });

  it('converts to a job before invoicing when there is no job yet', () => {
    expect(recommendQuoteAction(accepted).key).toBe('convert_job');
    expect(recommendQuoteAction({ ...accepted, invoiceId: 'inv-1' }).key).toBe('convert_job');
  });

  it('invoices once the job exists, and does not nag after both exist', () => {
    expect(recommendQuoteAction({ ...accepted, jobId: 'job-1' }).key).toBe('invoice');
    expect(recommendQuoteAction({ ...accepted, jobId: 'job-1', invoiceId: 'inv-1' }).key).toBe('open_job');
  });

  it('leaves declined and expired alone', () => {
    expect(recommendQuoteAction({ ...accepted, status: 'declined' }).key).toBe('none');
    expect(recommendQuoteAction({ ...accepted, status: 'expired' }).label).toBe('Expired');
  });

  it('keeps Mark accepted as Next on a sent quote; the chase chip sits beside it', () => {
    expect(recommendQuoteAction({
      status: 'sent', hasClient: true, hasLines: true, jobId: null, invoiceId: null,
    }).label).toBe('Mark accepted');
  });
});

describe('quoteMarkAcceptedWrite', () => {
  it('marks a draft accepted, then Convert is next, and does not send', () => {
    const draft = {
      status: 'draft' as const,
      hasClient: true,
      hasLines: true,
      jobId: null as string | null,
      invoiceId: null as string | null,
    };
    const write = quoteMarkAcceptedWrite();
    expect(write).toEqual({ status: 'accepted', close: false, message: 'Quote accepted' });
    expect(write).not.toHaveProperty('sendQuote');
    expect(write).not.toHaveProperty('email');
    expect(write).not.toHaveProperty('sms');
    expect(recommendQuoteAction(draft).key).toBe('send');
    expect(quoteAfterMarkAccepted(draft)).toEqual({
      key: 'convert_job',
      label: 'Convert to job',
      detail: 'Create the job from this quote. You can invoice it next.',
    });

    const editor = readFileSync(resolve(process.cwd(), 'src/pages/QuotesPage.tsx'), 'utf8')
      .split('function QuoteEditorModal')[1] ?? '';
    const more = editor.slice(editor.indexOf('hub-quote-more-menu'), editor.indexOf('</details>'));
    const draftMore = more.slice(more.indexOf("form.status === 'draft'"), more.indexOf("form.status === 'sent'"));
    expect(draftMore).toContain('quoteMarkAcceptedWrite');
    expect(draftMore).toContain('Mark accepted');
    expect(draftMore).toContain('persist(write.status');
    expect(draftMore).not.toContain('startSend');
    expect(draftMore).not.toContain('onRequestSend');
    expect(draftMore).not.toContain('sendQuote');
    expect(draftMore).not.toContain('quoteSmsBody');
    expect(editor).toContain("next.key === 'accept'");
    expect(editor).toContain("persist('accepted', { close: false, message: 'Quote accepted' })");
  });
});

describe('quotesAfterSave', () => {
  const listed = { id: 'q-0016', quote_number: 16, total: 24 };
  const saved = { id: 'q-0016', quote_number: 16, total: 57 };

  it('replaces the list row total after editor save without a reload', () => {
    expect(quotesAfterSave([listed], saved)).toEqual([saved]);
    expect(quotesAfterSave([listed], saved)[0]?.total).toBe(57);
  });

  it('keeps the saved quote in place and prepends a new id', () => {
    const other = { id: 'q-0015', quote_number: 15, total: 100 };
    expect(quotesAfterSave([listed, other], saved).map(row => row.id)).toEqual(['q-0016', 'q-0015']);
    expect(quotesAfterSave([other], { id: 'q-new', total: 57 }).map(row => row.id)).toEqual(['q-new', 'q-0015']);
    expect(quotesAfterSave(undefined, saved)).toEqual([saved]);
    expect(quotesAfterSave(null, saved)[0]?.total).toBe(57);
  });
});

describe('quote editor save writes quotes list cache', () => {
  function src(rel: string): string {
    return readFileSync(resolve(process.cwd(), rel), 'utf8');
  }

  it('writes the saved total onto [\'quotes\'] after Save, then invalidates', () => {
    const page = src('src/pages/QuotesPage.tsx');
    expect(QUOTES_LIST_QUERY_KEY).toEqual(['quotes']);
    expect(page).toContain('queryKey: [\'quotes\']');
    expect(page).toContain('quotesAfterSave');
    expect(page).toContain('QUOTES_LIST_QUERY_KEY');
    expect(page).toContain("setQueryData<QuoteListItem[]>(QUOTES_LIST_QUERY_KEY");
    expect(page).toContain('quotesAfterSave(prev, listRow)');
    expect(page).toContain('listRow: { id, total: grandTotal }');
    expect(page).toContain("invalidateQueries({ queryKey: QUOTES_LIST_QUERY_KEY })");
    expect(page).toContain('quoteMoney(quote.total)');
    expect(page).not.toMatch(/Relovi|Littleloop/);
  });
});

describe('quoteActionContext / quoteCardHint', () => {
  it('reads client, lines, job and invoice off the quote row', () => {
    const ctx = quoteActionContext({
      status: 'accepted',
      client_id: 'c1',
      line_items: [{ description: 'Board', quantity: 1 }],
      job_id: 'job-1',
      invoice_id: null,
    });
    expect(ctx).toMatchObject({ hasClient: true, hasLines: true, jobId: 'job-1', invoiceId: null });
    expect(quoteCardHint(ctx)).toBe('Create invoice');

    const noEmail = quoteActionContext({
      status: 'draft',
      client_id: 'c1',
      client_email: null,
      line_items: [{ description: 'Board', quantity: 1 }],
    });
    expect(noEmail).toMatchObject({ hasClient: true, hasClientEmail: false, hasLines: true });
    expect(quoteCardHint(noEmail)).toBe('Send');
  });
});
