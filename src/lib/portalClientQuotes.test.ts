import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  portalClientInvoices,
  portalClientQuotes,
  portalVisibleStatus,
} from './portalClientQuotes';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('portalClientQuotes', () => {
  it('excludes a draft quote from the portal list and still shows a sent quote', () => {
    const listed = portalClientQuotes([
      { id: 'q-draft', quote_number: '0005', status: 'draft' },
      { id: 'q-sent', quote_number: '0006', status: 'sent' },
    ]);
    expect(listed).toEqual([
      { id: 'q-sent', quote_number: '0006', status: 'sent' },
    ]);

    const edge = src('supabase/functions/client-portal/index.ts');
    const listSelect = '.select("id, quote_number, status, job_id, total, validity_date, updated_at")';
    const start = edge.indexOf(listSelect);
    expect(start).toBeGreaterThan(-1);
    const query = edge.slice(start, edge.indexOf('.limit(50)', start));
    expect(query).toContain('.neq("status", "draft")');
  });

  it('hides draft invoices and capitalises portal statuses', () => {
    expect(portalClientInvoices([
      { id: 'i-draft', status: 'draft' },
      { id: 'i-sent', status: 'sent' },
      { id: 'i-paid', status: 'paid' },
      { id: 'i-overdue', status: 'overdue' },
    ]).map(row => row.id)).toEqual(['i-sent', 'i-paid', 'i-overdue']);

    expect(portalVisibleStatus('draft')).toBeNull();
    expect(portalVisibleStatus('sent')).toBe('Sent');
    expect(portalVisibleStatus('paid')).toBe('Paid');
    expect(portalVisibleStatus('accepted')).toBe('Accepted');
    expect(portalVisibleStatus('overdue')).toBe('Overdue');
    expect(portalVisibleStatus('part_paid')).toBe('Part paid');

    const edge = src('supabase/functions/client-portal/index.ts');
    const invoiceSelect = '.select("id, invoice_number, status, total, amount_paid, due_date, updated_at")';
    const start = edge.indexOf(invoiceSelect);
    expect(start).toBeGreaterThan(-1);
    const query = edge.slice(start, edge.indexOf('.limit(50)', start));
    expect(query).toContain('.neq("status", "draft")');
    expect(edge).toContain('function portalVisibleStatus');
    expect(edge).toContain('sent: "Sent"');
    expect(edge).toContain('paid: "Paid"');
    expect(edge).toContain('accepted: "Accepted"');
    expect(edge).toContain('overdue: "Overdue"');
    expect(edge).toContain('part_paid: "Part paid"');
  });
});
