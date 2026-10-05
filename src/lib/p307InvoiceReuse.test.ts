import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  INVOICE_SOURCE_JOB_BILL,
  INVOICE_SOURCE_QUOTE,
  JOB_INVOICE_REUSED,
  invoiceHref,
  invoiceReuseOpen,
  jobQuoteInvoiceButton,
  quoteListInvoiceId,
} from './invoiceFromQuote';
import { jobBillInvoiceNextDetail } from './invoiceFromJobBill';
import { jobOpenNext, recommendJobAction } from './jobNextAction';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const now = new Date(2026, 7, 20);
const completedNoCrew = {
  id: 'job-1',
  status: 'completed' as const,
  scheduled_date: null,
  assigned_team: [] as string[],
};

describe('P-307 (i) — completed job list and sheet agree', () => {
  it('completed + crew [] is Invoice with the job-bill detail, not Assign crew', () => {
    const action = recommendJobAction({
      status: 'completed',
      scheduledDate: null,
      crewCount: 0,
      jhaCount: 0,
      inspectionCount: 0,
      invoiceCount: 0,
      hasAcceptedQuote: false,
      hasBillLines: true,
      billLineCount: 2,
      billTotal: 545,
      clockedOn: false,
    });
    expect(action).toMatchObject({
      key: 'invoice',
      label: 'Invoice',
      detail: jobBillInvoiceNextDetail(2, 545),
    });
    expect(action.detail).toBe('Draft invoice from the job bill · 2 lines · $545.00');
    expect(action.label).not.toBe('Assign crew');

    const list = jobOpenNext({ ...completedNoCrew, invoiceCount: 0 }, undefined, now);
    const sheet = jobOpenNext(completedNoCrew, {
      jhaCount: 0,
      inspectionCount: 0,
      invoiceCount: 0,
      hasAcceptedQuote: false,
      hasBillLines: true,
      billLineCount: 2,
      billTotal: 545,
      clockedOn: false,
    }, now);
    expect(list.label).toBe('Invoice');
    expect(sheet.label).toBe('Invoice');
    expect(sheet.action.detail).toBe(action.detail);
    expect(sheet.action.label).not.toBe('Assign crew');
  });
});

describe('P-307 (ii) — reuse opens the existing invoice', () => {
  it('routes to the existing id with the exact toast', () => {
    const reuse = invoiceReuseOpen('inv-job-bill');
    expect(reuse).toEqual({
      href: invoiceHref('inv-job-bill'),
      toast: 'Opened the invoice already on this job',
    });
    expect(JOB_INVOICE_REUSED).toBe('Opened the invoice already on this job');
    expect(reuse.toast).not.toMatch(/for this quote/i);
    expect(reuse.href).toBe('/invoices?id=inv-job-bill');

    const page = src('src/pages/JobDetailPage.tsx');
    const quoteMut = page.slice(
      page.indexOf('const invoiceFromQuote'),
      page.indexOf('const invoiceFromJobBill'),
    );
    const billMut = page.slice(
      page.indexOf('const invoiceFromJobBill'),
      page.indexOf('const attachClient = useMutation'),
    );
    expect(quoteMut).toContain('invoiceReuseOpen(result.id)');
    expect(quoteMut).toContain('navigate(invoiceReuseOpen(result.id).href)');
    expect(quoteMut).not.toContain('Invoice already exists for this quote');
    expect(billMut).toContain('invoiceReuseOpen(result.id)');
    expect(billMut).toContain('navigate(reuse ? reuse.href : invoiceHref(result.id))');
    expect(page).toContain('onInvoiceCreated={(result)');
    expect(page).toContain('invoiceReuseOpen(result.id)');
    expect(src('src/pages/QuotesPage.tsx')).toContain('invoiceReuseOpen(result.id)');
    expect(src('src/pages/QuotesPage.tsx')).toContain('navigate(reuse.href)');
    expect(src('src/components/jobs/JobCostingPanel.tsx')).toContain('JOB_INVOICE_REUSED');
    expect(src('src/components/jobs/JobCostingPanel.tsx')).toContain('onInvoiceCreated?.(result)');
  });
});

describe('P-307 (iii) — quote Invoice hides or opens once any invoice exists', () => {
  it('becomes Open invoice for a job-bill or quote-convert invoice', () => {
    expect(jobQuoteInvoiceButton('accepted', [])).toEqual({ kind: 'invoice', label: 'Invoice' });
    expect(jobQuoteInvoiceButton('accepted', [
      { id: 'from-bill', status: 'draft' },
    ])).toEqual({ kind: 'open', invoiceId: 'from-bill', label: 'Open invoice' });
    expect(jobQuoteInvoiceButton('accepted', [
      { id: 'from-quote', status: 'sent' },
    ])).toEqual({ kind: 'open', invoiceId: 'from-quote', label: 'Open invoice' });
    expect(jobQuoteInvoiceButton('draft', [])).toEqual({ kind: 'none' });

    expect(quoteListInvoiceId([], [{ id: 'job-bill', status: 'draft' }])).toBe('job-bill');
    expect(quoteListInvoiceId([{ id: 'from-quote', status: 'draft' }], [])).toBe('from-quote');
    expect(INVOICE_SOURCE_JOB_BILL).toBe('job_bill');
    expect(INVOICE_SOURCE_QUOTE).toBe('quote');

    const page = src('src/pages/JobDetailPage.tsx');
    expect(page).toContain('jobQuoteInvoiceButton(q.status, invoices)');
    expect(page).toContain('Open invoice');
    expect(page).not.toContain('!(invoices ?? []).some(inv => inv.quote_id === q.id)');
    expect(src('src/pages/QuotesPage.tsx')).toContain('quoteListInvoiceId');
  });

  it('C1 — Open invoice only on an accepted quote', () => {
    const invoiced = [{ id: 'job-inv', status: 'draft' as const }];
    expect(jobQuoteInvoiceButton('accepted', invoiced)).toEqual({
      kind: 'open',
      invoiceId: 'job-inv',
      label: 'Open invoice',
    });
    expect(jobQuoteInvoiceButton('draft', invoiced)).toEqual({ kind: 'none' });
    expect(jobQuoteInvoiceButton('sent', invoiced)).toEqual({ kind: 'none' });
    expect(jobQuoteInvoiceButton('declined', invoiced)).toEqual({ kind: 'none' });

    const page = src('src/pages/JobDetailPage.tsx');
    const quoteRow = page.slice(page.indexOf('jobQuoteInvoiceButton'), page.indexOf('title="Invoices"'));
    expect(quoteRow).toContain('jobQuoteInvoiceButton(q.status, invoices)');
    expect(quoteRow).toContain("quoteAct.kind === 'invoice'");
    expect(quoteRow).toContain("quoteAct.kind === 'open'");
    expect(quoteRow).toContain('return undefined');
  });
});
