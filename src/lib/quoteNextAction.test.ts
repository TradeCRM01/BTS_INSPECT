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

  it('opens the job while work is still in progress, then invoices when completed', () => {
    expect(recommendQuoteAction({ ...accepted, jobId: 'job-1', jobFinished: false }).key).toBe('open_job');
    expect(recommendQuoteAction({ ...accepted, jobId: 'job-1', jobFinished: true }).key).toBe('invoice');
    expect(recommendQuoteAction({ ...accepted, jobId: 'job-1', invoiceId: 'inv-1', jobFinished: true }).key).toBe('open_job');
    expect(recommendQuoteAction({
      ...accepted,
      jobId: 'job-1',
      jobFinished: false,
      jobStatus: 'cancelled',
    }).detail).not.toMatch(/Finish the job on site/i);
    expect(recommendQuoteAction({
      ...accepted,
      jobId: 'job-1',
      jobFinished: false,
      jobStatus: 'cancelled',
    }).detail).toMatch(/cancelled/i);
    expect(recommendQuoteAction({
      ...accepted,
      jobId: 'job-1',
      invoiceId: 'inv-1',
      jobFinished: false,
    }).detail).toMatch(/already has a job and an invoice/i);
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
  const listed = {
    id: 'q-0016',
    quote_number: 16,
    total: 24,
    status: 'draft' as const,
    client_id: 'c-old',
    line_items: [{ description: 'Old line', quantity: 1 }],
  };
  const saved = {
    id: 'q-0016',
    total: 57,
    status: 'sent' as const,
    client_id: 'c-new',
    line_items: [{ description: 'Board', quantity: 2 }],
  };

  it('merges total, status, client_id and line_items on an existing id', () => {
    const next = quotesAfterSave([listed], saved);
    expect(next).toEqual([{
      ...listed,
      total: 57,
      status: 'sent',
      client_id: 'c-new',
      line_items: saved.line_items,
    }]);
    expect(next?.[0]?.quote_number).toBe(16);
  });

  it('leaves a new id off the list so invalidate can refill a complete row', () => {
    const other = { id: 'q-0015', quote_number: 15, total: 100, status: 'draft' as const, client_id: 'c-1', line_items: [] };
    expect(quotesAfterSave([listed, other], saved)?.map(row => row.id)).toEqual(['q-0016', 'q-0015']);
    expect(quotesAfterSave([other], { id: 'q-new', total: 57 })).toEqual([other]);
    expect(quotesAfterSave(undefined, saved)).toBeUndefined();
    expect(quotesAfterSave(null, saved)).toBeUndefined();
  });
});

describe('quote editor save writes quotes list cache', () => {
  function src(rel: string): string {
    return readFileSync(resolve(process.cwd(), rel), 'utf8');
  }

  it('patches an existing row then invalidates; create only invalidates', () => {
    const page = src('src/pages/QuotesPage.tsx');
    expect(QUOTES_LIST_QUERY_KEY).toEqual(['quotes']);
    expect(page).toContain('queryKey: [\'quotes\']');
    expect(page).toContain('quotesAfterSave');
    expect(page).toContain('QUOTES_LIST_QUERY_KEY');
    expect(page).toContain("setQueryData<QuoteListItem[]>(QUOTES_LIST_QUERY_KEY");
    expect(page).toContain('quotesAfterSave(prev, listRow)');
    expect(page).toContain('id,');
    expect(page).toContain('total: grandTotal,');
    expect(page).toContain('status,');
    expect(page).toContain('client_id: payload.client_id,');
    expect(page).toContain('line_items: cleanLines,');
    expect(page).toContain("invalidateQueries({ queryKey: QUOTES_LIST_QUERY_KEY })");
    expect(page).toContain('quoteMoney(quote.total)');
    const created = page.slice(
      page.indexOf("message: opts?.message ?? 'Quote created'"),
      page.indexOf('return data.id as string'),
    );
    expect(created).not.toContain('listRow');
    const handleSaved = page.slice(page.indexOf('function handleSaved'), page.indexOf('if (pageQueryBlocked'));
    const setAt = handleSaved.indexOf('setQueryData');
    const invalidateAt = handleSaved.indexOf('invalidateQueries({ queryKey: QUOTES_LIST_QUERY_KEY })');
    expect(setAt).toBeGreaterThan(-1);
    expect(invalidateAt).toBeGreaterThan(setAt);
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
    expect(ctx).toMatchObject({ hasClient: true, hasLines: true, jobId: 'job-1', invoiceId: null, jobFinished: false });
    expect(quoteCardHint(ctx)).toBe('Open job');

    const readyToInvoice = quoteActionContext({
      status: 'accepted',
      client_id: 'c1',
      line_items: [{ description: 'Board', quantity: 1 }],
      job_id: 'job-1',
      invoice_id: null,
      job_status: 'completed',
    });
    expect(quoteCardHint(readyToInvoice)).toBe('Create invoice');

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
