import { addDays, isWithinInterval } from 'date-fns';

/** Live `compliance_items` columns (migration 038). No type / expiry_date / assigned_to. */
export const COMPLIANCE_DEADLINES_SELECT = 'id, title, next_due_date, status' as const;

export const COMPLIANCE_DEADLINES_LOAD_ERROR = "Couldn't load compliance";
export const COMPLIANCE_DEADLINES_EMPTY = 'All compliant';

export type ComplianceDeadlineRow = {
  next_due_date?: unknown;
  status?: unknown;
};

export function splitComplianceDeadlines<T extends ComplianceDeadlineRow>(
  items: T[],
  now = new Date(),
): { upcoming: T[]; overdue: T[]; all: T[] } {
  const upcoming = items.filter(i => {
    const d = new Date(i.next_due_date as string);
    return isWithinInterval(d, { start: now, end: addDays(now, 30) });
  });
  const overdue = items.filter(i => {
    const d = new Date(i.next_due_date as string);
    return d.getTime() < now.getTime() && i.status !== 'completed';
  });
  return { upcoming, overdue, all: items };
}

export type ComplianceDeadlinesCardKind = 'loading' | 'error' | 'empty' | 'items';

export function complianceDeadlinesCardKind(opts: {
  isLoading: boolean;
  isError: boolean;
  overdueCount: number;
  upcomingCount: number;
}): ComplianceDeadlinesCardKind {
  if (opts.isError) return 'error';
  if (opts.isLoading) return 'loading';
  if (opts.overdueCount === 0 && opts.upcomingCount === 0) return 'empty';
  return 'items';
}

export function complianceDeadlinesCardCopy(kind: ComplianceDeadlinesCardKind): string {
  if (kind === 'error') return COMPLIANCE_DEADLINES_LOAD_ERROR;
  if (kind === 'loading') return 'Loading…';
  if (kind === 'empty') return COMPLIANCE_DEADLINES_EMPTY;
  return '';
}
