import { differenceInDays, format, parseISO } from 'date-fns';
import type { ComplianceItemWithClient, ComplianceStatus, RecurrenceUnit } from '../types/compliance';
import {
  inspectionTemplateName,
  isArchivedInspection,
  isOpenInspectionStatus,
  resolveInspectionClientId,
  resolveInspectionDueDate,
  todayYmd,
  VAN_TIME_ZONE,
  type DueInspection,
  type DueInspectionJob,
} from './inspectionDueReminder';

/** Default /compliance floor: due now plus still-open tracked items. */
export type ComplianceListFilter = 'action' | 'all' | ComplianceStatus;

export const COMPLIANCE_LIST_DEFAULT_FILTER: ComplianceListFilter = 'action';

export const COMPLIANCE_LIST_FILTERS: Array<{ key: ComplianceListFilter; label: string }> = [
  { key: 'action', label: 'Due or open' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'due_soon', label: 'Due Soon' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
  { key: 'paused', label: 'Paused' },
  { key: 'all', label: 'All' },
];

export type ComplianceListFloorBucket = 'due' | 'open' | 'done';

export type ComplianceListRow = {
  id: string;
  title: string;
  status: string;
  next_due_date: string;
  last_completed_date?: string | null;
  first_due_date?: string;
  standard_or_regulation?: string | null;
  client_id?: string | null;
  client_name?: string | null;
  description?: string | null;
  notes?: string | null;
};

/** Same-client ledger on the open compliance sheet — not a new hub. */
export type ComplianceSheetLedgerKind = 'compliance' | 'inspection';

export type ComplianceSheetLedgerRow = {
  kind: ComplianceSheetLedgerKind;
  id: string;
  title: string;
  dueLabel: string;
  href: string;
  sortDue: string;
};

export type ComplianceListFloorItem<T extends ComplianceListRow = ComplianceListRow> = {
  row: T;
  href: string;
  liveStatus: ComplianceStatus;
  bucket: ComplianceListFloorBucket;
};

/** Existing page — do not invent a compliance detail or audit route. */
export function complianceListOpenHref(id: string): string {
  return `/compliance?id=${encodeURIComponent(id)}`;
}

export function parseComplianceListOpenId(raw: string | null | undefined): string | null {
  const id = (raw ?? '').trim();
  return id || null;
}

export function parseComplianceListFilter(raw: string | null | undefined): ComplianceListFilter {
  if (
    raw === 'action'
    || raw === 'all'
    || raw === 'overdue'
    || raw === 'due_soon'
    || raw === 'upcoming'
    || raw === 'completed'
    || raw === 'paused'
  ) {
    return raw;
  }
  return COMPLIANCE_LIST_DEFAULT_FILTER;
}

export function computeNextDueDate(
  lastCompleted: string | null,
  firstDue: string,
  interval: number,
  unit: RecurrenceUnit,
): string {
  if (!lastCompleted) return firstDue;
  const base = parseISO(lastCompleted);
  let next: Date;
  switch (unit) {
    case 'days': next = new Date(base.getTime() + interval * 86400000); break;
    case 'weeks': next = new Date(base.getTime() + interval * 7 * 86400000); break;
    case 'months': next = new Date(base.getFullYear(), base.getMonth() + interval, base.getDate()); break;
    case 'years': next = new Date(base.getFullYear() + interval, base.getMonth(), base.getDate()); break;
    default: next = parseISO(firstDue);
  }
  return format(next, 'yyyy-MM-dd');
}

function ymd(value: string | Date | null | undefined): string {
  if (!value) return '';
  if (value instanceof Date) return format(value, 'yyyy-MM-dd');
  return value.slice(0, 10);
}

/**
 * Live status from the existing due date. Paused / completed stay as stored.
 * Date compare is yyyy-MM-dd so a stale stored `upcoming` still surfaces as overdue.
 */
export function deriveComplianceStatus(
  nextDueDate: string,
  _lastCompleted: string | null,
  isPaused: boolean,
  now = new Date(),
): ComplianceStatus {
  if (isPaused) return 'paused';
  const due = ymd(nextDueDate);
  const today = ymd(now);
  if (due && due < today) return 'overdue';
  if (!due) return 'upcoming';
  const diff = differenceInDays(parseISO(due), parseISO(today));
  if (diff <= 30) return 'due_soon';
  return 'upcoming';
}

export function complianceListLiveStatus(
  row: Pick<ComplianceListRow, 'status' | 'next_due_date' | 'last_completed_date'>,
  now = new Date(),
): ComplianceStatus {
  if (row.status === 'paused') return 'paused';
  if (row.status === 'completed') return 'completed';
  return deriveComplianceStatus(row.next_due_date, row.last_completed_date ?? null, false, now);
}

export function complianceListFloorBucket(
  row: Pick<ComplianceListRow, 'status' | 'next_due_date' | 'last_completed_date'>,
  now = new Date(),
): ComplianceListFloorBucket {
  const status = complianceListLiveStatus(row, now);
  if (status === 'overdue' || status === 'due_soon') return 'due';
  if (status === 'upcoming') return 'open';
  return 'done';
}

export function complianceMatchesListFilter(
  row: Pick<ComplianceListRow, 'status' | 'next_due_date' | 'last_completed_date'>,
  filter: ComplianceListFilter,
  now = new Date(),
): boolean {
  if (filter === 'all') return true;
  const status = complianceListLiveStatus(row, now);
  if (filter === 'action') {
    const bucket = complianceListFloorBucket(row, now);
    return bucket === 'due' || bucket === 'open';
  }
  return status === filter;
}

export function normalizeComplianceSearch(raw: string): string {
  return raw.trim().toLowerCase();
}

export function complianceListSearchBits(row: ComplianceListRow): string[] {
  return [
    row.title,
    row.standard_or_regulation,
    row.client_name,
    row.description,
    row.notes,
    row.next_due_date,
  ].filter((part): part is string => !!part && part.trim().length > 0);
}

export function complianceListSearchHaystack(row: ComplianceListRow): string {
  return complianceListSearchBits(row).join(' ').toLowerCase();
}

export function complianceMatchesSearch(row: ComplianceListRow, query: string): boolean {
  const needle = normalizeComplianceSearch(query);
  if (!needle) return true;
  return complianceListSearchHaystack(row).includes(needle);
}

export function decorateComplianceForList<T extends ComplianceListRow>(
  row: T,
  now = new Date(),
): ComplianceListFloorItem<T> {
  return {
    row,
    href: complianceListOpenHref(row.id),
    liveStatus: complianceListLiveStatus(row, now),
    bucket: complianceListFloorBucket(row, now),
  };
}

export function decorateComplianceList<T extends ComplianceListRow>(
  rows: T[],
  now = new Date(),
): ComplianceListFloorItem<T>[] {
  return rows.map(row => decorateComplianceForList(row, now));
}

export function filterComplianceListFloor<T extends ComplianceListRow>(
  items: ComplianceListFloorItem<T>[],
  args: { filter: ComplianceListFilter; search: string },
  now = new Date(),
): ComplianceListFloorItem<T>[] {
  return items.filter(item => (
    complianceMatchesListFilter(item.row, args.filter, now)
    && complianceMatchesSearch(item.row, args.search)
  ));
}

function floorRank(item: ComplianceListFloorItem): number {
  if (item.bucket === 'due' && item.liveStatus === 'overdue') return 0;
  if (item.bucket === 'due') return 1;
  if (item.bucket === 'open') return 2;
  if (item.liveStatus === 'completed') return 3;
  return 4;
}

/** Most overdue first, then due soon, then other open, then closed. */
export function sortComplianceListFloor<T extends ComplianceListRow>(
  items: ComplianceListFloorItem<T>[],
): ComplianceListFloorItem<T>[] {
  return [...items].sort((a, b) => {
    const rank = floorRank(a) - floorRank(b);
    if (rank !== 0) return rank;
    const due = (a.row.next_due_date ?? '').localeCompare(b.row.next_due_date ?? '');
    if (due !== 0) return due;
    return a.row.title.localeCompare(b.row.title);
  });
}

export function complianceListEmptyTitle(args: {
  filter: ComplianceListFilter;
  noneAtAll: boolean;
}): string {
  if (args.noneAtAll) return 'No compliance items yet';
  if (args.filter === 'action') return 'Nothing due or open';
  return 'No matching compliance items';
}

export function complianceListEmptyMessage(args: {
  filter: ComplianceListFilter;
  noneAtAll: boolean;
}): string {
  if (args.noneAtAll) {
    return 'Track recurring compliance requirements like safety inspections, warranty renewals, and scheduled maintenance. Get reminders before they\'re due and email clients to book.';
  }
  if (args.filter === 'action') {
    return 'Completed and paused items sit under All. This list is the due or open floor.';
  }
  return 'Try another status or search.';
}

export function complianceListDueLabel(nextDueDate: string): string {
  return `Due ${format(parseISO(nextDueDate), 'd MMM yyyy')}`;
}

export function complianceListFloorLede(count: number): string {
  const noun = count === 1 ? 'item' : 'items';
  return `${count} ${noun} · tap one to open`;
}

/** Lead due-or-open item on the floor — one cream sheet, not a tile grid. */
export function complianceListSheetItem<T>(items: T[]): T | null {
  return items[0] ?? null;
}

/** Open record on `/compliance?id=` — the document sheet, same path. */
export function complianceListOpened<T extends { row: { id: string } }>(
  items: T[],
  openId: string | null,
): T | null {
  if (!openId) return null;
  return items.find(item => item.row.id === openId) ?? null;
}

export function complianceListOtherItems<T extends { row: { id: string } }>(
  items: T[],
  sheetId: string | null,
): T[] {
  if (!sheetId) return items.slice(1);
  return items.filter(item => item.row.id !== sheetId);
}

export function complianceListMetaLine(row: Pick<ComplianceListRow, 'client_name' | 'standard_or_regulation'>): string {
  return [row.client_name, row.standard_or_regulation].filter(Boolean).join(' · ');
}

/** Client on this compliance row — the customer (Acme Plants), not the Grafter tenant. */
export function complianceSheetClientId(row: { client_id?: string | null } | null | undefined): string | null {
  const id = (row?.client_id ?? '').trim();
  return id || null;
}

export function complianceSheetClientLedgerEmpty(clientId: string | null | undefined): string {
  if (!complianceSheetClientId({ client_id: clientId ?? null })) {
    return 'No client on this item.';
  }
  return 'Nothing else due or open for this client.';
}

/** Existing fill / open sheet — do not invent an inspection route. */
export function complianceSheetInspectionHref(id: string): string {
  return `/inspections/${encodeURIComponent(id)}`;
}

function ledgerDueRank(due: string): number {
  return due ? 0 : 1;
}

function sortComplianceSheetLedger(rows: ComplianceSheetLedgerRow[]): ComplianceSheetLedgerRow[] {
  return [...rows].sort((a, b) => {
    const rank = ledgerDueRank(a.sortDue) - ledgerDueRank(b.sortDue);
    if (rank !== 0) return rank;
    const due = (a.sortDue || '9999-99-99').localeCompare(b.sortDue || '9999-99-99');
    if (due !== 0) return due;
    const kind = a.kind.localeCompare(b.kind);
    if (kind !== 0) return kind;
    return a.title.localeCompare(b.title);
  });
}

/**
 * Other due/open compliance items for this client. Excludes the open row.
 * Honest empty when there is no client_id.
 */
export function complianceSheetSiblingCompliance<T extends {
  row: ComplianceListRow & { id: string; client_id?: string | null };
}>(
  items: T[],
  args: { currentId: string; clientId: string | null | undefined },
  now = new Date(),
): T[] {
  const clientId = complianceSheetClientId({ client_id: args.clientId ?? null });
  if (!clientId) return [];
  return items
    .filter(item => (
      item.row.id !== args.currentId
      && complianceSheetClientId(item.row) === clientId
      && complianceMatchesListFilter(item.row, 'action', now)
    ))
    .sort((a, b) => {
      const due = (a.row.next_due_date ?? '').localeCompare(b.row.next_due_date ?? '');
      if (due !== 0) return due;
      return a.row.title.localeCompare(b.row.title);
    });
}

function complianceSheetInspectionTitle(
  inspection: DueInspection,
  job?: DueInspectionJob | null,
): string {
  const named = inspectionTemplateName(inspection.template_snapshot);
  if (named && named !== 'Inspection') return named;
  const site = (inspection.meta?.siteName ?? '').trim();
  if (site) return site;
  const jobTitle = (job?.title ?? '').trim();
  if (jobTitle) return jobTitle;
  return named || 'Inspection';
}

function complianceSheetInspectionBookedOrDue(
  inspection: DueInspection,
  job: DueInspectionJob | null | undefined,
  now = new Date(),
): { due: string | null; include: boolean } {
  if (isArchivedInspection(inspection)) return { due: null, include: false };
  const due = resolveInspectionDueDate(inspection, job) || ymd(inspection.due_on) || null;
  const booked = isOpenInspectionStatus(inspection.status);
  const dueOn = due ?? '';
  const today = todayYmd(now, VAN_TIME_ZONE);
  const isDue = !!dueOn && dueOn <= today;
  return { due, include: booked || isDue };
}

/**
 * Booked or due inspections for this same client (inspections table + job.client_id).
 * Honest empty when there is no client_id.
 */
export function complianceSheetSiblingInspections(
  inspections: DueInspection[] | null | undefined,
  jobs: DueInspectionJob[] | null | undefined,
  args: { clientId: string | null | undefined },
  now = new Date(),
): ComplianceSheetLedgerRow[] {
  const clientId = complianceSheetClientId({ client_id: args.clientId ?? null });
  if (!clientId) return [];
  const jobMap = new Map((jobs ?? []).map(job => [job.id, job]));
  const rows: ComplianceSheetLedgerRow[] = [];
  for (const inspection of inspections ?? []) {
    const job = inspection.crm_job_id ? jobMap.get(inspection.crm_job_id) ?? null : null;
    if (resolveInspectionClientId(inspection, job) !== clientId) continue;
    const { due, include } = complianceSheetInspectionBookedOrDue(inspection, job, now);
    if (!include) continue;
    rows.push({
      kind: 'inspection',
      id: inspection.id,
      title: complianceSheetInspectionTitle(inspection, job),
      dueLabel: due ? complianceListDueLabel(due) : 'Open',
      href: complianceSheetInspectionHref(inspection.id),
      sortDue: due ?? '',
    });
  }
  return sortComplianceSheetLedger(rows);
}

export function complianceSheetClientLedger(args: {
  compliance: Array<{ row: ComplianceListRow; href: string }>;
  inspections: ComplianceSheetLedgerRow[];
}): ComplianceSheetLedgerRow[] {
  const complianceRows: ComplianceSheetLedgerRow[] = args.compliance.map(item => ({
    kind: 'compliance',
    id: item.row.id,
    title: item.row.title,
    dueLabel: complianceListDueLabel(item.row.next_due_date),
    href: item.href,
    sortDue: item.row.next_due_date ?? '',
  }));
  return sortComplianceSheetLedger([...complianceRows, ...args.inspections]);
}

/** DEV field-audit floor only. Live companies keep reading `compliance_items`. */
export function complianceListAuditItems(companyId: string): ComplianceItemWithClient[] {
  return [
    {
      id: 'audit-compliance-rcd',
      company_id: companyId,
      client_id: 'audit-doc-client',
      title: 'Annual RCD test',
      description: 'Switchboard test at the plant.',
      standard_or_regulation: 'AS/NZS 3760',
      recurrence_interval: 12,
      recurrence_unit: 'months',
      first_due_date: '2025-08-27',
      last_completed_date: '2025-08-27',
      next_due_date: '2026-08-27',
      reminder_days_before: 30,
      reminder_sent_at: null,
      status: 'upcoming',
      linked_job_id: null,
      notes: null,
      created_at: '2026-08-24T00:00:00.000Z',
      updated_at: '2026-08-24T00:00:00.000Z',
      client_name: 'Northside Electrical',
      client_email: 'accounts@northside.example',
      client_phone: '0400 111 222',
    },
    {
      id: 'audit-compliance-warranty',
      company_id: companyId,
      client_id: 'audit-doc-client',
      title: 'Switchboard warranty',
      description: 'Manufacturer warranty on the main board.',
      standard_or_regulation: null,
      recurrence_interval: 12,
      recurrence_unit: 'months',
      first_due_date: '2026-11-01',
      last_completed_date: null,
      next_due_date: '2026-11-01',
      reminder_days_before: 30,
      reminder_sent_at: null,
      status: 'upcoming',
      linked_job_id: null,
      notes: null,
      created_at: '2026-08-24T00:00:00.000Z',
      updated_at: '2026-08-24T00:00:00.000Z',
      client_name: 'Northside Electrical',
      client_email: 'accounts@northside.example',
      client_phone: '0400 111 222',
    },
  ];
}
