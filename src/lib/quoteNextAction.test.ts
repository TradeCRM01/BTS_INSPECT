import { describe, expect, it } from 'vitest';
import {
  quoteActionContext,
  quoteCardHint,
  quoteHasChargeableLines,
  quoteListBucket,
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
  });
});
