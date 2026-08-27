import { format } from 'date-fns';
import {
  dateOnly,
  isOpenInspectionStatus,
  resolveInspectionDueDate,
  todayYmd,
  type DueInspection,
  type DueInspectionJob,
} from './inspectionDueReminder';
import { inspectionOpenPath } from './inspectionNextAction';

/** Default Field Work list: what the sparkie can open now. */
export type InspectionListFilter = 'action' | 'all' | 'draft' | 'completed' | 'issued';

export type InspectionListFloorBucket = 'due' | 'open' | 'done';

export type InspectionListDueKind = 'overdue' | 'today' | 'upcoming';

export type InspectionListRow = {
  id: string;
  status: string;
  archived?: boolean | null;
  meta?: Record<string, string | null> | null;
  responses?: Record<string, unknown> | null;
  template_snapshot?: DueInspection['template_snapshot'];
  crm_job_id?: string | null;
  due_on?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  inspector_name?: string | null;
  job_title?: string | null;
  job_address?: string | null;
  job_number?: number | null;
  job_company_id?: string | null;
  job_client_id?: string | null;
  job_client_name?: string | null;
  job_scheduled_date?: string | null;
};

export type InspectionListFloorItem<T extends InspectionListRow = InspectionListRow> = {
  row: T;
  dueOn: string | null;
  dueKind: InspectionListDueKind | null;
  bucket: InspectionListFloorBucket;
  href: string;
  dueLabel: string | null;
};

export function padInspectionListJobNumber(n: number | null | undefined): string | null {
  if (n == null) return null;
  return String(n).padStart(4, '0');
}

export function inspectionListJob(row: InspectionListRow): DueInspectionJob | null {
  if (!row.crm_job_id) return null;
  return {
    id: row.crm_job_id,
    company_id: row.job_company_id ?? '',
    client_id: row.job_client_id ?? null,
    title: row.job_title ?? null,
    scheduled_date: row.job_scheduled_date ?? null,
    address: row.job_address ?? null,
    job_number: row.job_number ?? null,
  };
}

/**
 * Existing due date only — resolver first, then the projected `due_on` column.
 * Does not invent an interval.
 */
export function inspectionListDueOn(
  row: InspectionListRow,
  now = new Date(),
): string | null {
  void now;
  const resolved = resolveInspectionDueDate(row, inspectionListJob(row));
  return resolved ?? dateOnly(row.due_on);
}

export function inspectionListDueKind(
  dueOn: string | null | undefined,
  now = new Date(),
): InspectionListDueKind | null {
  const day = dateOnly(dueOn);
  if (!day) return null;
  const today = todayYmd(now);
  if (day < today) return 'overdue';
  if (day === today) return 'today';
  return 'upcoming';
}

/** Due today or overdue is the floor. Upcoming stays with Done / All. */
export function inspectionListFloorBucket(
  row: InspectionListRow,
  now = new Date(),
): InspectionListFloorBucket {
  const dueOn = inspectionListDueOn(row, now);
  const kind = inspectionListDueKind(dueOn, now);
  if (kind === 'overdue' || kind === 'today') return 'due';
  if (isOpenInspectionStatus(row.status)) return 'open';
  return 'done';
}

/** Tap a list row — existing fill route, not a new report type. */
export function inspectionListOpenHref(id: string): string {
  return inspectionOpenPath(id, 'open');
}

export function formatInspectionListDate(ymd: string | null | undefined): string | null {
  const day = dateOnly(ymd);
  if (!day) return null;
  const [y, m, d] = day.split('-').map(Number);
  return format(new Date(y, m - 1, d), 'd MMM yyyy');
}

export function inspectionListDueLabel(
  dueOn: string | null | undefined,
  now = new Date(),
): string | null {
  const kind = inspectionListDueKind(dueOn, now);
  if (!kind) return null;
  if (kind === 'today') return 'Due today';
  const when = formatInspectionListDate(dueOn);
  if (!when) return null;
  if (kind === 'overdue') return `Overdue · ${when}`;
  return `Due ${when}`;
}

export function decorateInspectionForList<T extends InspectionListRow>(
  row: T,
  now = new Date(),
): InspectionListFloorItem<T> {
  const dueOn = inspectionListDueOn(row, now);
  return {
    row,
    dueOn,
    dueKind: inspectionListDueKind(dueOn, now),
    bucket: inspectionListFloorBucket(row, now),
    href: inspectionListOpenHref(row.id),
    dueLabel: inspectionListDueLabel(dueOn, now),
  };
}

export function decorateInspectionList<T extends InspectionListRow>(
  rows: T[],
  now = new Date(),
): InspectionListFloorItem<T>[] {
  return rows.map(row => decorateInspectionForList(row, now));
}

