import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INVOICE_SOURCE_JOB_BILL, INVOICE_SOURCE_QUOTE, invoicesForOneJob, pickReusableInvoice } from './invoiceFromQuote';
import {
  JOB_BILL_INVOICE_EMPTY,
  decideJobBillInvoice,
  invoiceLinesFromJobCosts,
  jobBillInvoiceBlocked,
  jobBillInvoiceNextDetail,
} from './invoiceFromJobBill';
import { jobInvoiceActionFlags, jobListNext, jobOpenNext, recommendJobAction } from './jobNextAction';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const now = new Date(2026, 7, 20);
const completed = {
  id: 'job-1',
  status: 'completed' as const,
  scheduled_date: '2026-08-18',
  assigned_team: ['a'],
};
const sheetBase = {
  jhaCount: 1,
  inspectionCount: 1,
  invoiceCount: 0,
  hasAcceptedQuote: false,
  hasBillLines: true,
  billLineCount: 2,
  billTotal: 545,
  clockedOn: false,
  clockedOff: true,
};

describe('P-305 G1 — jobs list Invoice on a completed job', () => {
  it('shows Invoice for completed + 0 invoices and opens Paperwork without creating', () => {
    const next = jobListNext(completed, now, { invoiceCount: 0 });
    expect(next).toEqual({
      href: '/jobs/job-1#job-invoices',
      label: 'Invoice',
      actionable: true,
    });
    const card = jobOpenNext({ ...completed, invoiceCount: 0 }, undefined, now);
    expect(card.label).toBe('Invoice');
    expect(card.actionable).toBe(true);
    expect(card.href).toBe('/jobs/job-1#job-invoices');
    expect(card.href).toContain('#job-invoices');
    expect(src('src/pages/JobsPage.tsx')).not.toContain('createInvoiceFromJobBill');
    expect(src('src/pages/JobsPage.tsx')).toContain('jobInvoiceActionFlags');
    expect(src('src/lib/jobNextAction.ts')).toContain('#job-invoices');
    expect(src('src/lib/devFieldAuditDocs.ts')).toContain("id !== 'look-job-bayswater'");
    expect(src('src/pages/JobDetailPage.tsx')).toContain("endsWith('/look-job-bayswater')");
  });

  it('keeps Completed when the list does not know invoices yet', () => {
    expect(jobListNext(completed, now)).toEqual({
      href: '/jobs/job-1',
      label: 'Completed',
      actionable: false,
    });
  });

  it('shows the invoice state once one exists — Send draft, Invoiced after issue', () => {
    expect(jobListNext(completed, now, {
      invoiceCount: 1,
      hasDraftInvoice: true,
      hasIssuedInvoice: false,
    })).toEqual({
      href: '/jobs/job-1#job-invoices',
      label: 'Send',
      actionable: true,
    });
    expect(jobListNext(completed, now, {
      invoiceCount: 1,
      hasDraftInvoice: false,
      hasIssuedInvoice: true,
    })).toEqual({
      href: '/jobs/job-1',
      label: 'Invoiced',
      actionable: false,
    });
    expect(jobInvoiceActionFlags([{ id: 'd', status: 'draft' }], now)).toMatchObject({
      invoiceCount: 1,
      hasDraftInvoice: true,
      hasIssuedInvoice: false,
    });
  });
});

describe('P-305 G2 — sheet Next names the job bill', () => {
  it('replaces accepted-quote wording when Invoice runs the job-bill path', () => {
    const withQuote = recommendJobAction({
      status: 'completed',
      scheduledDate: '2026-08-18',
      crewCount: 1,
      jhaCount: 1,
      inspectionCount: 1,
      invoiceCount: 0,
      hasAcceptedQuote: true,
      hasBillLines: true,
      billLineCount: 2,
      billTotal: 545,
      clockedOn: false,
    });
    expect(withQuote).toMatchObject({
      key: 'invoice',
      label: 'Invoice',
      detail: jobBillInvoiceNextDetail(2, 545),
    });
    expect(withQuote.detail).toBe('Draft invoice from the job bill · 2 lines · $545.00');
    expect(withQuote.detail).not.toMatch(/Accepted quote is ready/);
    const sheet = jobOpenNext(completed, sheetBase, now);
    expect(sheet.action.detail).toBe('Draft invoice from the job bill · 2 lines · $545.00');
    expect(src('src/pages/JobDetailPage.tsx')).toContain('createInvoiceFromJobBill');
    expect(src('src/pages/JobDetailPage.tsx')).toContain('billLineCount: costTotals?.lines');
    expect(src('src/pages/JobDetailPage.tsx')).toContain('data-job-next-detail');
  });
});

