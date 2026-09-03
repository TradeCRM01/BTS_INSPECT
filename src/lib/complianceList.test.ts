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
  complianceListMetaLine,
  complianceListOpenHref,
  complianceListOpened,
  complianceListOtherItems,
  complianceListSheetItem,
  complianceListSearchHaystack,
  complianceMatchesListFilter,
  complianceMatchesSearch,
  complianceSheetClientId,
  complianceSheetClientLedger,
  complianceSheetClientLedgerEmpty,
  complianceSheetInspectionHref,
  complianceSheetSiblingCompliance,
  complianceSheetSiblingInspections,
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
import type { DueInspection, DueInspectionJob } from './inspectionDueReminder';

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
    client_id: 'client-acme',
    client_name: 'Acme Plants',
    description: 'Switchboard test at Plant A',
    notes: 'Book the leading hand',
    ...over,
  };
}

function insp(over: Partial<DueInspection> = {}): DueInspection {
  return {
    id: 'insp-1',
    status: 'draft',
    client_id: 'client-acme',
    crm_job_id: 'job-1',
    archived: false,
    due_on: '2026-08-20',
    template_snapshot: { name: 'Annual plant inspection' },
    ...over,
  };
}

function job(over: Partial<DueInspectionJob> = {}): DueInspectionJob {
  return {
    id: 'job-1',
    company_id: 'co-1',
    client_id: 'client-acme',
    title: 'Plant service',
    scheduled_date: '2026-08-20',
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

  it('labels the open sheet and recedes other items without inventing counts', () => {
    expect(complianceListDueLabel('2026-08-27')).toBe('Due 27 Aug 2026');
    expect(complianceListFloorLede(1)).toBe('1 item · tap one to open');
    expect(complianceListFloorLede(2)).toBe('2 items · tap one to open');
    expect(complianceListMetaLine({ client_name: 'Northside Electrical', standard_or_regulation: 'AS/NZS 3760' }))
      .toBe('Northside Electrical · AS/NZS 3760');
    const audit = complianceListAuditItems('co-1');
    expect(audit).toHaveLength(2);
    expect(audit[0].next_due_date).toBe('2026-08-27');
    expect(complianceListOpenHref(audit[0].id)).toBe('/compliance?id=audit-compliance-rcd');
    const decorated = decorateComplianceList(audit, now);
    const sheet = complianceListSheetItem(decorated);
    expect(sheet?.row.id).toBe('audit-compliance-rcd');
    expect(complianceListOtherItems(decorated, sheet?.row.id ?? null).map(item => item.row.id))
      .toEqual(['audit-compliance-warranty']);
    expect(complianceListOpened(decorated, 'audit-compliance-rcd')?.row.id).toBe('audit-compliance-rcd');
    expect(complianceListOpened(decorated, null)).toBeNull();
    expect(complianceListOpenHref('audit-compliance-rcd')).toBe('/compliance?id=audit-compliance-rcd');
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

describe('open-sheet same-client ledger (G2–G4)', () => {
  it('lists other due/open compliance for that client and excludes the open row (G2)', () => {
    const items = decorateComplianceList([
      row({ id: 'open', title: 'Open plant test', client_id: 'client-acme', next_due_date: '2026-08-01' }),
      row({ id: 'sib-due', title: 'Extinguisher service', client_id: 'client-acme', next_due_date: '2026-08-10' }),
      row({ id: 'sib-open', title: 'Warranty renewal', client_id: 'client-acme', next_due_date: '2026-12-01' }),
      row({ id: 'other-client', title: 'Other yard test', client_id: 'client-other', next_due_date: '2026-08-05' }),
      row({ id: 'done', title: 'Finished', client_id: 'client-acme', status: 'completed', next_due_date: '2026-08-01' }),
      row({ id: 'paused', title: 'On hold', client_id: 'client-acme', status: 'paused', next_due_date: '2026-08-01' }),
    ], now);
    const siblings = complianceSheetSiblingCompliance(items, {
      currentId: 'open',
      clientId: 'client-acme',
    }, now);
    expect(siblings.map(item => item.row.id)).toEqual(['sib-due', 'sib-open']);
    expect(siblings.every(item => item.row.id !== 'open')).toBe(true);
    expect(complianceSheetClientId({ client_id: 'client-acme' })).toBe('client-acme');
    expect(complianceSheetSiblingCompliance(items, { currentId: 'open', clientId: null }, now)).toEqual([]);
    expect(complianceSheetSiblingCompliance(items, { currentId: 'open', clientId: '' }, now)).toEqual([]);
    expect(complianceSheetClientLedgerEmpty(null)).toBe('No client on this item.');
    expect(complianceSheetClientLedgerEmpty('')).toBe('No client on this item.');
    expect(complianceSheetClientLedgerEmpty('client-acme')).toBe('Nothing else due or open for this client.');
  });

  it('lists booked or due inspections for that same client from the inspections table (G3)', () => {
    const inspections = [
      insp({ id: 'insp-due', due_on: '2026-08-01', template_snapshot: { name: 'Plant inspection' } }),
      insp({
        id: 'insp-job-only',
        client_id: null,
        crm_job_id: 'job-1',
        due_on: null,
        status: 'draft',
        template_snapshot: { name: 'Site check' },
      }),
      insp({
        id: 'insp-other',
        client_id: 'client-other',
        crm_job_id: 'job-other',
        template_snapshot: { name: 'Other yard' },
      }),
      insp({
        id: 'insp-done',
        status: 'issued',
        due_on: null,
        template_snapshot: { name: 'Issued report' },
      }),
      insp({
        id: 'insp-archived',
        archived: true,
        template_snapshot: { name: 'Archived' },
      }),
    ];
    const jobs = [
      job(),
      job({ id: 'job-other', client_id: 'client-other', title: 'Other yard' }),
    ];
    const siblings = complianceSheetSiblingInspections(inspections, jobs, { clientId: 'client-acme' }, now);
    expect(siblings.map(item => item.id)).toEqual(['insp-due', 'insp-job-only']);
    expect(siblings.every(item => item.kind === 'inspection')).toBe(true);
    expect(siblings.every(item => item.href.startsWith('/inspections/'))).toBe(true);
    expect(complianceSheetSiblingInspections(inspections, jobs, { clientId: null }, now)).toEqual([]);
    expect(complianceSheetSiblingInspections([], jobs, { clientId: 'client-acme' }, now)).toEqual([]);
  });

  it('taps existing open compliance sheet and existing inspection fill — no new routes (G4)', () => {
    const compliance = decorateComplianceList([
      row({ id: 'sib', title: 'Warranty renewal', client_id: 'client-acme', next_due_date: '2026-12-01' }),
    ], now);
    const inspections = complianceSheetSiblingInspections(
      [insp({ id: 'insp-1', template_snapshot: { name: 'Plant inspection' } })],
      [job()],
      { clientId: 'client-acme' },
      now,
    );
    const ledger = complianceSheetClientLedger({
      compliance: complianceSheetSiblingCompliance(compliance, { currentId: 'open', clientId: 'client-acme' }, now),
      inspections,
    });
    expect(ledger).toHaveLength(2);
    const complianceRow = ledger.find(item => item.kind === 'compliance');
    const inspectionRow = ledger.find(item => item.kind === 'inspection');
    expect(complianceRow?.href).toBe('/compliance?id=sib');
    expect(complianceRow?.href).toBe(complianceListOpenHref('sib'));
    expect(inspectionRow?.href).toBe('/inspections/insp-1');
    expect(inspectionRow?.href).toBe(complianceSheetInspectionHref('insp-1'));
    expect(complianceSheetInspectionHref('insp-1')).not.toContain('/compliance/client');
    expect(complianceSheetInspectionHref('insp-1')).not.toContain('/inspections/new');
    expect(complianceListOpenHref('sib')).not.toContain('/audit');
    expect(complianceListOpenHref('sib')).not.toContain('/clients/');
  });
});
