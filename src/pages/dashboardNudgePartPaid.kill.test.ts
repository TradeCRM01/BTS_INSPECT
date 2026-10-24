import { describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  invoices: [] as Row[],
}));

vi.mock('../lib/supabase', () => {
  function builder(table: string) {
    const filters: Array<{ kind: string; col: string; val: unknown }> = [];
    const result = () => {
      if (table !== 'invoices') return Promise.resolve({ data: [], error: null });
      let rows = [...h.invoices];
      for (const filter of filters) {
        if (filter.kind === 'in') {
          const allowed = (filter.val as unknown[]).map(String);
          rows = rows.filter(row => allowed.includes(String(row[filter.col])));
        }
      }
      return Promise.resolve({ data: rows, error: null });
    };
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.gte = () => q;
    q.lte = () => q;
    q.in = (col: string, val: unknown) => { filters.push({ kind: 'in', col, val }); return q; };
    q.then = (a: (v: unknown) => unknown, b?: (e: unknown) => unknown) => result().then(a, b);
    return q;
  }
  return { supabase: { from: (table: string) => builder(table) } };
});

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'u-1', company_id: 'co', role: 'admin' }, company: { id: 'co' } }),
}));
vi.mock('../components/layout/AppShell', () => ({ AppShell: ({ children }: { children: unknown }) => children }));

import { deriveNudges } from '../lib/nudges';
import { loadDashboardNudgeData } from './DashboardPage';

describe('F2 part_paid nudge query', () => {
  it('kills a quiet part_paid invoice that the old sent/overdue filter dropped', async () => {
    h.invoices = [{
      id: 'pp1',
      invoice_number: 118,
      status: 'part_paid',
      due_date: '2026-11-01',
      updated_at: '2026-10-01T00:00:00.000Z',
      total: 880,
      chased_at: null,
      client_id: null,
    }];
    const data = await loadDashboardNudgeData('2026-10-19', '2026-10-20');
    expect(data.invoices.map(row => row.id)).toEqual(['pp1']);
    const nudges = deriveNudges({
      ...data,
      userId: 'u-1',
      now: new Date(2026, 9, 19, 13, 40),
    });
    expect(nudges.some(nudge => nudge.kind === 'invoice_unpaid' && nudge.key === 'invoice_unpaid:pp1')).toBe(true);
    expect(nudges.find(nudge => nudge.key === 'invoice_unpaid:pp1')?.detail).toContain('$880.00');
  });
});
