import { format, parseISO } from 'date-fns';
import {
  jhaListBucket,
  jhaListContext,
  recommendJhaListAction,
  type JhaActionKey,
  type JhaListBucket,
  type RecommendedJhaAction,
} from './jhaNextAction';
import { applyLivingJobToJha, type LivingMember } from './livingJha';
import { parseCrewSignOns, type JhaCrewMember } from '../types/jha';

/** Default /jha floor: drafts and ready JHAs that still need work. */
export type JhaListFilter = 'open' | 'all' | 'draft' | 'completed' | 'published';

export type JhaListRow = {
  id: string;
  status: string;
  report_number?: string | null;
  meta?: Record<string, string | undefined> | null;
  doc_version?: number | null;
  amendment_reason?: string | null;
  amended_from_id?: string | null;
  client_id?: string | null;
  job_id?: string | null;
  created_at: string;
  completed_at?: string | null;
  template_snapshot?: { name?: string } | null;
  client_name?: string | null;
  job_title?: string | null;
  job_address?: string | null;
  job_assigned_team?: string[] | null;
  job_number?: number | null;
  job_scheduled_date?: string | null;
};

export type JhaListFloorItem<T extends JhaListRow = JhaListRow> = {
  row: T;
  href: string;
  bucket: JhaListBucket;
  title: string;
  jobNumberLabel: string | null;
  crewProgress: string | null;
  permitLabel: string | null;
  supervisorLabel: string | null;
  sitePack: string | null;
  next: RecommendedJhaAction;
  crew: JhaCrewMember[];
  livingSite: string;
};

/** Existing fill route — do not invent another JHA destination. */
export function jhaDocumentHref(id: string): string {
  return `/jha/new?docId=${id}`;
}

export function parseJhaListFilter(raw: string | null | undefined): JhaListFilter {
  if (raw === 'all' || raw === 'draft' || raw === 'completed' || raw === 'published' || raw === 'open') {
    return raw;
  }
  return 'open';
}

export function padJhaListJobNumber(n: number | null | undefined): string | null {
  if (n == null) return null;
  return String(n).padStart(4, '0');
}

export function jhaListJobNumberLabel(n: number | null | undefined): string | null {
  const padded = padJhaListJobNumber(n);
  return padded ? `#${padded}` : null;
}

export function normalizeJhaSearch(raw: string): string {
  return raw.replace(/^#+/, '').trim().toLowerCase();
}

export function jhaListCrewProgress(
  crew: Array<{ name?: string | null; signature?: string | null }>,
): { named: number; signed: number; label: string | null } {
  const named = crew.filter(person => !!(person.name ?? '').trim());
  const signed = named.filter(person => !!(person.signature ?? '').trim());
  if (named.length === 0) return { named: 0, signed: 0, label: null };
  if (signed.length === named.length) {
    return { named: named.length, signed: signed.length, label: `${signed.length} signed` };
  }
  return {
    named: named.length,
    signed: signed.length,
    label: `${signed.length} of ${named.length} signed`,
  };
}

function pushBit(bits: string[], value: string | null | undefined) {
  const trimmed = (value ?? '').trim();
  if (trimmed) bits.push(trimmed);
}

export function jhaListSearchBits(row: JhaListRow): string[] {
  const bits: string[] = [];
  const meta = row.meta ?? {};
  pushBit(bits, row.report_number);
  pushBit(bits, row.template_snapshot?.name);
  pushBit(bits, meta.taskName);
  pushBit(bits, meta.siteName);
  pushBit(bits, meta.documentTitle);
  pushBit(bits, meta.supervisor);
  pushBit(bits, meta.permitRefs);
  pushBit(bits, meta.plantArea);
  pushBit(bits, meta.shift);
  pushBit(bits, meta.siteContact);
  pushBit(bits, meta.clientName);
  pushBit(bits, row.client_name);
  pushBit(bits, row.job_title);
  pushBit(bits, row.job_address);
  pushBit(bits, row.amendment_reason);
  const crew = parseCrewSignOns(meta.crewSignOns);
  for (const person of crew) pushBit(bits, person.name);

  const padded = padJhaListJobNumber(row.job_number);
  if (row.job_number != null) {
    bits.push(String(row.job_number));
    if (padded) bits.push(padded, `#${padded}`);
  }
  return bits;
}

export function jhaListSearchHaystack(row: JhaListRow): string {
  return jhaListSearchBits(row).join(' ').toLowerCase();
}

export function jhaMatchesSearch(row: JhaListRow, query: string): boolean {
  const needle = normalizeJhaSearch(query);
  if (!needle) return true;
  return jhaListSearchHaystack(row).includes(needle);
}

export function jhaMatchesListFilter(status: string, filter: JhaListFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'open') return jhaListBucket(status) === 'open';
  return status === filter;
}