describe('P-305 G3 — one invoice per job, both directions', () => {
  const lines = invoiceLinesFromJobCosts([
    { description: 'Labour', quantity: 1, unit_price: 100 },
  ]);

  it('(i) quote convert reuses a job-bill invoice already on that job', () => {
    const jobBill = { id: 'job-bill-1', status: 'draft', source: INVOICE_SOURCE_JOB_BILL };
    const reuse = pickReusableInvoice(invoicesForOneJob([], [jobBill]));
    expect(reuse?.id).toBe('job-bill-1');
    const convert = src('src/lib/convertQuoteToInvoice.ts');
    expect(convert).toContain('invoicesForOneJob');
    expect(convert).toContain('.eq(\'job_id\', jobId)');
    expect(convert).toContain('pickReusableInvoice');
    expect(convert).not.toContain('createInvoiceFromJobBill');
  });

  it('(ii) job-bill Invoice reuses a quote-convert invoice already on that job', () => {
    expect(decideJobBillInvoice({
      clientId: 'client-1',
      lines,
      existing: [{ id: 'from-quote', status: 'draft' }],
    })).toEqual({ action: 'reuse', invoiceId: 'from-quote', existing: true });
    const create = src('src/lib/createInvoiceFromJobBill.ts');
    expect(create).toContain('.eq(\'job_id\', input.jobId)');
    expect(create).toContain('decideJobBillInvoice');
    expect(src('src/lib/invoiceFromJobBill.ts')).toContain('pickReusableInvoice');
    expect(INVOICE_SOURCE_QUOTE).toBe('quote');
  });

  it('double tap never makes two — reuse wins in either order', () => {
    const quoteFirst = invoicesForOneJob(
      [{ id: 'shared', status: 'draft' }],
      [{ id: 'shared', status: 'draft' }],
    );
    const jobFirst = invoicesForOneJob(
      [{ id: 'shared', status: 'sent' }],
      [{ id: 'shared', status: 'sent' }, { id: 'later', status: 'draft' }],
    );
    expect(quoteFirst).toHaveLength(1);
    expect(pickReusableInvoice(quoteFirst)?.id).toBe('shared');
    expect(pickReusableInvoice(jobFirst)?.id).toBe('later');
    expect(decideJobBillInvoice({
      clientId: 'client-1',
      lines,
      existing: [{ id: 'shared', status: 'draft' }],
    }).action).toBe('reuse');
  });
});

describe('P-305 G4 — empty bill does not create a $0 draft', () => {
  it('names the empty bill and Invoice does not insert', () => {
    expect(recommendJobAction({
      status: 'completed',
      scheduledDate: '2026-08-18',
      crewCount: 1,
      jhaCount: 1,
      inspectionCount: 1,
      invoiceCount: 0,
      hasAcceptedQuote: true,
      hasBillLines: false,
      billLineCount: 0,
      billTotal: 0,
      clockedOn: false,
    })).toMatchObject({
      key: 'invoice',
      label: 'Invoice',
      detail: JOB_BILL_INVOICE_EMPTY,
    });
    expect(JOB_BILL_INVOICE_EMPTY).toBe('Job bill is empty — add lines before invoicing');
    expect(decideJobBillInvoice({
      clientId: 'client-1',
      lines: [],
      existing: [],
    })).toMatchObject({ action: 'miss', reason: 'no_lines' });
    const handle = src('src/pages/JobDetailPage.tsx');
    const start = handle.indexOf('const handleInvoice');
    const end = handle.indexOf('const handleSend');
    const body = handle.slice(start, end);
    expect(body).toContain('jobBillInvoiceBlocked(costTotals)');
    expect(body).toContain('JOB_BILL_INVOICE_EMPTY');
    expect(body).not.toContain('costTotals?.lines ?? 0');
    expect(body).toContain('return;');
    expect(body).toContain('invoiceFromJobBill.mutate()');
  });

  it('does not toast or block Invoice while costTotals is still undefined', () => {
    expect(jobBillInvoiceBlocked(undefined)).toBe(false);
    expect(jobBillInvoiceBlocked(null)).toBe(false);
    expect(jobBillInvoiceBlocked({ lines: 0 })).toBe(true);
    const handle = src('src/pages/JobDetailPage.tsx');
    const body = handle.slice(handle.indexOf('const handleInvoice'), handle.indexOf('const handleSend'));
    expect(body).toContain('jobBillInvoiceBlocked(costTotals)');
    expect(body).toContain('invoiceFromJobBill.mutate()');
    expect(body).not.toContain('(costTotals?.lines ?? 0) === 0');
  });
});
