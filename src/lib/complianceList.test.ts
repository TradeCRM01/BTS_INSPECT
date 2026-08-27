import { describe, expect, it } from 'vitest';
import type { ComplianceStatus } from '../types/compliance';
import {
  COMPLIANCE_LIST_DEFAULT_FILTER,
  COMPLIANCE_LIST_FILTERS,
  complianceListAuditItems,
  complianceListDueLabel,
  complianceListEmptyMessage,
  complianceListEmptyTitle,
  complianceListFloorBucket,
  complianceListFloorLede,
  complianceListLiveStatus,
  complianceListOpenHref,
  complianceListSearchHaystack,
  complianceMatchesListFilter,
  complianceMatchesSearch,
  computeNextDueDate,
  decorateComplianceForList,
  decorateComplianceList,
  deriveComplianceStatus,
  filterComplianceListFloor,
  parseComplianceListFilter,
  parseComplianceListOpenId,
  sortComplianceListFloor,
  type ComplianceListRow,
} from './complianceList';

const now = new Date(2026, 7, 21, 12, 0, 0);

function row(over: Partial<ComplianceListRow> = {}): ComplianceListRow {
  return {
    id: 'comp-1',
    title: 'Annual RCD test',
    status: 'upcoming',
    next_due_date: '2026-11-01',
    last_completed_date: '2025-11-01',
    first_due_date: '2024-11-01',
    standard_or_regulation: 'AS/NZS 3760',
    client_name: 'Acme Plants',
    description: 'Switchboard test at Plant A',
    notes: 'Book the leading hand',
    ...over,
  };
}

describe('due or open compliance floor', () => {
  it('defaults to Due or open, not All', () => {
    expect(COMPLIANCE_LIST_DEFAULT_FILTER).toBe('action');
    expect(COMPLIANCE_LIST_FILTERS[0]).toEqual({ key: 'action', label: 'Due or open' });
    expect(parseComplianceListFilter(null)).toBe('action');
    expect(parseComplianceListFilter('all')).toBe('all');
    expect(parseComplianceListFilter('nope')).toBe('action');
  });

  it('treats overdue and due-soon as due, even when stored status is still upcoming', () => {
    const overdue = row({
      id: 'over',
      status: 'upcoming',
      next_due_date: '2026-08-01',
      title: 'Overdue extinguisher',
    });
    const dueSoon = row({
      id: 'soon',
      status: 'upcoming',
      next_due_date: '2026-09-01',
      title: 'Due soon warranty',
    });
    expect(complianceListLiveStatus(overdue, now)).toBe('overdue');
    expect(complianceListLiveStatus(dueSoon, now)).toBe('due_soon');
    expect(complianceListFloorBucket(overdue, now)).toBe('due');
    expect(complianceListFloorBucket(dueSoon, now)).toBe('due');
    expect(complianceMatchesListFilter(overdue, 'action', now)).toBe(true);
    expect(complianceMatchesListFilter(dueSoon, 'action', now)).toBe(true);
  });

  it('treats a far-future tracked item as open work on the action floor', () => {
    const upcoming = row();
    expect(complianceListLiveStatus(upcoming, now)).toBe('upcoming');
    expect(complianceListFloorBucket(upcoming, now)).toBe('open');
    expect(complianceMatchesListFilter(upcoming, 'action', now)).toBe(true);
    expect(complianceMatchesListFilter(upcoming, 'upcoming', now)).toBe(true);
  });

  it('keeps completed and paused off the due-or-open floor', () => {
    const done = row({ id: 'done', status: 'completed', next_due_date: '2026-08-01' });
    const paused = row({ id: 'paused', status: 'paused', next_due_date: '2026-08-01' });
    expect(complianceListFloorBucket(done, now)).toBe('done');
    expect(complianceListFloorBucket(paused, now)).toBe('done');
    expect(complianceMatchesListFilter(done, 'action', now)).toBe(false);
    expect(complianceMatchesListFilter(paused, 'action', now)).toBe(false);
    expect(complianceMatchesListFilter(done, 'all', now)).toBe(true);
    expect(complianceMatchesListFilter(paused, 'paused', now)).toBe(true);
  });

  it('opens on the existing /compliance path with id — no new audit route', () => {
    expect(complianceListOpenHref('comp-1')).toBe('/compliance?id=comp-1');
    expect(parseComplianceListOpenId('comp-1')).toBe('comp-1');
    expect(parseComplianceListOpenId('  ')).toBeNull();
    expect(complianceListOpenHref('comp-1')).not.toContain('/audit');
    expect(complianceListOpenHref('comp-1')).not.toContain('/compliance/new');
    expect(decorateComplianceForList(row(), now).href).toBe('/compliance?id=comp-1');
  });
});

