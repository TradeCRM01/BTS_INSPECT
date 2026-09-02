import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  effectiveInvoiceStatus,
  invoiceListEmptyMessage,
  invoiceListEmptyTitle,
  invoiceListIsNoneYet,
  invoiceMatchesListFilter,
  persistableInvoiceStatus,
  todayIsoDate,
  INVOICE_LIST_DEFAULT_FILTER,
} from './invoiceStatus';

describe('effectiveInvoiceStatus', () => {
  const now = new Date(2026, 7, 20); // 20 Aug 2026 local

  it('keeps paid and draft even when the due date has passed', () => {
    expect(effectiveInvoiceStatus({ status: 'paid', due_date: '2020-01-01' }, now)).toBe('paid');
    expect(effectiveInvoiceStatus({ status: 'draft', due_date: '2020-01-01' }, now)).toBe('draft');
  });

  it('treats sent past due as overdue', () => {
    expect(effectiveInvoiceStatus({ status: 'sent', due_date: '2026-08-19' }, now)).toBe('overdue');
  });

  it('keeps sent when due today or in the future', () => {
    expect(effectiveInvoiceStatus({ status: 'sent', due_date: '2026-08-20' }, now)).toBe('sent');
    expect(effectiveInvoiceStatus({ status: 'sent', due_date: '2026-08-21' }, now)).toBe('sent');
  });

  it('keeps sent when there is no due date', () => {
    expect(effectiveInvoiceStatus({ status: 'sent', due_date: null }, now)).toBe('sent');
  });

  it('keeps an explicit overdue status', () => {
    expect(effectiveInvoiceStatus({ status: 'overdue', due_date: '2026-12-01' }, now)).toBe('overdue');
  });
});

describe('persistableInvoiceStatus', () => {
  it('UI form still stores sent instead of overdue — Perth hop stamps separately', () => {
    expect(persistableInvoiceStatus('overdue')).toBe('sent');
    expect(persistableInvoiceStatus('sent')).toBe('sent');
    expect(persistableInvoiceStatus('paid')).toBe('paid');
    expect(persistableInvoiceStatus('draft')).toBe('draft');
  });
});

describe('todayIsoDate', () => {
  it('formats local YYYY-MM-DD', () => {
    expect(todayIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('invoice list default filter', () => {
  const now = new Date(2026, 7, 20);

  const rows = [
    { id: 'late-stored', status: 'overdue', due_date: '2026-08-01' },
    { id: 'late-sent', status: 'sent', due_date: '2026-08-19' },
    { id: 'awaiting', status: 'sent', due_date: '2026-08-21' },
    { id: 'draft', status: 'draft', due_date: '2026-08-01' },
    { id: 'paid', status: 'paid', due_date: '2026-08-01' },
  ];

  it('defaults /invoices to Overdue so the sparkie opens chase work first', () => {
    expect(INVOICE_LIST_DEFAULT_FILTER).toBe('overdue');
    expect(rows.filter((row) => invoiceMatchesListFilter(row, INVOICE_LIST_DEFAULT_FILTER, now)).map((row) => row.id))
      .toEqual(['late-stored', 'late-sent']);
  });

  it('lets the sparkie switch back to All and still reach every existing status', () => {
    expect(rows.filter((row) => invoiceMatchesListFilter(row, 'all', now)).map((row) => row.id))
      .toEqual(['late-stored', 'late-sent', 'awaiting', 'draft', 'paid']);
    expect(rows.filter((row) => invoiceMatchesListFilter(row, 'draft', now)).map((row) => row.id)).toEqual(['draft']);
    expect(rows.filter((row) => invoiceMatchesListFilter(row, 'sent', now)).map((row) => row.id)).toEqual(['awaiting']);
    expect(rows.filter((row) => invoiceMatchesListFilter(row, 'paid', now)).map((row) => row.id)).toEqual(['paid']);
  });

  it('names an empty Overdue floor without pretending there are no invoices', () => {
    expect(invoiceListIsNoneYet({ search: '', invoiceCount: 3 })).toBe(false);
    expect(invoiceListEmptyTitle({ noneYet: false })).toBe('No matching invoices');
    expect(invoiceListEmptyMessage({ noneYet: false })).toBe('Try another status or search.');
    expect(invoiceListIsNoneYet({ search: '', invoiceCount: 0 })).toBe(true);
    expect(invoiceListEmptyTitle({ noneYet: true })).toBe('No invoices yet');
    expect(invoiceListEmptyMessage({ noneYet: true }))
      .toBe('Invoice from an accepted quote, or open a job and invoice the bill.');
  });
});

describe('invoice list default wiring', () => {
  it('opens existing /invoices on Overdue and keeps All on the same tabs', () => {
    const page = readFileSync(resolve(process.cwd(), 'src/pages/InvoicesPage.tsx'), 'utf8');
    const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

    expect(page).toContain('INVOICE_LIST_DEFAULT_FILTER');
    expect(page).toContain("useState<StatusFilter>(INVOICE_LIST_DEFAULT_FILTER)");
    expect(page).toContain('invoiceMatchesListFilter');
    expect(page).toContain('invoiceListIsNoneYet');
    expect(page).toContain('invoiceListEmptyTitle');
    expect(page).toContain('setStatusFilter(tab.key)');
    expect(page).toContain("{ key: 'all', label: 'All' }");
    expect(page).toContain("{ key: 'overdue', label: 'Overdue' }");
    expect(page).toContain("{ key: 'draft', label: 'Draft' }");
    expect(page).toContain("{ key: 'sent', label: 'Sent' }");
    expect(page).toContain("{ key: 'paid', label: 'Paid' }");
    expect(page).not.toContain("useState<StatusFilter>('all')");
    expect(page).not.toContain('/overdue-invoices');
    expect(page).not.toContain('OverdueInvoicesPage');
    expect(app).toContain('<Route path="/invoices"');
    expect(app).not.toContain('/overdue-invoices');
  });
});