export function normalizeInspectionSearch(raw: string): string {
  return raw.replace(/^#+/, '').trim().toLowerCase();
}

export function inspectionListSearchBits(row: InspectionListRow): string[] {
  const bits: string[] = [];
  const push = (value: string | null | undefined) => {
    const trimmed = (value ?? '').trim();
    if (trimmed) bits.push(trimmed);
  };
  push(row.meta?.siteName);
  push(row.meta?.siteAddress);
  push(row.meta?.clientName);
  push(row.meta?.jobNumber);
  push((row.template_snapshot as { name?: string } | null)?.name);
  push(row.inspector_name);
  push(row.job_title);
  push(row.job_address);
  push(row.job_client_name);
  const padded = padInspectionListJobNumber(row.job_number);
  if (row.job_number != null) {
    bits.push(String(row.job_number));
    if (padded) bits.push(padded, `#${padded}`);
  }
  const dueOn = inspectionListDueOn(row);
  push(dueOn);
  push(formatInspectionListDate(dueOn));
  return bits;
}

export function inspectionListSearchHaystack(row: InspectionListRow): string {
  return inspectionListSearchBits(row).join(' ').toLowerCase();
}

export function inspectionMatchesSearch(row: InspectionListRow, query: string): boolean {
  const needle = normalizeInspectionSearch(query);
  if (!needle) return true;
  return inspectionListSearchHaystack(row).includes(needle);
}

export function inspectionMatchesListFilter(
  item: InspectionListFloorItem,
  filter: InspectionListFilter,
): boolean {
  if (filter === 'action') return item.bucket === 'due' || item.bucket === 'open';
  if (filter === 'all') return true;
  return item.row.status === filter;
}

export function filterInspectionListFloor<T extends InspectionListRow>(
  items: InspectionListFloorItem<T>[],
  args: { filter: InspectionListFilter; search: string },
): InspectionListFloorItem<T>[] {
  return items.filter(item => (
    inspectionMatchesListFilter(item, args.filter)
    && inspectionMatchesSearch(item.row, args.search)
  ));
}

function floorRank(item: InspectionListFloorItem): number {
  if (item.bucket === 'due' && item.dueKind === 'overdue') return 0;
  if (item.bucket === 'due') return 1;
  if (item.bucket === 'open') return 2;
  return 3;
}

function activityStamp(row: InspectionListRow): string {
  return row.completed_at || row.started_at || '';
}

/** Most overdue first, then due today, then other open, then closed. */
export function sortInspectionListFloor<T extends InspectionListRow>(
  items: InspectionListFloorItem<T>[],
): InspectionListFloorItem<T>[] {
  return [...items].sort((a, b) => {
    const rank = floorRank(a) - floorRank(b);
    if (rank !== 0) return rank;
    if (a.bucket === 'due') {
      const due = (a.dueOn ?? '').localeCompare(b.dueOn ?? '');
      if (due !== 0) return due;
    }
    if (a.bucket === 'open') {
      const da = a.row.job_scheduled_date ?? '';
      const db = b.row.job_scheduled_date ?? '';
      if (da && db && da !== db) return da.localeCompare(db);
      if (da && !db) return -1;
      if (!da && db) return 1;
    }
    const stamp = activityStamp(b.row).localeCompare(activityStamp(a.row));
    if (stamp !== 0) return stamp;
    return (b.row.job_number ?? 0) - (a.row.job_number ?? 0);
  });
}

export function groupInspectionListFloor<T extends InspectionListRow>(
  items: InspectionListFloorItem<T>[],
): {
  due: InspectionListFloorItem<T>[];
  open: InspectionListFloorItem<T>[];
  done: InspectionListFloorItem<T>[];
} {
  return {
    due: items.filter(item => item.bucket === 'due'),
    open: items.filter(item => item.bucket === 'open'),
    done: items.filter(item => item.bucket === 'done'),
  };
}

export function inspectionListEmptyTitle(args: {
  filter: InspectionListFilter;
  archived: boolean;
  noneAtAll: boolean;
}): string {
  if (args.archived) return args.noneAtAll ? 'No archived inspections' : 'No matching inspections';
  if (args.noneAtAll) return 'No inspections yet';
  if (args.filter === 'action') return 'Nothing open or due';
  return 'No matching inspections';
}

export function inspectionListEmptyMessage(args: {
  filter: InspectionListFilter;
  archived: boolean;
  noneAtAll: boolean;
}): string {
  if (args.archived) {
    return args.noneAtAll
      ? 'Archived inspections will show up here.'
      : 'Try another status or search.';
  }
  if (args.noneAtAll) {
    return 'Open a job and tap Start inspection. That is how a leading hand starts one on site — this list is for opening and finishing them.';
  }
  if (args.filter === 'action') {
    return 'Ready and issued tests sit under All inspections. This list is the open or due floor.';
  }
  return 'Try another status or search.';
}