export function decorateJhaForList<T extends JhaListRow>(
  row: T,
  members: LivingMember[] = [],
): JhaListFloorItem<T> {
  const livingJob = row.job_id
    ? {
        id: row.job_id,
        title: row.job_title,
        address: row.job_address,
        assigned_team: row.job_assigned_team,
      }
    : null;
  const living = applyLivingJobToJha(row.meta, livingJob, members);
  const next = recommendJhaListAction(jhaListContext({
    ...row,
    meta: living.meta,
    livingSite: living.siteName,
    livingCrew: living.crew,
  }));
  const meta = row.meta ?? {};
  const permit = (meta.permitRefs ?? '').trim();
  const supervisor = (living.meta.supervisor || meta.supervisor || '').trim();
  const sitePack = [meta.plantArea, meta.shift].map(part => (part ?? '').trim()).filter(Boolean).join(' · ');

  return {
    row,
    href: jhaDocumentHref(row.id),
    bucket: jhaListBucket(row.status),
    title: (meta.documentTitle || meta.taskName || row.template_snapshot?.name || 'JHA').trim(),
    jobNumberLabel: jhaListJobNumberLabel(row.job_number),
    crewProgress: jhaListCrewProgress(living.crew).label,
    permitLabel: permit ? `Permit ${permit}` : null,
    supervisorLabel: supervisor || null,
    sitePack: sitePack || null,
    next,
    crew: living.crew,
    livingSite: living.siteName,
  };
}

export function decorateJhaList<T extends JhaListRow>(
  rows: T[],
  members: LivingMember[] = [],
): JhaListFloorItem<T>[] {
  return rows.map(row => decorateJhaForList(row, members));
}

export function filterJhaListFloor<T extends JhaListRow>(
  items: JhaListFloorItem<T>[],
  args: { filter: JhaListFilter; search: string },
): JhaListFloorItem<T>[] {
  return items.filter(item => (
    jhaMatchesListFilter(item.row.status, args.filter)
    && jhaMatchesSearch(item.row, args.search)
  ));
}

function openActionRank(key: JhaActionKey): number {
  if (key === 'site') return 0;
  if (key === 'crew') return 1;
  if (key === 'sign') return 2;
  if (key === 'publish') return 3;
  return 4;
}

function activityStamp(row: JhaListRow): string {
  return row.completed_at || row.created_at || '';
}

function scheduledDay(value: string | null | undefined): string {
  return (value ?? '').trim().slice(0, 10);
}

/**
 * Open floor: missing site/crew/sign first, then the job’s scheduled day,
 * then newest activity. Published: newest first.
 */
export function sortJhaListFloor<T extends JhaListRow>(
  items: JhaListFloorItem<T>[],
): JhaListFloorItem<T>[] {
  return [...items].sort((a, b) => {
    if (a.bucket !== b.bucket) return a.bucket === 'open' ? -1 : 1;
    if (a.bucket === 'open') {
      const action = openActionRank(a.next.key) - openActionRank(b.next.key);
      if (action !== 0) return action;
      const da = scheduledDay(a.row.job_scheduled_date);
      const db = scheduledDay(b.row.job_scheduled_date);
      if (da && db && da !== db) return da.localeCompare(db);
      if (da && !db) return -1;
      if (!da && db) return 1;
    }
    return activityStamp(b.row).localeCompare(activityStamp(a.row));
  });
}

export function groupJhaListFloor<T extends JhaListRow>(
  items: JhaListFloorItem<T>[],
): { open: JhaListFloorItem<T>[]; published: JhaListFloorItem<T>[] } {
  return {
    open: items.filter(item => item.bucket === 'open'),
    published: items.filter(item => item.bucket === 'published'),
  };
}

export function jhaListGroupTitle(filter: JhaListFilter, bucket: JhaListBucket = 'open'): string {
  if (filter === 'draft') return 'Draft';
  if (filter === 'completed') return 'Ready';
  if (filter === 'published' || bucket === 'published') return 'Published';
  return 'Open';
}

export function jhaListEmptyTitle(args: { filter: JhaListFilter; noneAtAll: boolean }): string {
  if (args.noneAtAll) return 'No JHA documents yet';
  if (args.filter === 'open') return 'Nothing open';
  return 'No matching JHAs';
}

export function jhaListEmptyMessage(args: { filter: JhaListFilter; noneAtAll: boolean }): string {
  if (args.noneAtAll) {
    return 'Open a job and tap Start JHA. That is how a leading hand starts one on site — this list is for opening and finishing them.';
  }
  if (args.filter === 'open') {
    return 'Published JHAs sit under All. This list is the open floor — drafts and ready documents that still need work.';
  }
  return 'Try another status or search.';
}

export function formatJhaListDate(iso: string | null | undefined): string | null {
  const raw = iso?.trim();
  if (!raw) return null;
  const parsed = parseISO(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, 'd MMM yyyy');
}
