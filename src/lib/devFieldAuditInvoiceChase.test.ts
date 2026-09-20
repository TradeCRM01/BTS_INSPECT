import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIT_INVOICE_2002_ID,
  AUDIT_INVOICE_2003_ID,
  getAuditInvoiceEditorRows,
  getAuditInvoiceNudgeRows,
} from './devFieldAuditDocs';
import { deriveNudges, invoiceChase } from './nudges';
import { effectiveInvoiceStatus } from './invoiceStatus';

function armAudit(pathname = '/invoices'): void {
  const values = new Map<string, string>();
  const sessionStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  vi.stubGlobal('window', {
    location: { pathname, search: '?auditAuth=1' },
    sessionStorage,
  });
  vi.stubGlobal('sessionStorage', sessionStorage);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DEV audit invoice chase fixtures', () => {
  it('provides two stale unpaid invoices that land in Overdue with chase chips', () => {
    armAudit();
    const rows = getAuditInvoiceEditorRows() ?? [];
    const chaseRows = rows.filter(row =>
      row.id === AUDIT_INVOICE_2002_ID || row.id === AUDIT_INVOICE_2003_ID,
    );
    const now = new Date('2026-09-20T09:00:00.000Z');

    expect(chaseRows.map(row => row.invoice_number)).toEqual([2002, 2003]);
    expect(chaseRows.map(row => effectiveInvoiceStatus(row))).toEqual(['overdue', 'overdue']);
    expect(chaseRows.map(row => invoiceChase(row, now)?.state)).toEqual(['overdue', 'overdue']);
  });

  it('feeds both Dashboard nudges without a live query', () => {
    armAudit('/');
    const invoices = getAuditInvoiceNudgeRows() ?? [];
    const nudges = deriveNudges({
      jobs: [],
      quotes: [],
      invoices,
      now: new Date('2026-09-20T09:00:00.000Z'),
    });

    expect(nudges.map(nudge => nudge.label)).toEqual([
      'Overdue invoice #2002',
      'Overdue invoice #2003',
    ]);
    expect(nudges.every(nudge => nudge.href.endsWith('&send=1'))).toBe(true);
  });

  it('wires the shared fixture into Dashboard and Invoices only through audit helpers', () => {
    const dashboard = readFileSync(resolve('src/pages/DashboardPage.tsx'), 'utf8');
    const invoices = readFileSync(resolve('src/pages/InvoicesPage.tsx'), 'utf8');

    expect(dashboard).toContain('getAuditInvoiceNudgeRows');
    expect(invoices).toContain('getAuditInvoiceEditorRows');
    expect(invoices).toContain('getAuditInvoiceEditorRow(invoiceIdParam)');
  });
});
