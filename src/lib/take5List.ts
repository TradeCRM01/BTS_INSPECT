import { padJobNumber } from './jobRef';
import {
  take5FillPath,
  take5ListBucket,
  take5ListContext,
  type Take5ListBucket,
} from './take5NextAction';

/** Floor filter for /jha/take5 with no id — open drafts first. */
export type Take5ListFilter = Take5ListBucket | 'all';

export const TAKE5_LIST_DEFAULT_FILTER: Take5ListFilter = 'open';

export const TAKE5_LIST_FILTERS: Array<{ value: Take5ListFilter; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
  { value: 'all', label: 'All Take 5s' },
];

export type Take5ListItem = {
  id: string;
  status: string;
  go_no_go: string;
  created_at: string;
  signed_at?: string | null;
  signed_name?: string | null;
  signature?: string | null;
  stop_think?: string | null;
  identify_hazards?: string | null;
  control_actions?: string | null;
  jha_document_id: string;
  meta?: Record<string, string> | null;
  parent_report?: string | null;
  parent_site?: string | null;
  parent_task?: string | null;
  job_id?: string | null;
  job_title?: string | null;
  job_address?: string | null;
  job_number?: number | null;
  livingSite?: string | null;
  livingCrew?: string | null;
};

export type Take5ListEmptyKind = 'none' | 'none-open' | 'none-done' | 'none-match';

/** Simpro-style #0042 from the existing jobs.job_number. */
export function take5ListJobRef(jobNumber: number | null | undefined): string | null {
  if (jobNumber == null || !Number.isFinite(jobNumber)) return null;
  return `#${padJobNumber(jobNumber)}`;
}

export function take5ListGoStop(goNoGo: string | null | undefined): 'GO' | 'STOP' {
  return goNoGo === 'stop' ? 'STOP' : 'GO';
}

/** Existing ops status tokens — STOP is the workface hold. */
export function take5ListGoStopClass(goNoGo: string | null | undefined): string {
  return take5ListGoStop(goNoGo) === 'STOP' ? 'ops-status-bad' : 'ops-status-ok';
}

export function take5ListMatchesFilter(status: string, filter: Take5ListFilter): boolean {
  if (filter === 'all') return true;
  return take5ListBucket(status) === filter;
}

export function take5ListNormalizeQuery(raw: string): string {
  return raw.trim().toLowerCase().replace(/^#+/, '');
}

export function take5ListSearchText(item: Take5ListItem): string {
  const jobRef = take5ListJobRef(item.job_number);
  const jobNum = item.job_number != null ? String(item.job_number) : '';
  const padded = item.job_number != null ? padJobNumber(item.job_number) : '';
  return [
    jobRef,
    jobNum,
    padded,
    item.job_title,
    item.job_address,
    item.livingSite,
    item.livingCrew,
    item.parent_report,
    item.parent_site,
    item.parent_task,
    item.meta?.location,
    item.signed_name,
    take5ListGoStop(item.go_no_go),
    item.identify_hazards,
    item.stop_think,
    item.control_actions,
  ].filter(Boolean).join(' ').toLowerCase();
}

export function take5ListMatchesQuery(item: Take5ListItem, raw: string): boolean {
  const needle = take5ListNormalizeQuery(raw);
  if (!needle) return true;
  return take5ListSearchText(item).includes(needle);
}

/** 0 = missing site … 4 = completed. Sparkie finishes the thin ones first. */
export function take5ListActionRank(item: Take5ListItem): number {
  if (take5ListBucket(item.status) === 'done') return 4;
  const ctx = take5ListContext(item);
  if (!ctx.hasSite) return 0;
  if (!ctx.checksReady) return 1;
  if (!ctx.signed) return 2;
  return 3;
}

export function compareTake5ListItems(a: Take5ListItem, b: Take5ListItem): number {
  const stopA = take5ListGoStop(a.go_no_go) === 'STOP' ? 0 : 1;
  const stopB = take5ListGoStop(b.go_no_go) === 'STOP' ? 0 : 1;
  if (stopA !== stopB) return stopA - stopB;

  const openA = take5ListBucket(a.status) === 'open' ? 0 : 1;
  const openB = take5ListBucket(b.status) === 'open' ? 0 : 1;
  if (openA !== openB) return openA - openB;

  const rank = take5ListActionRank(a) - take5ListActionRank(b);
  if (rank !== 0) return rank;

  const siteA = (a.livingSite || a.job_address || a.parent_site || a.job_title || '').trim();
  const siteB = (b.livingSite || b.job_address || b.parent_site || b.job_title || '').trim();
  const site = siteA.localeCompare(siteB, 'en', { sensitivity: 'base' });
  if (site !== 0) return site;

  return (b.created_at || '').localeCompare(a.created_at || '');
}

export function take5ListVisibleItems(
  items: Take5ListItem[],
  opts: { filter: Take5ListFilter; query?: string },
): Take5ListItem[] {
  return items
    .filter(item => take5ListMatchesFilter(item.status, opts.filter))
    .filter(item => take5ListMatchesQuery(item, opts.query ?? ''))
    .slice()
    .sort(compareTake5ListItems);
}

export function take5ListGroups(items: Take5ListItem[]): {
  open: Take5ListItem[];
  done: Take5ListItem[];
} {
  return {
    open: items.filter(item => take5ListBucket(item.status) === 'open'),
    done: items.filter(item => take5ListBucket(item.status) === 'done'),
  };
}

export function take5ListEmptyKind(input: {
  total: number;
  visible: number;
  filter: Take5ListFilter;
  query: string;
}): Take5ListEmptyKind | null {
  if (input.total === 0) return 'none';
  if (input.visible > 0) return null;
  if (take5ListNormalizeQuery(input.query)) return 'none-match';
  if (input.filter === 'open') return 'none-open';
  if (input.filter === 'done') return 'none-done';
  return 'none-match';
}

/** Existing fill — parent JHA + Take 5 id. */
export function take5ListOpenHref(item: Pick<Take5ListItem, 'jha_document_id' | 'id'>): string {
  return take5FillPath(item.jha_document_id, item.id);
}

/** Card title: job # first so a leading hand finds the job, then JHA report. */
export function take5ListCardId(item: Pick<Take5ListItem, 'job_number' | 'parent_report'>): string {
  return take5ListJobRef(item.job_number) || (item.parent_report ?? '').trim() || 'Draft';
}

export function take5ListHeadMeta(
  item: Pick<Take5ListItem, 'job_number' | 'parent_report'>,
  when: string,
): string {
  const jobRef = take5ListJobRef(item.job_number);
  const report = (item.parent_report ?? '').trim();
  if (jobRef && report) return `${when} · ${report}`;
  return when;
}

export function take5ListCardLine(item: Take5ListItem): string {
  const crew = (item.livingCrew ?? '').trim();
  const signed = (item.signed_name ?? '').trim();
  const who = crew || signed;
  return [
    item.parent_task || item.job_title,
    who,
    take5ListGoStop(item.go_no_go),
  ].filter(Boolean).join(' · ');
}

export function take5ListHazardLine(item: Take5ListItem): string {
  return (item.identify_hazards ?? '').trim()
    || (item.stop_think ?? '').trim()
    || (item.control_actions ?? '').trim();
}