describe('compliance list search and sort', () => {
  it('finds title, client, standard, and notes', () => {
    const item = row();
    expect(complianceMatchesSearch(item, 'rcd')).toBe(true);
    expect(complianceMatchesSearch(item, 'acme')).toBe(true);
    expect(complianceMatchesSearch(item, '3760')).toBe(true);
    expect(complianceMatchesSearch(item, 'leading hand')).toBe(true);
    expect(complianceMatchesSearch(item, 'switchboard')).toBe(true);
    expect(complianceMatchesSearch(item, 'xyz-missing')).toBe(false);
    expect(complianceListSearchHaystack(item)).toContain('acme plants');
  });

  it('sorts overdue first, then due soon, then open', () => {
    const upcoming = decorateComplianceForList(row({ id: 'u', title: 'Later', next_due_date: '2026-12-01' }), now);
    const soon = decorateComplianceForList(row({ id: 's', title: 'Soon', next_due_date: '2026-09-01' }), now);
    const overdue = decorateComplianceForList(row({
      id: 'o',
      title: 'Late',
      status: 'upcoming',
      next_due_date: '2026-07-01',
    }), now);
    const paused = decorateComplianceForList(row({ id: 'p', status: 'paused', title: 'Hold' }), now);
    const sorted = sortComplianceListFloor([upcoming, paused, soon, overdue]);
    expect(sorted.map(item => item.row.id)).toEqual(['o', 's', 'u', 'p']);
  });

  it('filters the decorated floor and leaves All intact', () => {
    const items = decorateComplianceList([
      row({ id: 'due', next_due_date: '2026-08-01', title: 'Due RCD' }),
      row({ id: 'open', next_due_date: '2026-12-01', title: 'Later warranty' }),
      row({ id: 'done', status: 'completed', title: 'Finished' }),
    ], now);
    const action = filterComplianceListFloor(items, { filter: 'action', search: '' }, now);
    expect(action.map(item => item.row.id)).toEqual(['due', 'open']);
    const search = filterComplianceListFloor(items, { filter: 'action', search: 'warranty' }, now);
    expect(search.map(item => item.row.id)).toEqual(['open']);
    expect(filterComplianceListFloor(items, { filter: 'all', search: '' }, now)).toHaveLength(3);
  });
});

describe('compliance list empty copy and recurrence', () => {
  it('tells a sparkie the action floor is empty without inventing a new product', () => {
    expect(complianceListEmptyTitle({ filter: 'action', noneAtAll: true })).toBe('No compliance items yet');
    expect(complianceListEmptyTitle({ filter: 'action', noneAtAll: false })).toBe('Nothing due or open');
    expect(complianceListEmptyMessage({ filter: 'action', noneAtAll: false })).toContain('due or open floor');
    expect(complianceListEmptyMessage({ filter: 'all', noneAtAll: false })).toBe('Try another status or search.');
  });

  it('labels a tile due date and floor lede without inventing counts', () => {
    expect(complianceListDueLabel('2026-08-27')).toBe('Due 27 Aug 2026');
    expect(complianceListFloorLede(1)).toBe('1 item · tap one to open');
    expect(complianceListFloorLede(2)).toBe('2 items · tap one to open');
    const audit = complianceListAuditItems('co-1');
    expect(audit).toHaveLength(2);
    expect(audit[0].next_due_date).toBe('2026-08-27');
    expect(complianceListOpenHref(audit[0].id)).toBe('/compliance?id=audit-compliance-rcd');
  });

  it('keeps the existing next-due math for mark complete / save', () => {
    expect(computeNextDueDate(null, '2026-08-21', 12, 'months')).toBe('2026-08-21');
    expect(computeNextDueDate('2026-08-21', '2025-08-21', 12, 'months')).toBe('2027-08-21');
    expect(deriveComplianceStatus('2026-08-01', null, false, now)).toBe('overdue');
    expect(deriveComplianceStatus('2026-09-10', null, false, now)).toBe('due_soon');
    expect(deriveComplianceStatus('2026-12-01', null, false, now)).toBe('upcoming');
    expect(deriveComplianceStatus('2026-08-01', null, true, now)).toBe('paused');
    const statuses: ComplianceStatus[] = ['upcoming', 'due_soon', 'overdue', 'completed', 'paused'];
    expect(statuses).toHaveLength(5);
  });
});
