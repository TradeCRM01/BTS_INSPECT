export const HUB_LIST_PHONE_MAX = 639;

export type HubListKind = 'jobs' | 'quotes' | 'invoices';

export type HubListCell =
  | 'identity'
  | 'when'
  | 'status'
  | 'next'
  | 'ref'
  | 'customer'
  | 'job'
  | 'date'
  | 'total';

const JOBS_AREAS: Record<Extract<HubListCell, 'identity' | 'when' | 'status' | 'next'>, string> = {
  identity: 'identity',
  when: 'when',
  status: 'status',
  next: 'next',
};

const DOC_AREAS: Record<Extract<HubListCell, 'ref' | 'customer' | 'job' | 'date' | 'status' | 'total' | 'next'>, string> = {
  ref: 'ref',
  customer: 'cust',
  job: 'job',
  date: 'date',
  status: 'status',
  total: 'total',
  next: 'next',
};

export function hubListAreas(kind: HubListKind, width: number): Record<string, string> {
  void width;
  if (kind === 'jobs') return { ...JOBS_AREAS };
  return { ...DOC_AREAS };
}

export function hubListVisibleCells(kind: HubListKind, width: number): string[] {
  const areas = hubListAreas(kind, width);
  if (kind === 'jobs') return ['identity', 'when', 'status', 'next'].map(key => areas[key]);
  return ['ref', 'customer', 'job', 'date', 'status', 'total', 'next'].map(key => areas[key]);
}

export function hubListLongTitleDoesNotStealNext(kind: HubListKind, title: string, width: number): boolean {
  void title;
  const areas = hubListAreas(kind, width);
  return areas.next === 'next';
}
